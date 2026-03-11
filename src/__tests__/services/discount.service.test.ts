import { FeeService } from '../../services/fee.service';
import { PrismaClient, DiscountType } from '@prisma/client';

const prisma = new PrismaClient();
const feeService = new FeeService();

const TEST_PREFIX = 'discount-test-';

describe('FeeService - Discount Rules', () => {
  const createdIds: string[] = [];

  async function createDiscount(
    overrides: Partial<Parameters<typeof feeService.createDiscountRule>[0]> = {}
  ) {
    const rule = await feeService.createDiscountRule({
      name: `${TEST_PREFIX}rule-${Date.now()}-${Math.random()}`,
      type: DiscountType.PERCENTAGE,
      value: 10,
      eligibilityCriteria: {},
      priority: 10,
      active: true,
      ...overrides,
    });
    createdIds.push(rule.id);
    return rule;
  }

  afterAll(async () => {
    for (const id of createdIds) {
      try {
        await prisma.discountRule.delete({ where: { id } });
      } catch {
        // already deleted
      }
    }
    await prisma.$disconnect();
  });

  // ─── createDiscountRule ───────────────────────────────────────────────────

  describe('createDiscountRule', () => {
    it('should create a percentage discount rule', async () => {
      const rule = await createDiscount({
        name: `${TEST_PREFIX}percentage`,
        type: DiscountType.PERCENTAGE,
        value: 15,
        priority: 1,
      });

      expect(rule.id).toBeDefined();
      expect(rule.name).toBe(`${TEST_PREFIX}percentage`);
      expect(rule.type).toBe(DiscountType.PERCENTAGE);
      expect(Number(rule.value)).toBe(15);
      expect(rule.active).toBe(true);
    });

    it('should create a fixed amount discount rule', async () => {
      const rule = await createDiscount({
        name: `${TEST_PREFIX}fixed`,
        type: DiscountType.FIXED_AMOUNT,
        value: 20,
        priority: 2,
      });

      expect(rule.type).toBe(DiscountType.FIXED_AMOUNT);
      expect(Number(rule.value)).toBe(20);
    });

    it('should create a family discount rule', async () => {
      const rule = await createDiscount({
        name: `${TEST_PREFIX}family`,
        type: DiscountType.FAMILY,
        value: 10,
        eligibilityCriteria: { minDancers: 2 },
        priority: 3,
      });

      expect(rule.type).toBe(DiscountType.FAMILY);
      expect(rule.eligibilityCriteria).toMatchObject({ minDancers: 2 });
    });

    it('should create a concession discount rule', async () => {
      const rule = await createDiscount({
        name: `${TEST_PREFIX}concession`,
        type: DiscountType.CONCESSION,
        value: 25,
        eligibilityCriteria: { requiresProof: true },
        priority: 4,
      });

      expect(rule.type).toBe(DiscountType.CONCESSION);
    });

    it('should default active to true when not specified', async () => {
      const rule = await createDiscount({ active: undefined });
      expect(rule.active).toBe(true);
    });

    it('should create an inactive rule when active is false', async () => {
      const rule = await createDiscount({ active: false });
      expect(rule.active).toBe(false);
    });

    it('should create a rule with start and end dates', async () => {
      const startDate = new Date('2025-01-01T00:00:00.000Z');
      const endDate = new Date('2025-12-31T23:59:59.000Z');

      const rule = await createDiscount({
        name: `${TEST_PREFIX}dated`,
        startDate,
        endDate,
      });

      expect(rule.startDate).toEqual(startDate);
      expect(rule.endDate).toEqual(endDate);
    });
  });

  // ─── getDiscountRule ──────────────────────────────────────────────────────

  describe('getDiscountRule', () => {
    it('should return a discount rule by ID', async () => {
      const created = await createDiscount({ name: `${TEST_PREFIX}get` });
      const fetched = await feeService.getDiscountRule(created.id);

      expect(fetched.id).toBe(created.id);
      expect(fetched.name).toBe(created.name);
    });

    it('should throw if discount rule not found', async () => {
      await expect(
        feeService.getDiscountRule('00000000-0000-0000-0000-000000000000')
      ).rejects.toThrow('Discount rule not found');
    });
  });

  // ─── updateDiscountRule ───────────────────────────────────────────────────

  describe('updateDiscountRule', () => {
    it('should update discount rule fields', async () => {
      const rule = await createDiscount({ name: `${TEST_PREFIX}update-orig`, value: 10 });

      const updated = await feeService.updateDiscountRule(rule.id, {
        name: `${TEST_PREFIX}update-new`,
        value: 20,
        active: false,
      });

      expect(updated.name).toBe(`${TEST_PREFIX}update-new`);
      expect(Number(updated.value)).toBe(20);
      expect(updated.active).toBe(false);
    });

    it('should persist updates immediately (round-trip)', async () => {
      const rule = await createDiscount({ name: `${TEST_PREFIX}roundtrip`, priority: 5 });
      await feeService.updateDiscountRule(rule.id, { priority: 99 });

      const fetched = await feeService.getDiscountRule(rule.id);
      expect(fetched.priority).toBe(99);
    });

    it('should update eligibilityCriteria', async () => {
      const rule = await createDiscount({ eligibilityCriteria: { minDancers: 1 } });
      const updated = await feeService.updateDiscountRule(rule.id, {
        eligibilityCriteria: { minDancers: 3, requiresProof: true },
      });

      expect(updated.eligibilityCriteria).toMatchObject({ minDancers: 3, requiresProof: true });
    });

    it('should throw if discount rule not found', async () => {
      await expect(
        feeService.updateDiscountRule('00000000-0000-0000-0000-000000000000', { name: 'X' })
      ).rejects.toThrow('Discount rule not found');
    });
  });

  // ─── deleteDiscountRule ───────────────────────────────────────────────────

  describe('deleteDiscountRule', () => {
    it('should delete a discount rule', async () => {
      const rule = await createDiscount({ name: `${TEST_PREFIX}delete` });
      await feeService.deleteDiscountRule(rule.id);

      await expect(feeService.getDiscountRule(rule.id)).rejects.toThrow('Discount rule not found');
    });

    it('should throw if discount rule not found', async () => {
      await expect(
        feeService.deleteDiscountRule('00000000-0000-0000-0000-000000000000')
      ).rejects.toThrow('Discount rule not found');
    });
  });

  // ─── listDiscountRules ────────────────────────────────────────────────────

  describe('listDiscountRules', () => {
    it('should return all discount rules', async () => {
      const before = await feeService.listDiscountRules();
      await createDiscount({ name: `${TEST_PREFIX}list-1` });
      await createDiscount({ name: `${TEST_PREFIX}list-2` });

      const after = await feeService.listDiscountRules();
      expect(after.length).toBeGreaterThanOrEqual(before.length + 2);
    });

    it('should return only active rules when activeOnly=true', async () => {
      await createDiscount({ name: `${TEST_PREFIX}active-rule`, active: true });
      await createDiscount({ name: `${TEST_PREFIX}inactive-rule`, active: false });

      const activeRules = await feeService.listDiscountRules(true);
      expect(activeRules.every((r) => r.active)).toBe(true);
    });

    it('should order rules by priority ascending', async () => {
      await createDiscount({ name: `${TEST_PREFIX}prio-low`, priority: 1 });
      await createDiscount({ name: `${TEST_PREFIX}prio-high`, priority: 100 });

      const rules = await feeService.listDiscountRules();
      for (let i = 1; i < rules.length; i++) {
        expect(rules[i].priority).toBeGreaterThanOrEqual(rules[i - 1].priority);
      }
    });
  });

  // ─── getActiveDiscounts ───────────────────────────────────────────────────

  describe('getActiveDiscounts', () => {
    it('should return only active rules', async () => {
      await createDiscount({ name: `${TEST_PREFIX}active-disc`, active: true });
      await createDiscount({ name: `${TEST_PREFIX}inactive-disc`, active: false });

      const active = await feeService.getActiveDiscounts();
      expect(active.every((r) => r.active)).toBe(true);
    });

    it('should exclude rules where endDate is in the past', async () => {
      const past = new Date('2000-01-01T00:00:00.000Z');
      const rule = await createDiscount({
        name: `${TEST_PREFIX}expired`,
        active: true,
        endDate: past,
      });

      const active = await feeService.getActiveDiscounts();
      expect(active.find((r) => r.id === rule.id)).toBeUndefined();
    });

    it('should exclude rules where startDate is in the future', async () => {
      const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365); // 1 year from now
      const rule = await createDiscount({
        name: `${TEST_PREFIX}future`,
        active: true,
        startDate: future,
      });

      const active = await feeService.getActiveDiscounts();
      expect(active.find((r) => r.id === rule.id)).toBeUndefined();
    });

    it('should include rules with no date restrictions', async () => {
      const rule = await createDiscount({
        name: `${TEST_PREFIX}no-dates`,
        active: true,
        startDate: undefined,
        endDate: undefined,
      });

      const active = await feeService.getActiveDiscounts();
      expect(active.find((r) => r.id === rule.id)).toBeDefined();
    });

    it('should include rules where current date is within the date range', async () => {
      const past = new Date(Date.now() - 1000 * 60 * 60 * 24); // yesterday
      const future = new Date(Date.now() + 1000 * 60 * 60 * 24); // tomorrow

      const rule = await createDiscount({
        name: `${TEST_PREFIX}in-range`,
        active: true,
        startDate: past,
        endDate: future,
      });

      const active = await feeService.getActiveDiscounts();
      expect(active.find((r) => r.id === rule.id)).toBeDefined();
    });
  });
});
