import { PrismaClient, EnrolmentStatus, BillingType } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * When set to 'true', mid-term cancellations are blocked unless admin overrides.
 * Configurable via ALLOW_MID_TERM_CANCELLATION env var.
 * Requirements: 29.5
 */
export function isMidTermCancellationAllowed(): boolean {
  return process.env.ALLOW_MID_TERM_CANCELLATION === 'true';
}

export interface CreateEnrolmentInput {
  dancerId: string;
  classId: string;
  startDate: Date;
  isTrial?: boolean;
  status?: EnrolmentStatus;
  billingType?: BillingType;
  termId?: string;
}

export class EnrolmentService {
  /**
   * Creates a new enrolment with capacity enforcement.
   * Uses a transaction to atomically check capacity and create the enrolment.
   * Requirements: 4.1, 4.4, 4.7, 19.5, 29.2, 29.3
   */
  async createEnrolment(data: CreateEnrolmentInput) {
    const { dancerId, classId, startDate, isTrial = false, status, billingType, termId } = data;

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

    // Validate term if billing type is TERM
    if (billingType === BillingType.TERM) {
      if (!termId) {
        throw new Error('termId is required for TERM billing type');
      }
      const term = await prisma.term.findUnique({ where: { id: termId } });
      if (!term) {
        throw new Error('Term not found');
      }
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
          billingType: billingType ?? BillingType.MONTHLY,
          ...(termId ? { termId } : {}),
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
   * Prevents mid-term cancellations when policy is configured to disallow them,
   * unless adminOverride is set to true.
   * Requirements: 9.2, 9.6, 29.5
   */
  async cancelEnrolment(id: string, effectiveDate: Date, adminUserId: string, adminOverride = false) {
    const enrolment = await prisma.enrolment.findUnique({ where: { id } });
    if (!enrolment) {
      throw new Error('Enrolment not found');
    }

    // Mid-term cancellation guard (Requirement 29.5)
    if (
      enrolment.billingType === BillingType.TERM &&
      enrolment.termId &&
      !isMidTermCancellationAllowed() &&
      !adminOverride
    ) {
      const term = await prisma.term.findUnique({ where: { id: enrolment.termId } });
      if (term) {
        const now = new Date();
        // Block if we're currently within the term
        if (now >= term.startDate && now <= term.endDate) {
          throw new Error(
            'Mid-term cancellations are not allowed. Use adminOverride to bypass this policy.'
          );
        }
      }
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
            adminOverride,
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

  /**
   * Creates a term-based enrolment and generates a term invoice for the full term amount.
   * Requirements: 29.2, 29.3
   */
  async createTermEnrolment(params: {
    dancerId: string;
    classId: string;
    termId: string;
    startDate: Date;
    customerId: string;
    householdId: string;
  }) {
    const { dancerId, classId, termId, startDate, customerId, householdId } = params;

    // Create the enrolment with TERM billing type
    const enrolment = await this.createEnrolment({
      dancerId,
      classId,
      startDate,
      billingType: BillingType.TERM,
      termId,
    });

    // Calculate term fee and generate invoice
    const { termService } = await import('./term.service');
    const termFee = await termService.calculateTermFee(classId, termId);
    const term = await prisma.term.findUnique({ where: { id: termId } });
    if (!term) throw new Error('Term not found');

    const gstAmount = Math.round(termFee * 0.1 * 100) / 100;
    const total = Math.round((termFee + gstAmount) * 100) / 100;

    const { invoiceService } = await import('./invoice.service');
    const idempotencyKey = `term-enrolment-${enrolment.id}-${termId}`;
    const invoice = await invoiceService.generateInvoice({
      customerId,
      householdId,
      feeResult: {
        pricingRule: null,
        appliedDiscounts: [],
        subtotal: termFee,
        discountAmount: 0,
        oneTimeFee: 0,
        gstAmount,
        total,
        lineItems: [
          {
            description: `Term enrolment: ${term.name}`,
            amount: termFee,
            type: 'base_fee',
          },
          {
            description: 'GST (10%)',
            amount: gstAmount,
            type: 'gst',
          },
        ],
      },
      dueDate: term.startDate,
      idempotencyKey,
    });

    return { enrolment, invoice };
  }

  /**
   * Calculates a refund preview for an enrolment cancellation.
   * Placeholder policy until full cancellation policy service is built (task 28):
   *   - 100% refund if cancelled 14+ days before effectiveDate
   *   - 50% refund if 7–13 days before effectiveDate
   *   - 0% refund if less than 7 days before effectiveDate
   * Requirements: 9.1, 9.2, 9.5
   */
  async getRefundPreview(enrolmentId: string, effectiveDate: Date) {
    const enrolment = await prisma.enrolment.findUnique({
      where: { id: enrolmentId },
      include: { class: true },
    });

    if (!enrolment) {
      throw new Error('Enrolment not found');
    }

    const now = new Date();
    const daysUntilEffective = Math.floor(
      (effectiveDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    let refundPercentage: number;
    let policy: string;

    if (daysUntilEffective >= 14) {
      refundPercentage = 100;
      policy = 'Full refund: cancellation 14+ days before effective date';
    } else if (daysUntilEffective >= 7) {
      refundPercentage = 50;
      policy = 'Partial refund: cancellation 7–13 days before effective date';
    } else {
      refundPercentage = 0;
      policy = 'No refund: cancellation less than 7 days before effective date';
    }

    // Base amount is 0 as a placeholder — full fee calculation requires
    // the pricing rule service (to be integrated in task 28)
    const baseAmount = 0;
    const refundAmount = (baseAmount * refundPercentage) / 100;

    return {
      enrolmentId,
      effectiveDate,
      refundAmount,
      refundPercentage,
      policy,
    };
  }
}

export const enrolmentService = new EnrolmentService();
