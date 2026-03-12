import { MerchandiseService } from '../../services/merchandise.service';

// ─────────────────────────────────────────────────────────────────────────────
// Mock Prisma and xeroService
// ─────────────────────────────────────────────────────────────────────────────

let mockFindUnique: jest.Mock;
let mockCreate: jest.Mock;
let mockUpdate: jest.Mock;
let mockCustomerFindUnique: jest.Mock;

jest.mock('@prisma/client', () => {
  const actual = jest.requireActual('@prisma/client');
  const merchandiseFindUnique = jest.fn();
  const merchandiseUpdate = jest.fn();
  const invoiceCreate = jest.fn();
  const customerFindUnique = jest.fn();
  return {
    ...actual,
    PrismaClient: jest.fn().mockImplementation(() => ({
      merchandiseItem: {
        findUnique: merchandiseFindUnique,
        create: jest.fn(),
        update: merchandiseUpdate,
        delete: jest.fn(),
        findMany: jest.fn(),
      },
      invoice: {
        create: invoiceCreate,
      },
      customer: {
        findUnique: customerFindUnique,
      },
      $disconnect: jest.fn(),
    })),
    __mocks: { merchandiseFindUnique, merchandiseUpdate, invoiceCreate, customerFindUnique },
  };
});

jest.mock('../../services/xero.service', () => ({
  xeroService: {
    syncInvoice: jest.fn().mockResolvedValue({ success: true }),
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeItem(id: string, stockQuantity: number, price = 25, isActive = true) {
  return {
    id,
    name: `Item ${id}`,
    description: null,
    price,
    stockQuantity,
    sku: `SKU-${id}`,
    isActive,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeCustomer(id: string) {
  return {
    id,
    householdId: 'household-1',
    name: 'Test Customer',
    mobile: '0400000000',
    userId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeInvoice(id: string) {
  return {
    id,
    customerId: 'customer-1',
    householdId: 'household-1',
    invoiceNumber: `merch-customer-1-${Date.now()}`,
    subtotal: 50,
    discountAmount: 0,
    gstAmount: 5,
    total: 55,
    status: 'DUE',
    dueDate: new Date(),
    lineItems: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('MerchandiseService - purchaseMerchandise', () => {
  let service: MerchandiseService;

  beforeEach(() => {
    jest.clearAllMocks();
    const { __mocks } = require('@prisma/client') as {
      __mocks: {
        merchandiseFindUnique: jest.Mock;
        merchandiseUpdate: jest.Mock;
        invoiceCreate: jest.Mock;
        customerFindUnique: jest.Mock;
      };
    };
    mockFindUnique = __mocks.merchandiseFindUnique;
    mockUpdate = __mocks.merchandiseUpdate;
    mockCreate = __mocks.invoiceCreate;
    mockCustomerFindUnique = __mocks.customerFindUnique;
    service = new MerchandiseService();
  });

  it('creates an invoice with correct line items and totals', async () => {
    const customerId = 'customer-1';
    const itemId = 'item-1';

    mockCustomerFindUnique.mockResolvedValue(makeCustomer(customerId));
    mockFindUnique.mockResolvedValue(makeItem(itemId, 10, 25));
    mockUpdate.mockResolvedValue(makeItem(itemId, 9, 25));
    mockCreate.mockResolvedValue(makeInvoice('invoice-1'));

    const result = await service.purchaseMerchandise(customerId, [
      { merchandiseItemId: itemId, quantity: 2 },
    ]);

    expect(result.invoice).toBeDefined();
    expect(result.lineItems).toHaveLength(1);
    expect(result.lineItems[0].quantity).toBe(2);
    expect(result.lineItems[0].unitAmount).toBe(25);
    expect(result.lineItems[0].amount).toBe(50);
    expect(result.lineItems[0].type).toBe('MERCHANDISE');

    // Invoice create called with correct totals
    const createCall = mockCreate.mock.calls[0][0];
    expect(createCall.data.subtotal).toBe(50);
    expect(createCall.data.gstAmount).toBe(5);
    expect(createCall.data.total).toBe(55);
    expect(createCall.data.discountAmount).toBe(0);
  });

  it('decrements stock for each purchased item', async () => {
    const customerId = 'customer-1';
    const itemId = 'item-1';

    mockCustomerFindUnique.mockResolvedValue(makeCustomer(customerId));
    mockFindUnique.mockResolvedValue(makeItem(itemId, 10, 25));
    mockUpdate.mockResolvedValue(makeItem(itemId, 8, 25));
    mockCreate.mockResolvedValue(makeInvoice('invoice-1'));

    await service.purchaseMerchandise(customerId, [{ merchandiseItemId: itemId, quantity: 2 }]);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: itemId },
      data: { stockQuantity: { decrement: 2 } },
    });
  });

  it('throws when customer is not found', async () => {
    mockCustomerFindUnique.mockResolvedValue(null);

    await expect(
      service.purchaseMerchandise('nonexistent', [{ merchandiseItemId: 'item-1', quantity: 1 }])
    ).rejects.toThrow('Customer not found');
  });

  it('throws when a merchandise item is not found', async () => {
    mockCustomerFindUnique.mockResolvedValue(makeCustomer('customer-1'));
    mockFindUnique.mockResolvedValue(null);

    await expect(
      service.purchaseMerchandise('customer-1', [{ merchandiseItemId: 'bad-id', quantity: 1 }])
    ).rejects.toThrow('Merchandise item not found: bad-id');
  });

  it('throws when stock is insufficient', async () => {
    mockCustomerFindUnique.mockResolvedValue(makeCustomer('customer-1'));
    mockFindUnique.mockResolvedValue(makeItem('item-1', 1, 25));

    await expect(
      service.purchaseMerchandise('customer-1', [{ merchandiseItemId: 'item-1', quantity: 5 }])
    ).rejects.toThrow('Insufficient stock for item: Item item-1');
  });

  it('throws when item is inactive', async () => {
    mockCustomerFindUnique.mockResolvedValue(makeCustomer('customer-1'));
    mockFindUnique.mockResolvedValue(makeItem('item-1', 10, 25, false));

    await expect(
      service.purchaseMerchandise('customer-1', [{ merchandiseItemId: 'item-1', quantity: 1 }])
    ).rejects.toThrow('Merchandise item is not available: Item item-1');
  });

  it('throws when items array is empty', async () => {
    mockCustomerFindUnique.mockResolvedValue(makeCustomer('customer-1'));

    await expect(service.purchaseMerchandise('customer-1', [])).rejects.toThrow(
      'At least one item is required'
    );
  });

  it('handles multiple items in a single purchase', async () => {
    const customerId = 'customer-1';

    mockCustomerFindUnique.mockResolvedValue(makeCustomer(customerId));
    mockFindUnique
      .mockResolvedValueOnce(makeItem('item-1', 10, 20))
      .mockResolvedValueOnce(makeItem('item-2', 5, 30));
    mockUpdate
      .mockResolvedValueOnce(makeItem('item-1', 9, 20))
      .mockResolvedValueOnce(makeItem('item-2', 4, 30));
    mockCreate.mockResolvedValue(makeInvoice('invoice-1'));

    const result = await service.purchaseMerchandise(customerId, [
      { merchandiseItemId: 'item-1', quantity: 1 },
      { merchandiseItemId: 'item-2', quantity: 1 },
    ]);

    expect(result.lineItems).toHaveLength(2);
    // subtotal = 20 + 30 = 50, gst = 5, total = 55
    const createCall = mockCreate.mock.calls[0][0];
    expect(createCall.data.subtotal).toBe(50);
    expect(createCall.data.total).toBe(55);
  });
});
