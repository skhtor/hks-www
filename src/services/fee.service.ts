import { PrismaClient, PricingRuleType } from '@prisma/client';

const prisma = new PrismaClient();

export interface CreatePricingRuleInput {
  name: string;
  type: PricingRuleType;
  classCountMin: number;
  classCountMax?: number;
  monthlyFee: number;
  termFee?: number;
  locationId?: string;
  priority: number;
  active?: boolean;
}

export interface UpdatePricingRuleInput {
  name?: string;
  type?: PricingRuleType;
  classCountMin?: number;
  classCountMax?: number;
  monthlyFee?: number;
  termFee?: number;
  locationId?: string;
  priority?: number;
  active?: boolean;
}

export class FeeService {
  /**
   * Creates a new pricing rule.
   * Requirements: 5.1, 5.2, 5.5, 22.2
   */
  async createPricingRule(data: CreatePricingRuleInput) {
    return prisma.pricingRule.create({
      data: {
        name: data.name,
        type: data.type,
        classCountMin: data.classCountMin,
        classCountMax: data.classCountMax ?? null,
        monthlyFee: data.monthlyFee,
        termFee: data.termFee ?? null,
        locationId: data.locationId ?? null,
        priority: data.priority,
        active: data.active ?? true,
      },
      include: { location: true },
    });
  }

  /**
   * Gets a pricing rule by ID.
   * Requirements: 22.1
   */
  async getPricingRule(id: string) {
    const rule = await prisma.pricingRule.findUnique({
      where: { id },
      include: { location: true },
    });

    if (!rule) {
      throw new Error('Pricing rule not found');
    }

    return rule;
  }

  /**
   * Updates a pricing rule.
   * Requirements: 5.5, 22.1
   */
  async updatePricingRule(id: string, data: UpdatePricingRuleInput) {
    const existing = await prisma.pricingRule.findUnique({ where: { id } });
    if (!existing) {
      throw new Error('Pricing rule not found');
    }

    return prisma.pricingRule.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.classCountMin !== undefined && { classCountMin: data.classCountMin }),
        ...(data.classCountMax !== undefined && { classCountMax: data.classCountMax }),
        ...(data.monthlyFee !== undefined && { monthlyFee: data.monthlyFee }),
        ...(data.termFee !== undefined && { termFee: data.termFee }),
        ...(data.locationId !== undefined && { locationId: data.locationId }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.active !== undefined && { active: data.active }),
      },
      include: { location: true },
    });
  }

  /**
   * Deletes a pricing rule.
   * Requirements: 22.1
   */
  async deletePricingRule(id: string) {
    const existing = await prisma.pricingRule.findUnique({
      where: { id },
      include: { classes: { take: 1 } },
    });

    if (!existing) {
      throw new Error('Pricing rule not found');
    }

    if (existing.classes.length > 0) {
      throw new Error('Cannot delete pricing rule that is assigned to classes');
    }

    await prisma.pricingRule.delete({ where: { id } });
  }

  /**
   * Lists all pricing rules, optionally filtering to active only.
   * Requirements: 22.1
   */
  async listPricingRules(activeOnly = false) {
    return prisma.pricingRule.findMany({
      where: activeOnly ? { active: true } : undefined,
      include: { location: true },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Finds the best matching pricing rule for a given class count and optional location.
   * Matching logic:
   *  1. Rule must be active
   *  2. classCount >= classCountMin
   *  3. classCount <= classCountMax (if set)
   *  4. locationId matches (if set on rule) or rule has no location restriction
   *  5. Among matches, prefer location-specific rules over generic ones,
   *     then sort by priority (lower = higher priority).
   * Requirements: 5.1, 5.2
   */
  async getApplicablePricingRule(classCount: number, locationId?: string) {
    const rules = await prisma.pricingRule.findMany({
      where: { active: true },
      include: { location: true },
      orderBy: [{ priority: 'asc' }],
    });

    const matching = rules.filter((rule) => {
      const meetsMin = classCount >= rule.classCountMin;
      const meetsMax = rule.classCountMax == null || classCount <= rule.classCountMax;
      const meetsLocation =
        rule.locationId == null || (locationId != null && rule.locationId === locationId);
      return meetsMin && meetsMax && meetsLocation;
    });

    if (matching.length === 0) {
      return null;
    }

    // Prefer location-specific rules over generic ones, then by priority
    const locationSpecific = matching.filter((r) => r.locationId != null);
    const generic = matching.filter((r) => r.locationId == null);

    return locationSpecific.length > 0 ? locationSpecific[0] : generic[0];
  }
}

export const feeService = new FeeService();
