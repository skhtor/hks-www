import fc from 'fast-check';
import { FeeService } from '../../services/fee.service';
import { PrismaClient, PricingRuleType, DiscountType } from '@prisma/client';

const prisma = new PrismaClient();
const feeService = new FeeService();

const PBT_DOMAIN = '@fee-pbt.test';

describe('FeeService Property-Based Tests', () => {
  const createdPricingRuleIds: string[] = [];
  const createdDiscountIds: string[] = [];

  afterAll(async () => {
    for (const id of createdDiscountIds) {
      try { await prisma.discountRule.delete({ where: { id } }); } catch { /* ignore */ }
    }
    for (const id of createdPricingRuleIds) {
      try { await prisma.pricingRule.delete({ where: { id } }); } catch { /* ignore */ }
    }
    await prisma.$disconnect();
  });

  async function createPricingRule(monthlyFee: number, classCountMin: number, classCountMax: number) {
    const rule = await prisma.pricingRule.create({
      data: {
        name: `pbt-rule-${Date.now()}-${Math.random()}${PBT_DOMAIN}`,
        type: PricingRuleType.PER_CLASS,
        classCountMin,
        classCountMax,
        monthlyFee,
        priority: 0,
        active: true,
      },
    });
    createdPricingRuleIds.push(rule.id);
    return rule;
  }

  async function createDiscount(type: DiscountType, value: number) {
    const rule = await prisma.discountRule.create({
      data: {
        name: `pbt-discount-${Date.now()}-${Math.random()}${PBT_DOMAIN}`,
        type,
        value,
        eligibilityCriteria: {},
        priority: 1,
        active: true,
      },
    });
    createdDiscountIds.push(rule.id);
    return rule;
  }

  /**
   * Property 10: Fee Calculation Determinism
   * For any valid input, calculateFee always returns the same result
   * when called multiple times with the same inputs.
   * Validates: Requirements 4.2, 5.1
   */
  describe('Property 10: Fee Calculation Determinism', () => {
    it('should return identical results for identical inputs', async () => {
      const rule = await createPricingRule(100, 1, 1);

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 50 }),
          async (oneTimeFee) => {
            const input = { classCount: 1, oneTimeFeeAmount: oneTimeFee };
            const result1 = await feeService.calculateFee(input);
            const result2 = await feeService.calculateFee(input);

            expect(result1.subtotal).toBe(result2.subtotal);
            expect(result1.gstAmount).toBe(result2.gstAmount);
            expect(result1.total).toBe(result2.total);
            expect(result1.discountAmount).toBe(result2.discountAmount);
          }
        ),
        { numRuns: 10 }
      );

      // cleanup
      await prisma.pricingRule.delete({ where: { id: rule.id } });
      createdPricingRuleIds.splice(createdPricingRuleIds.indexOf(rule.id), 1);
    });
  });

  /**
   * Property 15: Per-Class Pricing Calculation
   * For a PER_CLASS pricing rule with monthlyFee F, calculateFee returns
   * subtotal = F, gstAmount = F * 0.1, total = F * 1.1 (when no discounts).
   * Validates: Requirements 5.1, 5.2
   */
  describe('Property 15: Per-Class Pricing Calculation', () => {
    it('should calculate correct subtotal, GST, and total for per-class pricing', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Use a unique classCount per run to avoid rule collisions
          fc.integer({ min: 10, max: 50 }),
          fc.integer({ min: 50, max: 500 }),
          async (classCount, monthlyFee) => {
            const rule = await createPricingRule(monthlyFee, classCount, classCount);

            try {
              const result = await feeService.calculateFee({ classCount });

              expect(result.subtotal).toBe(monthlyFee);
              expect(result.discountAmount).toBe(0);
              expect(result.oneTimeFee).toBe(0);

              const expectedGst = Math.round(monthlyFee * 0.1 * 100) / 100;
              const expectedTotal = Math.round((monthlyFee + expectedGst) * 100) / 100;

              expect(result.gstAmount).toBe(expectedGst);
              expect(result.total).toBe(expectedTotal);
              // total = subtotal * 1.1
              expect(result.total).toBeCloseTo(monthlyFee * 1.1, 2);
            } finally {
              await prisma.pricingRule.delete({ where: { id: rule.id } });
              createdPricingRuleIds.splice(createdPricingRuleIds.indexOf(rule.id), 1);
            }
          }
        ),
        { numRuns: 5 }
      );
    });
  });

  /**
   * Property 16: Tiered Bundle Pricing
   * For a TIERED_BUNDLE rule covering a range [min, max], any classCount
   * within that range resolves to the same monthlyFee.
   * Validates: Requirements 5.2
   */
  describe('Property 16: Tiered Bundle Pricing', () => {
    it('should apply the same fee for any classCount within a tiered bundle range', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 100, max: 200 }), // monthlyFee
          async (monthlyFee) => {
            // Use a fixed range 60-69 to avoid collisions with other tests
            const rule = await prisma.pricingRule.create({
              data: {
                name: `pbt-tiered-${Date.now()}-${Math.random()}${PBT_DOMAIN}`,
                type: PricingRuleType.TIERED_BUNDLE,
                classCountMin: 60,
                classCountMax: 69,
                monthlyFee,
                priority: 0,
                active: true,
              },
            });
            createdPricingRuleIds.push(rule.id);

            try {
              // Any count in [60, 69] should yield the same fee
              const result60 = await feeService.calculateFee({ classCount: 60 });
              const result65 = await feeService.calculateFee({ classCount: 65 });
              const result69 = await feeService.calculateFee({ classCount: 69 });

              expect(result60.subtotal).toBe(monthlyFee);
              expect(result65.subtotal).toBe(monthlyFee);
              expect(result69.subtotal).toBe(monthlyFee);
            } finally {
              await prisma.pricingRule.delete({ where: { id: rule.id } });
              createdPricingRuleIds.splice(createdPricingRuleIds.indexOf(rule.id), 1);
            }
          }
        ),
        { numRuns: 5 }
      );
    });
  });

  /**
   * Property 17: Family Discount Application
   * For a FAMILY discount with percentage value P applied to a fee F,
   * the discount amount = round(F * P/100, 2) and total = (F - discount) * 1.1.
   * Validates: Requirements 5.3
   */
  describe('Property 17: Family Discount Application', () => {
    it('should correctly apply family discount percentage', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 5, max: 50 }),   // discount percentage
          fc.integer({ min: 100, max: 400 }), // monthly fee
          async (percentage, monthlyFee) => {
            const rule = await createPricingRule(monthlyFee, 70, 70);
            const discount = await createDiscount(DiscountType.FAMILY, percentage);

            try {
              const result = await feeService.calculateFee({
                classCount: 70,
                discountIds: [discount.id],
              });

              const expectedDiscount = Math.round(monthlyFee * (percentage / 100) * 100) / 100;
              const gstBase = monthlyFee - expectedDiscount;
              const expectedGst = Math.round(gstBase * 0.1 * 100) / 100;
              const expectedTotal = Math.round((gstBase + expectedGst) * 100) / 100;

              expect(result.subtotal).toBe(monthlyFee);
              expect(result.discountAmount).toBe(expectedDiscount);
              expect(result.gstAmount).toBe(expectedGst);
              expect(result.total).toBe(expectedTotal);
              expect(result.appliedDiscounts).toHaveLength(1);
              expect(result.appliedDiscounts[0].type).toBe(DiscountType.FAMILY);
            } finally {
              await prisma.pricingRule.delete({ where: { id: rule.id } });
              createdPricingRuleIds.splice(createdPricingRuleIds.indexOf(rule.id), 1);
              await prisma.discountRule.delete({ where: { id: discount.id } });
              createdDiscountIds.splice(createdDiscountIds.indexOf(discount.id), 1);
            }
          }
        ),
        { numRuns: 5 }
      );
    });
  });

  /**
   * Property 19: GST Calculation
   * For any fee calculation, gstAmount = round((subtotal - discountAmount + oneTimeFee) * 0.1, 2)
   * and total = (subtotal - discountAmount + oneTimeFee) + gstAmount.
   * Validates: Requirements 5.7
   */
  describe('Property 19: GST Calculation', () => {
    it('should always compute GST as 10% of the net amount and total correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 80, max: 300 }),  // monthly fee
          fc.integer({ min: 0, max: 100 }),   // one-time fee
          async (monthlyFee, oneTimeFee) => {
            const rule = await createPricingRule(monthlyFee, 80, 80);

            try {
              const result = await feeService.calculateFee({
                classCount: 80,
                oneTimeFeeAmount: oneTimeFee,
              });

              const gstBase = result.subtotal - result.discountAmount + result.oneTimeFee;
              const expectedGst = Math.round(gstBase * 0.1 * 100) / 100;
              const expectedTotal = Math.round((gstBase + expectedGst) * 100) / 100;

              // GST invariant: always 10% of net
              expect(result.gstAmount).toBe(expectedGst);
              // Total invariant: net + GST
              expect(result.total).toBe(expectedTotal);
              // Total is always >= subtotal (GST adds to it)
              expect(result.total).toBeGreaterThanOrEqual(result.subtotal);
              // Discount never makes total negative
              expect(result.total).toBeGreaterThanOrEqual(0);
            } finally {
              await prisma.pricingRule.delete({ where: { id: rule.id } });
              createdPricingRuleIds.splice(createdPricingRuleIds.indexOf(rule.id), 1);
            }
          }
        ),
        { numRuns: 10 }
      );
    });

  });

  /**
   * Property 18: Proration Calculation
   * For any start date after the billing cycle day, the prorated fee must be:
   *   - Less than the full monthly fee
   *   - Equal to (daysRemaining / daysInMonth) * monthlyFee, rounded to 2dp
   *   - Always > 0 when monthlyFee > 0
   * For start dates on or before the billing cycle day, full fee is charged.
   * Validates: Requirements 5.6
   */
  describe('Property 18: Proration Calculation', () => {
    it('should return full fee when start day <= billing cycle day', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 50, max: 500 }),  // monthlyFee
          fc.integer({ min: 1, max: 28 }),    // billingCycleDay
          fc.integer({ min: 2015, max: 2030 }), // year
          fc.integer({ min: 0, max: 11 }),    // month (0-indexed)
          (monthlyFee, billingCycleDay, year, month) => {
            // startDay <= billingCycleDay → full fee
            const startDay = Math.min(billingCycleDay, 28); // safe for all months
            const startDate = new Date(year, month, startDay);
            const result = feeService.calculateProration(monthlyFee, startDate, billingCycleDay);
            expect(result).toBe(Math.round(monthlyFee * 100) / 100);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should prorate correctly when start day > billing cycle day', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 50, max: 500 }),  // monthlyFee
          fc.integer({ min: 1, max: 15 }),    // billingCycleDay (keep low so startDay can exceed it)
          fc.integer({ min: 2015, max: 2030 }), // year
          fc.integer({ min: 0, max: 11 }),    // month
          (monthlyFee, billingCycleDay, year, month) => {
            // startDay > billingCycleDay — pick a day safely above it
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const startDay = Math.min(billingCycleDay + 5, daysInMonth);
            if (startDay <= billingCycleDay) return; // skip edge case

            const startDate = new Date(year, month, startDay);
            const result = feeService.calculateProration(monthlyFee, startDate, billingCycleDay);

            const daysRemaining = daysInMonth - startDay + 1;
            const expected = Math.round((daysRemaining / daysInMonth) * monthlyFee * 100) / 100;

            expect(result).toBe(expected);
            // Prorated fee must be less than full fee
            expect(result).toBeLessThan(monthlyFee);
            // Must be positive
            expect(result).toBeGreaterThan(0);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should always return a value between 0 and monthlyFee (inclusive)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }),  // monthlyFee
          fc.integer({ min: 1, max: 28 }),    // billingCycleDay
          fc.date({ min: new Date('2015-01-01'), max: new Date('2030-12-31') }),
          (monthlyFee, billingCycleDay, startDate) => {
            const result = feeService.calculateProration(monthlyFee, startDate, billingCycleDay);
            expect(result).toBeGreaterThan(0);
            expect(result).toBeLessThanOrEqual(monthlyFee);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 19: GST Calculation
   * For any fee calculation, gstAmount = round((subtotal - discountAmount + oneTimeFee) * 0.1, 2)
   * and total = (subtotal - discountAmount + oneTimeFee) + gstAmount.
   * Validates: Requirements 5.7
   */
  describe('Property 19: GST Calculation - discount clamping', () => {
    it('should never produce a negative total regardless of discount size', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 50, max: 200 }),  // monthly fee
          fc.integer({ min: 50, max: 500 }),  // fixed discount (may exceed fee)
          async (monthlyFee, discountValue) => {
            const rule = await createPricingRule(monthlyFee, 90, 90);
            const discount = await createDiscount(DiscountType.FIXED_AMOUNT, discountValue);

            try {
              const result = await feeService.calculateFee({
                classCount: 90,
                discountIds: [discount.id],
              });

              // Total must never be negative
              expect(result.total).toBeGreaterThanOrEqual(0);
              // Discount is clamped to subtotal
              expect(result.discountAmount).toBeLessThanOrEqual(result.subtotal);
            } finally {
              await prisma.pricingRule.delete({ where: { id: rule.id } });
              createdPricingRuleIds.splice(createdPricingRuleIds.indexOf(rule.id), 1);
              await prisma.discountRule.delete({ where: { id: discount.id } });
              createdDiscountIds.splice(createdDiscountIds.indexOf(discount.id), 1);
            }
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  /**
   * Property 40: Configuration Immediate Effect
   * After updating a pricing rule's monthlyFee, the next calculateFee call
   * must reflect the new fee immediately (no stale cache).
   * Validates: Requirements 22.6
   */
  describe('Property 40: Configuration Immediate Effect', () => {
    it('should reflect updated pricing rule fee immediately after update', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 100, max: 300 }), // original fee
          fc.integer({ min: 301, max: 600 }), // new fee (distinct range)
          async (originalFee, newFee) => {
            const rule = await createPricingRule(originalFee, 95, 95);

            try {
              const before = await feeService.calculateFee({ classCount: 95 });
              expect(before.subtotal).toBe(originalFee);

              await feeService.updatePricingRule(rule.id, { monthlyFee: newFee });

              const after = await feeService.calculateFee({ classCount: 95 });
              expect(after.subtotal).toBe(newFee);
            } finally {
              await prisma.pricingRule.delete({ where: { id: rule.id } });
              createdPricingRuleIds.splice(createdPricingRuleIds.indexOf(rule.id), 1);
            }
          }
        ),
        { numRuns: 5 }
      );
    });
  });
});
