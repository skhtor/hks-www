import { PrismaClient, EnrolmentStatus } from '@prisma/client';

const prisma = new PrismaClient();

// Maximum number of trials a dancer can have per class
const MAX_TRIALS_PER_CLASS = 1;

export class TrialService {
  /**
   * Creates a trial booking for a dancer in a class.
   * Enforces trial limits per dancer/class.
   * Requirements: 16.1, 16.2, 16.5
   */
  async createTrialBooking(dancerId: string, classId: string, trialDate: Date) {
    const dancer = await prisma.dancer.findUnique({ where: { id: dancerId } });
    if (!dancer) throw new Error('Dancer not found');

    const cls = await prisma.class.findUnique({ where: { id: classId } });
    if (!cls) throw new Error('Class not found');

    // Enforce trial limit: dancer cannot have more than MAX_TRIALS_PER_CLASS trials for this class
    const existingTrials = await prisma.enrolment.count({
      where: {
        dancerId,
        classId,
        isTrial: true,
      },
    });
    if (existingTrials >= MAX_TRIALS_PER_CLASS) {
      throw new Error(
        `Dancer has already used their trial for this class (limit: ${MAX_TRIALS_PER_CLASS})`
      );
    }

    // Check dancer is not already actively enrolled
    const activeEnrolment = await prisma.enrolment.findFirst({
      where: { dancerId, classId, status: EnrolmentStatus.ACTIVE },
    });
    if (activeEnrolment) throw new Error('Dancer is already enrolled in this class');

    return prisma.$transaction(async (tx) => {
      // Check capacity (trials count toward capacity)
      const rows = await tx.$queryRaw<Array<{ id: string; enrolledCount: number; capacity: number }>>`
        SELECT id, "enrolledCount", capacity FROM "class" WHERE id = ${classId} FOR UPDATE
      `;
      const lockedClass = rows[0];
      if (!lockedClass) throw new Error('Class not found');

      if (lockedClass.enrolledCount >= lockedClass.capacity) {
        throw new Error('Class is at full capacity');
      }

      const enrolment = await tx.enrolment.create({
        data: {
          dancerId,
          classId,
          startDate: trialDate,
          endDate: trialDate, // single-session trial
          isTrial: true,
          status: EnrolmentStatus.TRIAL,
        },
        include: { dancer: true, class: true },
      });

      await tx.class.update({
        where: { id: classId },
        data: { enrolledCount: { increment: 1 } },
      });

      return enrolment;
    });
  }

  /**
   * Converts a trial enrolment to a full active enrolment.
   * Requirements: 16.3, 16.4
   */
  async convertTrialToEnrolment(enrolmentId: string, startDate: Date, adminUserId: string) {
    const enrolment = await prisma.enrolment.findUnique({
      where: { id: enrolmentId },
      include: { dancer: true, class: true },
    });
    if (!enrolment) throw new Error('Enrolment not found');
    if (!enrolment.isTrial) throw new Error('Enrolment is not a trial');
    if (enrolment.status !== EnrolmentStatus.TRIAL) {
      throw new Error('Trial enrolment is not in TRIAL status');
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.enrolment.update({
        where: { id: enrolmentId },
        data: {
          status: EnrolmentStatus.ACTIVE,
          isTrial: false,
          startDate,
          endDate: null,
        },
        include: { dancer: true, class: true },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          userId: adminUserId,
          action: 'TRIAL_CONVERTED',
          entityType: 'Enrolment',
          entityId: enrolmentId,
          changes: {
            previousStatus: EnrolmentStatus.TRIAL,
            newStatus: EnrolmentStatus.ACTIVE,
            startDate: startDate.toISOString(),
          },
        },
      });

      return updated;
    });
  }

  /**
   * Lists all trial bookings for a dancer.
   */
  async getTrialsByDancer(dancerId: string) {
    return prisma.enrolment.findMany({
      where: { dancerId, isTrial: true },
      include: { dancer: true, class: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Lists all trial bookings for a class.
   */
  async getTrialsByClass(classId: string) {
    return prisma.enrolment.findMany({
      where: { classId, isTrial: true },
      include: { dancer: true, class: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export const trialService = new TrialService();
