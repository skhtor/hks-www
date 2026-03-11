import { PrismaClient, PricingRuleType, DiscountType } from '@prisma/client';
import { getRedisClient } from '../config/redis';

const prisma = new PrismaClient();

/**
 * Invalidates all timetable cache keys in Redis.
 * Called when pricing rules change to ensure immediate effect.
 * Requirements: 22.6
 */
async function invalidateTimetableCache(): Promise<void> {
  try {
    const redis = getRedisClient();
    if (!redis.isOpen) return;
    const keys = await redis.keys('timetable:*');
    if (keys.length > 0) {
      await redis.del(keys);
    }
  } catch {
    // Cache invalidation failure is non-fatal
  }
}

// ─── Fee Calculation Types ────────────────────────────────────────────────────

export interface CalculateFeeInput {
  classCount: number;
  locationId?: string;
  discountIds?: string[];
  oneTimeFeeAmount?: number;
}

export interface FeeLineItem {
  description: string;
  amount: number;
  type: 'base_fee' | 'discount' | 'one_time_fee' | 'gst';
}

export interface FeeCalculationResult {
  pricingRule: { id: string; name: string; type: string; monthlyFee: number } | null;
  appliedDiscounts: Array<{ id: string; name: string; type: string; amount: number }>;
  subtotal: number;
  discountAmount: number;
  oneTimeFee: number;
  gstAmount: number;
  total: number;
  lineItems: FeeLineItem[];
}

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

export interface CreateDiscountRuleInput {
  name: string;
  type: DiscountType;
  value: number;
  eligibilityCriteria: Record<string, unknown>;
  priority: number;
  active?: boolean;
  startDate?: Date;
  endDate?: Date;
}

export interface UpdateDiscountRuleInput {
  name?: string;
  type?: DiscountType;
  value?: number;
  eligibilityCriteria?: Record<string, unknown>;
  priority?: number;
  active?: boolean;
  startDate?: Date | null;
  endDate?: Date | null;
}

export interface CalculateFeeInput {
  classCount: number;
  locationId?: string;
  discountIds?: string[];
  oneTimeFeeAmount?: number;
}

export interface FeeLineItem {
  description: string;
  amount: number;
  type: 'base_fee' | 'discount' | 'one_time_fee' | 'gst';
}

export interface FeeCalculationResult {
  pricingRule: { id: string; name: string; type: string; monthlyFee: number } | null;
  appliedDiscounts: Array<{ id: string; name: string; type: string; amount: number }>;
  subtotal: number;
  discountAmount: number;
  oneTimeFee: number;
  gstAmount: number;
  total: number;
  lineItems: FeeLineItem[];
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

    const updated = await prisma.pricingRule.update({
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

    await invalidateTimetableCache();
    return updated;
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
    await invalidateTimetableCache();
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

  // ─── Discount Rule Methods ────────────────────────────────────────────────

  /**
   * Creates a new discount rule.
   * Requirements: 5.3, 5.4, 22.3
   */
  async createDiscountRule(data: CreateDiscountRuleInput) {
    return prisma.discountRule.create({
      data: {
        name: data.name,
        type: data.type,
        value: data.value,
        eligibilityCriteria: data.eligibilityCriteria as object,
        priority: data.priority,
        active: data.active ?? true,
        startDate: data.startDate ?? null,
        endDate: data.endDate ?? null,
      },
    });
  }

  /**
   * Gets a discount rule by ID.
   * Requirements: 22.3
   */
  async getDiscountRule(id: string) {
    const rule = await prisma.discountRule.findUnique({ where: { id } });
    if (!rule) {
      throw new Error('Discount rule not found');
    }
    return rule;
  }

  /**
   * Updates a discount rule.
   * Requirements: 22.3
   */
  async updateDiscountRule(id: string, data: UpdateDiscountRuleInput) {
    const existing = await prisma.discountRule.findUnique({ where: { id } });
    if (!existing) {
      throw new Error('Discount rule not found');
    }

    return prisma.discountRule.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.value !== undefined && { value: data.value }),
        ...(data.eligibilityCriteria !== undefined && { eligibilityCriteria: data.eligibilityCriteria as object }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.active !== undefined && { active: data.active }),
        ...(data.startDate !== undefined && { startDate: data.startDate }),
        ...(data.endDate !== undefined && { endDate: data.endDate }),
      },
    });
  }

  /**
   * Deletes a discount rule.
   * Requirements: 22.3
   */
  async deleteDiscountRule(id: string) {
    const existing = await prisma.discountRule.findUnique({ where: { id } });
    if (!existing) {
      throw new Error('Discount rule not found');
    }
    await prisma.discountRule.delete({ where: { id } });
  }

  /**
   * Lists all discount rules, optionally filtering to active only.
   * Requirements: 22.3
   */
  async listDiscountRules(activeOnly = false) {
    return prisma.discountRule.findMany({
      where: activeOnly ? { active: true } : undefined,
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Gets all currently active discount rules (active=true, within date range).
   * Requirements: 5.3, 5.4
   */
  async getActiveDiscounts() {
    const now = new Date();
    return prisma.discountRule.findMany({
      where: {
        active: true,
        OR: [{ startDate: null }, { startDate: { lte: now } }],
        AND: [{ OR: [{ endDate: null }, { endDate: { gte: now } }] }],
      },
      orderBy: [{ priority: 'asc' }],
    });
  }

  // ─── Fee Calculation Engine ───────────────────────────────────────────────

  /**
   * Calculates the total fee for a given enrolment scenario.
   * - Finds the applicable pricing rule
   * - Applies requested discounts (by ID) if active
   * - Adds one-time fees
   * - Calculates GST at 10%
   * Requirements: 5.1, 5.2, 5.3, 5.4, 5.7, 5.8
   */
  async calculateFee(input: CalculateFeeInput): Promise<FeeCalculationResult> {
    const { classCount, locationId, discountIds = [], oneTimeFeeAmount = 0 } = input;

    // 1. Find applicable pricing rule
    const pricingRule = await this.getApplicablePricingRule(classCount, locationId);

    if (!pricingRule) {
      throw new Error('No applicable pricing rule found for the given class count');
    }

    const subtotal = Number(pricingRule.monthlyFee);
    const lineItems: FeeLineItem[] = [
      {
        description: `${pricingRule.name} (${classCount} class${classCount !== 1 ? 'es' : ''})`,
        amount: subtotal,
        type: 'base_fee',
      },
    ];

    // 2. Apply discounts
    const appliedDiscounts: FeeCalculationResult['appliedDiscounts'] = [];
    let discountAmount = 0;

    if (discountIds.length > 0) {
      const now = new Date();

      for (const discountId of discountIds) {
        const discount = await prisma.discountRule.findUnique({ where: { id: discountId } });

        if (!discount || !discount.active) {
          continue;
        }

        // Check date range
        if (discount.startDate && discount.startDate > now) continue;
        if (discount.endDate && discount.endDate < now) continue;

        const discountValue = Number(discount.value);
        let amount = 0;

        if (discount.type === DiscountType.FIXED_AMOUNT) {
          amount = discountValue;
        } else {
          // PERCENTAGE, FAMILY, CONCESSION, TRIAL — all use value as a percentage
          amount = (subtotal * discountValue) / 100;
        }

        // Clamp so total discount doesn't exceed subtotal
        const remaining = subtotal - discountAmount;
        amount = Math.min(amount, remaining);

        if (amount <= 0) continue;

        discountAmount += amount;
        appliedDiscounts.push({
          id: discount.id,
          name: discount.name,
          type: discount.type,
          amount: Math.round(amount * 100) / 100,
        });

        lineItems.push({
          description: `Discount: ${discount.name}`,
          amount: -Math.round(amount * 100) / 100,
          type: 'discount',
        });
      }
    }

    // Ensure discount doesn't exceed subtotal
    discountAmount = Math.min(discountAmount, subtotal);
    discountAmount = Math.round(discountAmount * 100) / 100;

    // 3. One-time fee
    const oneTimeFee = Math.round((oneTimeFeeAmount ?? 0) * 100) / 100;
    if (oneTimeFee > 0) {
      lineItems.push({
        description: 'One-time fee',
        amount: oneTimeFee,
        type: 'one_time_fee',
      });
    }

    // 4. GST = 10% of (subtotal - discountAmount + oneTimeFee)
    const gstBase = subtotal - discountAmount + oneTimeFee;
    const gstAmount = Math.round(gstBase * 0.1 * 100) / 100;

    lineItems.push({
      description: 'GST (10%)',
      amount: gstAmount,
      type: 'gst',
    });

    // 5. Total
    const total = Math.round((gstBase + gstAmount) * 100) / 100;

    return {
      pricingRule: {
        id: pricingRule.id,
        name: pricingRule.name,
        type: pricingRule.type,
        monthlyFee: Number(pricingRule.monthlyFee),
      },
      appliedDiscounts,
      subtotal,
      discountAmount,
      oneTimeFee,
      gstAmount,
      total,
      lineItems,
    };
  }

  /**
   * Calculates a prorated fee for mid-cycle starts.
   * - If startDate day <= billingCycleDay: full month fee (already in cycle)
   * - If startDate day > billingCycleDay: prorate remaining days
   * Formula: (daysRemaining / daysInMonth) * monthlyFee, rounded to 2 dp
   * Requirements: 5.6
   */
  calculateProration(monthlyFee: number, startDate: Date, billingCycleDay: number): number {
    const startDay = startDate.getDate();

    if (startDay <= billingCycleDay) {
      // Start is on or before billing day — charge full month
      return Math.round(monthlyFee * 100) / 100;
    }

    // Days in the month of startDate
    const year = startDate.getFullYear();
    const month = startDate.getMonth(); // 0-indexed
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Days remaining from startDay to end of month (inclusive of startDay)
    const daysRemaining = daysInMonth - startDay + 1;

    const prorated = (daysRemaining / daysInMonth) * monthlyFee;
    return Math.round(prorated * 100) / 100;
  }
}

export const feeService = new FeeService();
