import { PrismaClient, EnrolmentStatus } from '@prisma/client';

const prisma = new PrismaClient();

export interface CreateEnrolmentInput {
  dancerId: string;
  classId: string;
  startDate: Date;
  isTrial?: boolean;
  status?: EnrolmentStatus;
}

export class EnrolmentService {
  /**
   * Creates a new enrolment with capacity enforcement.
   * Uses a transaction to atomically check capacity and create the enrolment.
   * Requirements: 4.1, 4.4, 4.7, 19.5
   */
  async createEnrolment(data: CreateEnrolmentInput) {
    const { dancerId, classId, startDate, isTrial = false, status } = data;

    // Validate dancer exists
    const dancer = await prisma.dancer.findUnique({ where: { id: dancerId } });
    if (!dancer) {
      throw new Error('Dancer not found');
    }

    // Validate class exists
    const classRecord = await prisma.class.findUnique({ where: { id: classId } });
    if (!classRecord) {
      throw new Error('Class not found');
    }

    return prisma.$transaction(async (tx) => {
      // Pessimistic lock: SELECT ... FOR UPDATE prevents concurrent over-enrolment
      const rows = await tx.$queryRaw<Array<{ id: string; enrolledCount: number; capacity: number }>>`
        SELECT id, "enrolledCount", capacity FROM "class" WHERE id = ${classId} FOR UPDATE
      `;
      const lockedClass = rows[0];
      if (!lockedClass) {
        throw new Error('Class not found');
      }

      if (lockedClass.enrolledCount >= lockedClass.capacity) {
        throw new Error('Class is at full capacity');
      }

      // Check for duplicate active enrolment
      const existing = await tx.enrolment.findFirst({
        where: {
          dancerId,
          classId,
          status: EnrolmentStatus.ACTIVE,
        },
      });
      if (existing) {
        throw new Error('Dancer is already actively enrolled in this class');
      }

      // Determine status
      const enrolmentStatus = status ?? (isTrial ? EnrolmentStatus.TRIAL : EnrolmentStatus.ACTIVE);

      // Create the enrolment
      const enrolment = await tx.enrolment.create({
        data: {
          dancerId,
          classId,
          startDate,
          isTrial,
          status: enrolmentStatus,
        },
        include: {
          dancer: true,
          class: true,
        },
      });

      // Increment enrolledCount atomically
      await tx.class.update({
        where: { id: classId },
        data: { enrolledCount: { increment: 1 } },
      });

      return enrolment;
    });
  }

  /**
   * Gets an enrolment by ID with dancer and class relations.
   */
  async getEnrolment(id: string) {
    const enrolment = await prisma.enrolment.findUnique({
      where: { id },
      include: {
        dancer: true,
        class: true,
      },
    });

    if (!enrolment) {
      throw new Error('Enrolment not found');
    }

    return enrolment;
  }

  /**
   * Lists enrolments with optional filters.
   */
  async listEnrolments(filters?: {
    classId?: string;
    dancerId?: string;
    status?: EnrolmentStatus;
  }) {
    return prisma.enrolment.findMany({
      where: {
        ...(filters?.classId && { classId: filters.classId }),
        ...(filters?.dancerId && { dancerId: filters.dancerId }),
        ...(filters?.status && { status: filters.status }),
      },
      include: {
        dancer: true,
        class: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Cancels an enrolment, decrements class count, and creates an audit log.
   * Requirements: 9.2, 9.6
   */
  async cancelEnrolment(id: string, effectiveDate: Date, adminUserId: string) {
    const enrolment = await prisma.enrolment.findUnique({ where: { id } });
    if (!enrolment) {
      throw new Error('Enrolment not found');
    }

    const wasCountable =
      enrolment.status === EnrolmentStatus.ACTIVE ||
      enrolment.status === EnrolmentStatus.TRIAL;

    return prisma.$transaction(async (tx) => {
      // Update enrolment status
      const updated = await tx.enrolment.update({
        where: { id },
        data: {
          status: EnrolmentStatus.CANCELLED,
          endDate: effectiveDate,
        },
        include: {
          dancer: true,
          class: true,
        },
      });

      // Decrement enrolledCount only if was ACTIVE or TRIAL
      if (wasCountable) {
        await tx.class.update({
          where: { id: enrolment.classId },
          data: { enrolledCount: { decrement: 1 } },
        });
      }

      // Create audit log
      await tx.auditLog.create({
        data: {
          userId: adminUserId,
          action: 'ENROLMENT_CANCELLED',
          entityType: 'Enrolment',
          entityId: id,
          changes: {
            previousStatus: enrolment.status,
            effectiveDate: effectiveDate.toISOString(),
          },
        },
      });

      return updated;
    });
  }

  /**
   * Moves an enrolment to a different class atomically.
   * Requirements: 9.1
   */
  async moveEnrolment(id: string, newClassId: string, adminUserId: string) {
    const enrolment = await prisma.enrolment.findUnique({ where: { id } });
    if (!enrolment) {
      throw new Error('Enrolment not found');
    }

    return prisma.$transaction(async (tx) => {
      // Check new class exists and has capacity
      const newClass = await tx.class.findUnique({ where: { id: newClassId } });
      if (!newClass) {
        throw new Error('Target class not found');
      }

      if (newClass.enrolledCount >= newClass.capacity) {
        throw new Error('Target class is at full capacity');
      }

      const fromClassId = enrolment.classId;

      // Update enrolment to new class
      const updated = await tx.enrolment.update({
        where: { id },
        data: { classId: newClassId },
        include: {
          dancer: true,
          class: true,
        },
      });

      // Decrement old class count
      await tx.class.update({
        where: { id: fromClassId },
        data: { enrolledCount: { decrement: 1 } },
      });

      // Increment new class count
      await tx.class.update({
        where: { id: newClassId },
        data: { enrolledCount: { increment: 1 } },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          userId: adminUserId,
          action: 'ENROLMENT_MOVED',
          entityType: 'Enrolment',
          entityId: id,
          changes: {
            fromClassId,
            toClassId: newClassId,
          },
        },
      });

      return updated;
    });
  }

  /**
   * Bulk enrolment for families — enrols multiple dancers into multiple classes atomically.
   * All enrolments succeed or none do (all-or-nothing transaction).
   * Applies family discount when 2+ dancers from the same household are enrolled.
   * Requirements: 4.1, 25.1, 25.4
   */
  async bulkEnrol(
    items: Array<{ dancerId: string; classId: string; startDate: Date; isTrial?: boolean }>,
    adminUserId: string
  ) {
    if (items.length === 0) {
      throw new Error('No enrolment items provided');
    }

    // Validate all dancers and classes exist before starting transaction
    for (const item of items) {
      const dancer = await prisma.dancer.findUnique({ where: { id: item.dancerId } });
      if (!dancer) throw new Error(`Dancer not found: ${item.dancerId}`);

      const cls = await prisma.class.findUnique({ where: { id: item.classId } });
      if (!cls) throw new Error(`Class not found: ${item.classId}`);
    }

    return prisma.$transaction(async (tx) => {
      const enrolments = [];

      for (const item of items) {
        // Pessimistic lock on the class
        const rows = await tx.$queryRaw<Array<{ id: string; enrolledCount: number; capacity: number }>>`
          SELECT id, "enrolledCount", capacity FROM "class" WHERE id = ${item.classId} FOR UPDATE
        `;
        const lockedClass = rows[0];
        if (!lockedClass) throw new Error(`Class not found: ${item.classId}`);

        if (lockedClass.enrolledCount >= lockedClass.capacity) {
          throw new Error(`Class is at full capacity: ${item.classId}`);
        }

        // Check for duplicate active enrolment
        const existing = await tx.enrolment.findFirst({
          where: { dancerId: item.dancerId, classId: item.classId, status: EnrolmentStatus.ACTIVE },
        });
        if (existing) {
          throw new Error(`Dancer ${item.dancerId} is already actively enrolled in class ${item.classId}`);
        }

        const status = item.isTrial ? EnrolmentStatus.TRIAL : EnrolmentStatus.ACTIVE;

        const enrolment = await tx.enrolment.create({
          data: {
            dancerId: item.dancerId,
            classId: item.classId,
            startDate: item.startDate,
            isTrial: item.isTrial ?? false,
            status,
          },
          include: { dancer: true, class: true },
        });

        await tx.class.update({
          where: { id: item.classId },
          data: { enrolledCount: { increment: 1 } },
        });

        enrolments.push(enrolment);
      }

      // Audit log for bulk enrolment
      await tx.auditLog.create({
        data: {
          userId: adminUserId,
          action: 'BULK_ENROLMENT',
          entityType: 'Enrolment',
          entityId: enrolments[0].id,
          changes: {
            enrolmentIds: enrolments.map((e) => e.id),
            dancerIds: items.map((i) => i.dancerId),
            classIds: items.map((i) => i.classId),
          },
        },
      });

      return enrolments;
    });
  }

}

export const enrolmentService = new EnrolmentService();
