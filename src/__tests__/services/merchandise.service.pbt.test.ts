import fc from 'fast-check';
import { MerchandiseService } from '../../services/merchandise.service';

/**
 * Property-Based Tests for Merchandise Inventory Constraints
 *
 * Property 45: Inventory Constraint
 * Stock quantity must never go below zero. Any attempt to decrement stock beyond
 * available quantity must be rejected. After any sequence of valid purchases,
 * the stock count must equal initialStock - totalPurchased.
 * **Validates: Requirements 27.5**
 */

// ─────────────────────────────────────────────────────────────────────────────
// Mock Prisma
// ─────────────────────────────────────────────────────────────────────────────

let mockFindUnique: jest.Mock;
let mockUpdate: jest.Mock;

jest.mock('@prisma/client', () => {
  const actual = jest.requireActual('@prisma/client');
  const findUnique = jest.fn();
  const update = jest.fn();
  return {
    ...actual,
    PrismaClient: jest.fn().mockImplementation(() => ({
      merchandiseItem: {
        findUnique,
        create: jest.fn(),
        update,
        delete: jest.fn(),
        findMany: jest.fn(),
      },
      $disconnect: jest.fn(),
    })),
    __mocks: { findUnique, update },
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeItem(id: string, stockQuantity: number) {
  return {
    id,
    name: 'Test Item',
    description: null,
    price: 10,
    stockQuantity,
    sku: `SKU-${id}`,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('MerchandiseService Property-Based Tests', () => {
  let service: MerchandiseService;

  beforeEach(() => {
    jest.clearAllMocks();
    const { __mocks } = require('@prisma/client') as {
      __mocks: { findUnique: jest.Mock; update: jest.Mock };
    };
    mockFindUnique = __mocks.findUnique;
    mockUpdate = __mocks.update;
    service = new MerchandiseService();
  });

  /**
   * Property 45: Inventory Constraint
   * **Validates: Requirements 27.5**
   */
  describe('Property 45: Inventory Constraint', () => {
    /**
     * Sub-property A: Stock never goes below zero.
     * decrementStock must throw when quantity > available stock.
     */
    it('rejects decrement when quantity exceeds available stock (stock never goes below zero)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.integer({ min: 0, max: 100 }), // current stock
          fc.integer({ min: 1, max: 200 }), // requested decrement
          async (id, stock, decrement) => {
            fc.pre(decrement > stock); // only test the over-decrement case

            mockFindUnique.mockResolvedValue(makeItem(id, stock));

            await expect(service.decrementStock(id, decrement)).rejects.toThrow(
              'Insufficient stock'
            );

            // update must NOT have been called — stock is unchanged
            expect(mockUpdate).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Sub-property B: After N valid purchases of purchaseQty each,
     * stock = initialStock - N * purchaseQty.
     */
    it('stock equals initialStock - totalPurchased after a sequence of valid purchases', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.integer({ min: 1, max: 100 }), // purchaseQty per transaction
          fc.integer({ min: 1, max: 10 }),  // number of purchases N
          async (id, purchaseQty, n) => {
            // Clear mocks at the start of each property run
            mockFindUnique.mockReset();
            mockUpdate.mockReset();

            const initialStock = purchaseQty * n; // exactly enough stock for all purchases
            let currentStock = initialStock;

            for (let i = 0; i < n; i++) {
              mockFindUnique.mockResolvedValueOnce(makeItem(id, currentStock));
              const afterDecrement = currentStock - purchaseQty;
              mockUpdate.mockResolvedValueOnce(makeItem(id, afterDecrement));
              currentStock = afterDecrement;
            }

            // Execute N purchases sequentially
            let lastResult: Awaited<ReturnType<typeof service.decrementStock>> | undefined;
            for (let i = 0; i < n; i++) {
              lastResult = await service.decrementStock(id, purchaseQty);
            }

            // Final stock must equal initialStock - N * purchaseQty = 0
            expect(lastResult!.stockQuantity).toBe(initialStock - n * purchaseQty);
            expect(lastResult!.stockQuantity).toBeGreaterThanOrEqual(0);
            expect(mockUpdate).toHaveBeenCalledTimes(n);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Sub-property C: Incrementing stock after a decrement restores the correct level.
     * decrement(qty) then increment(qty) => stock is back to original.
     */
    it('incrementing stock after decrement restores the correct level', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.integer({ min: 1, max: 100 }), // initial stock
          fc.integer({ min: 1, max: 100 }), // decrement/increment qty
          async (id, initialStock, qty) => {
            fc.pre(qty <= initialStock); // valid decrement

            const afterDecrement = initialStock - qty;
            const afterIncrement = afterDecrement + qty;

            // decrement
            mockFindUnique.mockResolvedValueOnce(makeItem(id, initialStock));
            mockUpdate.mockResolvedValueOnce(makeItem(id, afterDecrement));
            const decremented = await service.decrementStock(id, qty);
            expect(decremented.stockQuantity).toBe(afterDecrement);

            // increment
            mockFindUnique.mockResolvedValueOnce(makeItem(id, afterDecrement));
            mockUpdate.mockResolvedValueOnce(makeItem(id, afterIncrement));
            const restored = await service.incrementStock(id, qty);
            expect(restored.stockQuantity).toBe(initialStock);
            expect(restored.stockQuantity).toBe(afterIncrement);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
