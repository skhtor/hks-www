import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface CreateTermInput {
  name: string;
  startDate: Date | string;
  endDate: Date | string;
  termFeeMultiplier?: number;
  isActive?: boolean;
}

export interface UpdateTermInput {
  name?: string;
  startDate?: Date | string;
  endDate?: Date | string;
  termFeeMultiplier?: number | null;
  isActive?: boolean;
}

export interface TermPricingOptions {
  classId: string;
  monthlyFee: number;
  termFee: number | null;
  termId: string | null;
  termName: string | null;
  termStartDate: Date | null;
  termEndDate: Date | null;
  termWeeks: number | null;
}

export class TermService {
  /**
   * Creates a new term.
   * Requirements: 8.7, 29.1
   */
  async createTerm(input: CreateTermInput) {
    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);

    if (endDate <= startDate) {
      throw new Error('End date must be after start date');
    }

    return prisma.term.create({
      data: {
        name: input.name,
        startDate,
        endDate,
        termFeeMultiplier: input.termFeeMultiplier ?? null,
        isActive: input.isActive ?? true,
      },
    });
  }

  /**
   * Returns all terms, ordered by start date descending.
   * Requirements: 8.7, 29.1
   */
  async getAllTerms(activeOnly?: boolean) {
    return prisma.term.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { startDate: 'desc' },
    });
  }

  /**
   * Returns a single term by ID.
   * Requirements: 8.7, 29.1
   */
  async getTermById(id: string) {
    const term = await prisma.term.findUnique({ where: { id } });
    if (!term) {
      throw new Error('Term not found');
    }
    return term;
  }

  /**
   * Updates a term.
   * Requirements: 8.7, 29.1
   */
  async updateTerm(id: string, input: UpdateTermInput) {
    const existing = await prisma.term.findUnique({ where: { id } });
    if (!existing) {
      throw new Error('Term not found');
    }

    const startDate = input.startDate ? new Date(input.startDate) : existing.startDate;
    const endDate = input.endDate ? new Date(input.endDate) : existing.endDate;

    if (endDate <= startDate) {
      throw new Error('End date must be after start date');
    }

    return prisma.term.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.startDate !== undefined && { startDate }),
        ...(input.endDate !== undefined && { endDate }),
        ...(input.termFeeMultiplier !== undefined && { termFeeMultiplier: input.termFeeMultiplier }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });
  }

  /**
   * Deletes a term.
   * Requirements: 8.7, 29.1
   */
  async deleteTerm(id: string) {
    const term = await prisma.term.findUnique({ where: { id } });
    if (!term) {
      throw new Error('Term not found');
    }
    await prisma.term.delete({ where: { id } });
  }

  /**
   * Returns the currently active term (if any) based on today's date.
   * Requirements: 8.7, 29.1
   */
  async getCurrentTerm() {
    const now = new Date();
    return prisma.term.findFirst({
      where: {
        isActive: true,
        startDate: { lte: now },
        endDate: { gte: now },
      },
      orderBy: { startDate: 'desc' },
    });
  }

  /**
   * Calculates the term fee for a class in a given term.
   * Uses the term's termFeeMultiplier applied to the class's pricing rule monthlyFee,
   * or falls back to the pricing rule's explicit termFee if set.
   * Requirements: 29.2
   */
  async calculateTermFee(classId: string, termId: string): Promise<number> {
    const cls = await prisma.class.findUnique({
      where: { id: classId },
      include: { pricingRule: true },
    });
    if (!cls) throw new Error('Class not found');

    const term = await prisma.term.findUnique({ where: { id: termId } });
    if (!term) throw new Error('Term not found');

    const monthlyFee = Number(cls.pricingRule.monthlyFee);

    // If the pricing rule has an explicit termFee, use it
    if (cls.pricingRule.termFee !== null) {
      return Number(cls.pricingRule.termFee);
    }

    // Otherwise apply the term's multiplier to the monthly fee
    if (term.termFeeMultiplier !== null) {
      const multiplier = Number(term.termFeeMultiplier);
      return Math.round(monthlyFee * multiplier * 100) / 100;
    }

    // Fallback: calculate weeks in term and multiply monthly fee proportionally
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const weeks = Math.round(
      (term.endDate.getTime() - term.startDate.getTime()) / msPerWeek
    );
    const monthsEquivalent = weeks / 4;
    return Math.round(monthlyFee * monthsEquivalent * 100) / 100;
  }

  /**
   * Returns both monthly and term pricing options for a class.
   * Uses the current or next active term if available.
   * Requirements: 29.1, 29.2
   */
  async getTermPricingOptions(classId: string): Promise<TermPricingOptions> {
    const cls = await prisma.class.findUnique({
      where: { id: classId },
      include: { pricingRule: true },
    });
    if (!cls) throw new Error('Class not found');

    const monthlyFee = Number(cls.pricingRule.monthlyFee);

    // Find the current or next active term
    const now = new Date();
    const term = await prisma.term.findFirst({
      where: {
        isActive: true,
        endDate: { gte: now },
      },
      orderBy: { startDate: 'asc' },
    });

    if (!term) {
      return {
        classId,
        monthlyFee,
        termFee: null,
        termId: null,
        termName: null,
        termStartDate: null,
        termEndDate: null,
        termWeeks: null,
      };
    }

    const termFee = await this.calculateTermFee(classId, term.id);
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const termWeeks = Math.round(
      (term.endDate.getTime() - term.startDate.getTime()) / msPerWeek
    );

    return {
      classId,
      monthlyFee,
      termFee,
      termId: term.id,
      termName: term.name,
      termStartDate: term.startDate,
      termEndDate: term.endDate,
      termWeeks,
    };
  }

  /**
   * Sends term-end notifications to all customers with active term-based enrolments
   * for the given term. Notifies them about re-enrolment for the next term.
   * Requirements: 29.4
   */
  async sendTermEndNotifications(termId: string): Promise<{ notified: number; errors: string[] }> {
    const term = await prisma.term.findUnique({ where: { id: termId } });
    if (!term) throw new Error('Term not found');

    // Find all active term-based enrolments for this term
    const enrolments = await prisma.enrolment.findMany({
      where: {
        termId,
        status: 'ACTIVE',
        billingType: 'TERM',
      },
      include: {
        dancer: {
          include: {
            household: {
              include: {
                customers: {
                  include: { user: true },
                },
              },
            },
          },
        },
        class: true,
      },
    });

    // Collect unique customer IDs to avoid duplicate notifications
    const notifiedCustomers = new Set<string>();
    const errors: string[] = [];
    let notified = 0;

    // Import notification service lazily to avoid circular deps
    const { notificationService } = await import('./notification.service');

    for (const enrolment of enrolments) {
      const customers = enrolment.dancer.household.customers;
      for (const customer of customers) {
        if (notifiedCustomers.has(customer.id)) continue;
        notifiedCustomers.add(customer.id);
        try {
          await notificationService.sendTermReminder(customer.id, term.name, term.endDate);
          notified++;
        } catch (err) {
          errors.push(
            `Failed to notify customer ${customer.id}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    return { notified, errors };
  }
}

export const termService = new TermService();
