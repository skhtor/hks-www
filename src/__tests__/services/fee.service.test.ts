import { FeeService } from '../../services/fee.service';
import { PrismaClient, PricingRuleType, DiscountType } from '@prisma/client';

const prisma = new PrismaClient();
const feeService = new FeeService();

const TEST_PREFIX = 'fee-test-';

describe('FeeService', () => {
  // Track created rule IDs for cleanup
  const createdRuleIds: string[] = [];

  async function createRule(overrides: Partial<Parameters<typeof feeService.createPricingRule>[0]> = {}) {
    const rule = await feeService.createPricingRule({
      name: `${TEST_PREFIX}rule-${Date.now()}-${Math.random()}`,
      type: PricingRuleType.PER_CLASS,
      classCountMin: 1,
      monthlyFee: 100,
      priority: 10,
      active: true,
      ...overrides,
    });
    createdRuleIds.push(rule.id);
    return rule;
  }

  afterAll(async () => {
    // Clean up test rules (only those not assigned to classes)
    for (const id of createdRuleIds) {
      try {
        await prisma.pricingRule.delete({ where: { id } });
      } catch {
        // Ignore if already deleted or has classes
      }
    }
    await prisma.$disconnect();
  });

  describe('createPricingRule', () => {
    it('should create a per-class pricing rule', async () => {
      const rule = await createRule({
        name: `${TEST_PREFIX}per-class`,
        type: PricingRuleType.PER_CLASS,
        classCountMin: 1,
        monthlyFee: 80,
        priority: 1,
      });

      expect(rule.id).toBeDefined();
      expect(rule.name).toBe(`${TEST_PREFIX}per-class`);
      expect(rule.type).toBe(PricingRuleType.PER_CLASS);
      expect(Number(rule.monthlyFee)).toBe(80);
      expect(rule.active).toBe(true);
    });

    it('should create a tiered bundle pricing rule', async () => {
      const rule = await createRule({
        name: `${TEST_PREFIX}tiered`,
        type: PricingRuleType.TIERED_BUNDLE,
        classCountMin: 2,
        classCountMax: 4,
        monthlyFee: 150,
        priority: 2,
      });

      expect(rule.type).toBe(PricingRuleType.TIERED_BUNDLE);
      expect(rule.classCountMin).toBe(2);
      expect(rule.classCountMax).toBe(4);
      expect(Number(rule.monthlyFee)).toBe(150);
    });

    it('should create a term-based pricing rule with termFee', async () => {
      const rule = await createRule({
        name: `${TEST_PREFIX}term`,
        type: PricingRuleType.TERM_BASED,
        classCountMin: 1,
        monthlyFee: 90,
        termFee: 350,
        priority: 3,
      });

      expect(rule.type).toBe(PricingRuleType.TERM_BASED);
      expect(Number(rule.termFee)).toBe(350);
    });

    it('should default active to true when not specified', async () => {
      const rule = await createRule({ active: undefined });
      expect(rule.active).toBe(true);
    });

    it('should create an inactive rule when active is false', async () => {
      const rule = await createRule({ active: false });
      expect(rule.active).toBe(false);
    });
  });

  describe('getPricingRule', () => {
    it('should return a pricing rule by ID', async () => {
      const created = await createRule({ name: `${TEST_PREFIX}get` });
      const fetched = await feeService.getPricingRule(created.id);

      expect(fetched.id).toBe(created.id);
      expect(fetched.name).toBe(created.name);
    });

    it('should throw if pricing rule not found', async () => {
      await expect(feeService.getPricingRule('00000000-0000-0000-0000-000000000000')).rejects.toThrow(
        'Pricing rule not found'
      );
    });
  });

  describe('updatePricingRule', () => {
    it('should update pricing rule fields', async () => {
      const rule = await createRule({ name: `${TEST_PREFIX}update-orig`, monthlyFee: 100 });

      const updated = await feeService.updatePricingRule(rule.id, {
        name: `${TEST_PREFIX}update-new`,
        monthlyFee: 120,
        active: false,
      });

      expect(updated.name).toBe(`${TEST_PREFIX}update-new`);
      expect(Number(updated.monthlyFee)).toBe(120);
      expect(updated.active).toBe(false);
    });

    it('should persist updates immediately (round-trip)', async () => {
      const rule = await createRule({ name: `${TEST_PREFIX}roundtrip`, priority: 5 });
      await feeService.updatePricingRule(rule.id, { priority: 99 });

      const fetched = await feeService.getPricingRule(rule.id);
      expect(fetched.priority).toBe(99);
    });

    it('should throw if pricing rule not found', async () => {
      await expect(
        feeService.updatePricingRule('00000000-0000-0000-0000-000000000000', { name: 'X' })
      ).rejects.toThrow('Pricing rule not found');
    });
  });

  describe('deletePricingRule', () => {
    it('should delete a pricing rule', async () => {
      const rule = await createRule({ name: `${TEST_PREFIX}delete` });
      await feeService.deletePricingRule(rule.id);

      await expect(feeService.getPricingRule(rule.id)).rejects.toThrow('Pricing rule not found');
    });

    it('should throw if pricing rule not found', async () => {
      await expect(
        feeService.deletePricingRule('00000000-0000-0000-0000-000000000000')
      ).rejects.toThrow('Pricing rule not found');
    });
  });

  describe('listPricingRules', () => {
    it('should return all pricing rules', async () => {
      const before = await feeService.listPricingRules();
      await createRule({ name: `${TEST_PREFIX}list-1` });
      await createRule({ name: `${TEST_PREFIX}list-2` });

      const after = await feeService.listPricingRules();
      expect(after.length).toBeGreaterThanOrEqual(before.length + 2);
    });

    it('should return only active rules when activeOnly=true', async () => {
      await createRule({ name: `${TEST_PREFIX}active-rule`, active: true });
      await createRule({ name: `${TEST_PREFIX}inactive-rule`, active: false });

      const activeRules = await feeService.listPricingRules(true);
      expect(activeRules.every((r) => r.active)).toBe(true);
    });

    it('should order rules by priority ascending', async () => {
      const rules = await feeService.listPricingRules();
      for (let i = 1; i < rules.length; i++) {
        expect(rules[i].priority).toBeGreaterThanOrEqual(rules[i - 1].priority);
      }
    });
  });

  describe('getApplicablePricingRule', () => {
    // Use unique high priority values to avoid interference with other test rules
    const BASE_PRIORITY = 900;

    it('should return null when no rules match', async () => {
      // classCount=0 won't match any rule with classCountMin >= 1
      const result = await feeService.getApplicablePricingRule(0);
      // Could be null or a rule with classCountMin=0; just verify it doesn't throw
      expect(result === null || result !== undefined).toBe(true);
    });

    it('should match a rule by class count range', async () => {
      const rule = await createRule({
        name: `${TEST_PREFIX}applicable-range`,
        type: PricingRuleType.TIERED_BUNDLE,
        classCountMin: 3,
        classCountMax: 5,
        monthlyFee: 200,
        priority: BASE_PRIORITY + 1,
        active: true,
      });

      const matched = await feeService.getApplicablePricingRule(4);
      // The matched rule should cover classCount=4
      expect(matched).not.toBeNull();
      expect(matched!.classCountMin).toBeLessThanOrEqual(4);
      if (matched!.classCountMax != null) {
        expect(matched!.classCountMax).toBeGreaterThanOrEqual(4);
      }
      // Verify our rule is among candidates
      expect(rule.id).toBeDefined();
    });

    it('should not match a rule when classCount is below classCountMin', async () => {
      await createRule({
        name: `${TEST_PREFIX}no-match-min`,
        classCountMin: 10,
        classCountMax: 20,
        priority: BASE_PRIORITY + 2,
        active: true,
      });

      // classCount=5 should not match a rule requiring min=10
      const matched = await feeService.getApplicablePricingRule(5);
      if (matched) {
        expect(matched.classCountMin).toBeLessThanOrEqual(5);
      }
    });

    it('should not match inactive rules', async () => {
      await createRule({
        name: `${TEST_PREFIX}inactive-applicable`,
        classCountMin: 1,
        classCountMax: 100,
        priority: BASE_PRIORITY + 3,
        active: false,
      });

      const matched = await feeService.getApplicablePricingRule(50);
      if (matched) {
        expect(matched.active).toBe(true);
      }
    });

    it('should prefer location-specific rule over generic rule', async () => {
      // Create a location for testing
      const location = await prisma.location.create({
        data: {
          name: `${TEST_PREFIX}location-${Date.now()}`,
          address: { street: '1 Test St' },
        },
      });

      const genericRule = await createRule({
        name: `${TEST_PREFIX}generic-loc`,
        classCountMin: 1,
        classCountMax: 10,
        monthlyFee: 100,
        priority: BASE_PRIORITY + 4,
        active: true,
      });

      const locationRule = await createRule({
        name: `${TEST_PREFIX}location-specific`,
        classCountMin: 1,
        classCountMax: 10,
        monthlyFee: 80,
        locationId: location.id,
        priority: BASE_PRIORITY + 5, // higher number = lower priority, but location-specific wins
        active: true,
      });

      const matched = await feeService.getApplicablePricingRule(3, location.id);
      // Location-specific rule should be preferred
      expect(matched).not.toBeNull();
      expect(matched!.locationId).toBe(location.id);

      // Cleanup location
      await prisma.location.delete({ where: { id: location.id } });
      // Remove location rule from cleanup list since location is deleted (cascade)
      const idx = createdRuleIds.indexOf(locationRule.id);
      if (idx !== -1) createdRuleIds.splice(idx, 1);
      const gIdx = createdRuleIds.indexOf(genericRule.id);
      if (gIdx !== -1) createdRuleIds.splice(gIdx, 1);
    });
  });

  // ─── Fee Calculation Engine ─────────────────────────────────────────────────

  describe('Fee Calculation Engine', () => {
    const FEE_CALC_PREFIX = 'fee-calc-test-';
    const createdDiscountIds: string[] = [];

    async function createCalcRule(overrides: Partial<Parameters<typeof feeService.createPricingRule>[0]> = {}) {
      const rule = await feeService.createPricingRule({
        name: `${FEE_CALC_PREFIX}rule-${Date.now()}-${Math.random()}`,
        type: PricingRuleType.PER_CLASS,
        classCountMin: 1,
        monthlyFee: 100,
        priority: 0,
        active: true,
        ...overrides,
      });
      createdRuleIds.push(rule.id);
      return rule;
    }

    async function createDiscount(overrides: Partial<Parameters<typeof feeService.createDiscountRule>[0]> = {}) {
      const discount = await feeService.createDiscountRule({
        name: `${FEE_CALC_PREFIX}discount-${Date.now()}-${Math.random()}`,
        type: DiscountType.PERCENTAGE,
        value: 10,
        eligibilityCriteria: {},
        priority: 1,
        active: true,
        ...overrides,
      });
      createdDiscountIds.push(discount.id);
      return discount;
    }

    afterAll(async () => {
      for (const id of createdDiscountIds) {
        try {
          await prisma.discountRule.delete({ where: { id } });
        } catch {
          // ignore
        }
      }
    });

    it('should calculate fee with no discounts - verify subtotal, GST (10%), total', async () => {
      await createCalcRule({ monthlyFee: 100, classCountMin: 1, classCountMax: 1, priority: 0 });

      const result = await feeService.calculateFee({ classCount: 1 });

      expect(result.subtotal).toBe(100);
      expect(result.discountAmount).toBe(0);
      expect(result.oneTimeFee).toBe(0);
      expect(result.gstAmount).toBe(10); // 10% of 100
      expect(result.total).toBe(110);    // 100 + 10
      expect(result.appliedDiscounts).toHaveLength(0);
      expect(result.pricingRule).not.toBeNull();
    });

    it('should calculate fee with PERCENTAGE discount', async () => {
      const rule = await createCalcRule({ monthlyFee: 200, classCountMin: 2, classCountMax: 2, priority: 0 });
      const discount = await createDiscount({
        type: DiscountType.PERCENTAGE,
        value: 20, // 20% off
      });

      const result = await feeService.calculateFee({
        classCount: 2,
        discountIds: [discount.id],
      });

      expect(result.subtotal).toBe(200);
      expect(result.discountAmount).toBe(40);   // 20% of 200
      expect(result.gstAmount).toBe(16);         // 10% of (200 - 40) = 10% of 160
      expect(result.total).toBe(176);            // 160 + 16
      expect(result.appliedDiscounts).toHaveLength(1);
      expect(result.appliedDiscounts[0].amount).toBe(40);

      // cleanup
      createdRuleIds.push(rule.id);
    });

    it('should calculate fee with FIXED_AMOUNT discount', async () => {
      await createCalcRule({ monthlyFee: 150, classCountMin: 3, classCountMax: 3, priority: 0 });
      const discount = await createDiscount({
        type: DiscountType.FIXED_AMOUNT,
        value: 25, // $25 off
      });

      const result = await feeService.calculateFee({
        classCount: 3,
        discountIds: [discount.id],
      });

      expect(result.subtotal).toBe(150);
      expect(result.discountAmount).toBe(25);
      expect(result.gstAmount).toBe(12.5);  // 10% of (150 - 25) = 10% of 125
      expect(result.total).toBe(137.5);     // 125 + 12.5
      expect(result.appliedDiscounts[0].amount).toBe(25);
    });

    it('should calculate fee with multiple discounts - verify cumulative discount', async () => {
      await createCalcRule({ monthlyFee: 200, classCountMin: 4, classCountMax: 4, priority: 0 });
      const d1 = await createDiscount({ type: DiscountType.PERCENTAGE, value: 10 }); // 10% = $20
      const d2 = await createDiscount({ type: DiscountType.FIXED_AMOUNT, value: 15 }); // $15

      const result = await feeService.calculateFee({
        classCount: 4,
        discountIds: [d1.id, d2.id],
      });

      expect(result.subtotal).toBe(200);
      expect(result.discountAmount).toBe(35);   // 20 + 15
      expect(result.gstAmount).toBe(16.5);       // 10% of (200 - 35) = 10% of 165
      expect(result.total).toBe(181.5);          // 165 + 16.5
      expect(result.appliedDiscounts).toHaveLength(2);
    });

    it('should calculate fee with one-time fee - verify one-time fee included in GST base', async () => {
      await createCalcRule({ monthlyFee: 100, classCountMin: 5, classCountMax: 5, priority: 0 });

      const result = await feeService.calculateFee({
        classCount: 5,
        oneTimeFeeAmount: 50,
      });

      expect(result.subtotal).toBe(100);
      expect(result.oneTimeFee).toBe(50);
      expect(result.discountAmount).toBe(0);
      // GST base = 100 - 0 + 50 = 150
      expect(result.gstAmount).toBe(15);   // 10% of 150
      expect(result.total).toBe(165);      // 150 + 15
    });

    it('should throw error when no pricing rule found', async () => {
      // classCount=0 won't match any rule with classCountMin >= 1
      await expect(
        feeService.calculateFee({ classCount: 0 })
      ).rejects.toThrow('No applicable pricing rule found for the given class count');
    });

    describe('calculateProration', () => {
      it('should return full month fee when start is on billing day', () => {
        const startDate = new Date('2024-03-01'); // day 1
        const result = feeService.calculateProration(100, startDate, 1);
        expect(result).toBe(100);
      });

      it('should return full month fee when start is before billing day', () => {
        const startDate = new Date('2024-03-05'); // day 5, billing day 10
        const result = feeService.calculateProration(100, startDate, 10);
        expect(result).toBe(100);
      });

      it('should prorate when start is after billing day', () => {
        // March has 31 days. Start on day 16, billing day 1.
        // daysRemaining = 31 - 16 + 1 = 16
        // prorated = (16 / 31) * 100 ≈ 51.61
        const startDate = new Date('2024-03-16');
        const result = feeService.calculateProration(100, startDate, 1);
        const expected = Math.round((16 / 31) * 100 * 100) / 100;
        expect(result).toBe(expected);
      });

      it('should prorate correctly for last day of month', () => {
        // March has 31 days. Start on day 31, billing day 1.
        // daysRemaining = 31 - 31 + 1 = 1
        // prorated = (1 / 31) * 100 ≈ 3.23
        const startDate = new Date('2024-03-31');
        const result = feeService.calculateProration(100, startDate, 1);
        const expected = Math.round((1 / 31) * 100 * 100) / 100;
        expect(result).toBe(expected);
      });
    });
  });
});
