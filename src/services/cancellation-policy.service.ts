import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface CreateCancellationPolicyInput {
  name: string;
  noticePeriodDays: number;
  refundPercentage: number;
  isDefault?: boolean;
  isActive?: boolean;
}

export interface UpdateCancellationPolicyInput {
  name?: string;
  noticePeriodDays?: number;
  refundPercentage?: number;
  isDefault?: boolean;
  isActive?: boolean;
}

export class CancellationPolicyService {
  /**
   * Creates a new cancellation policy.
   * If isDefault is true, clears the default flag from all other policies first.
   * Requirements: 26.1
   */
  async createPolicy(input: CreateCancellationPolicyInput) {
    this.validateRefundPercentage(input.refundPercentage);
    this.validateNoticePeriod(input.noticePeriodDays);

    return prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.cancellationPolicy.updateMany({
          where: { isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.cancellationPolicy.create({
        data: {
          name: input.name,
          noticePeriodDays: input.noticePeriodDays,
          refundPercentage: input.refundPercentage,
          isDefault: input.isDefault ?? false,
          isActive: input.isActive ?? true,
        },
      });
    });
  }

  /**
   * Returns all cancellation policies, ordered by notice period.
   * Requirements: 26.1
   */
  async listPolicies(activeOnly = false) {
    return prisma.cancellationPolicy.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { noticePeriodDays: 'asc' },
    });
  }

  /**
   * Returns a single cancellation policy by ID.
   * Requirements: 26.1
   */
  async getPolicy(id: string) {
    const policy = await prisma.cancellationPolicy.findUnique({ where: { id } });
    if (!policy) {
      throw new Error('Cancellation policy not found');
    }
    return policy;
  }

  /**
   * Returns the default cancellation policy, if one is configured.
   * Requirements: 26.1
   */
  async getDefaultPolicy() {
    return prisma.cancellationPolicy.findFirst({
      where: { isDefault: true, isActive: true },
    });
  }

  /**
   * Updates a cancellation policy.
   * If isDefault is set to true, clears the default flag from all other policies.
   * Requirements: 26.1
   */
  async updatePolicy(id: string, input: UpdateCancellationPolicyInput) {
    const existing = await prisma.cancellationPolicy.findUnique({ where: { id } });
    if (!existing) {
      throw new Error('Cancellation policy not found');
    }

    if (input.refundPercentage !== undefined) {
      this.validateRefundPercentage(input.refundPercentage);
    }
    if (input.noticePeriodDays !== undefined) {
      this.validateNoticePeriod(input.noticePeriodDays);
    }

    return prisma.$transaction(async (tx) => {
      if (input.isDefault === true) {
        await tx.cancellationPolicy.updateMany({
          where: { isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }

      return tx.cancellationPolicy.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.noticePeriodDays !== undefined && { noticePeriodDays: input.noticePeriodDays }),
          ...(input.refundPercentage !== undefined && { refundPercentage: input.refundPercentage }),
          ...(input.isDefault !== undefined && { isDefault: input.isDefault }),
          ...(input.isActive !== undefined && { isActive: input.isActive }),
        },
      });
    });
  }

  /**
   * Deletes a cancellation policy.
   * Requirements: 26.1
   */
  async deletePolicy(id: string) {
    const existing = await prisma.cancellationPolicy.findUnique({ where: { id } });
    if (!existing) {
      throw new Error('Cancellation policy not found');
    }

    await prisma.cancellationPolicy.delete({ where: { id } });
  }

  /**
   * Calculates the refund amount for a given policy and base amount.
   * Selects the best matching policy based on days notice provided.
   * Requirements: 26.1, 26.2
   */
  async calculateRefund(daysNotice: number, baseAmount: number): Promise<{
    refundPercentage: number;
    refundAmount: number;
    policyName: string;
  }> {
    // Find the most generous applicable policy (highest refund % where notice >= required)
    const policies = await prisma.cancellationPolicy.findMany({
      where: { isActive: true, noticePeriodDays: { lte: daysNotice } },
      orderBy: { refundPercentage: 'desc' },
    });

    if (policies.length === 0) {
      return { refundPercentage: 0, refundAmount: 0, policyName: 'No applicable policy' };
    }

    const best = policies[0];
    const refundPercentage = Number(best.refundPercentage);
    const refundAmount = Math.round((baseAmount * refundPercentage) / 100 * 100) / 100;

    return {
      refundPercentage,
      refundAmount,
      policyName: best.name,
    };
  }

  private validateRefundPercentage(value: number) {
    if (value < 0 || value > 100) {
      throw new Error('Refund percentage must be between 0 and 100');
    }
  }

  private validateNoticePeriod(value: number) {
    if (value < 0) {
      throw new Error('Notice period days must be a non-negative integer');
    }
  }
}

export const cancellationPolicyService = new CancellationPolicyService();
