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
}

export const termService = new TermService();
