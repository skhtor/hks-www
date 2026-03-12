import fc from 'fast-check';
import { XeroService } from '../../services/xero.service';
import { prisma } from '../../config/database';

// Mock prisma
jest.mock('../../config/database', () => ({
  prisma: {
    customer: { findUnique: jest.fn() },
    xeroContact: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    invoice: { findUnique: jest.fn() },
    xeroInvoice: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    syncLog: { create: jest.fn() },
  },
}));

// Mock xero-node
jest.mock('xero-node', () => {
  const mockAccountingApi = {
    getContacts: jest.fn(),
    createContacts: jest.fn(),
    updateContact: jest.fn(),
  };
  return {
    XeroClient: jest.fn().mockImplementation(() => ({
      buildConsentUrl: jest.fn(),
      apiCallback: jest.fn(),
      updateTenants: jest.fn(),
      refreshWithRefreshToken: jest.fn(),
      accountingApi: mockAccountingApi,
    })),
    Phone: { PhoneTypeEnum: { DEFAULT: 'DEFAULT' } },
    Invoice: {
      TypeEnum: { ACCREC: 'ACCREC', ACCPAY: 'ACCPAY' },
      StatusEnum: { AUTHORISED: 'AUTHORISED', DRAFT: 'DRAFT' },
    },
  };
});

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;

// Arbitraries
const customerIdArb = fc.uuid();
const xeroContactIdArb = fc.uuid();
const emailArb = fc
  .tuple(
    fc.string({ minLength: 3, maxLength: 10 }).filter((s) => /^[a-z]+$/.test(s)),
    fc.string({ minLength: 3, maxLength: 10 }).filter((s) => /^[a-z]+$/.test(s))
  )
  .map(([local, domain]) => `${local}@${domain}.com`);

const customerArb = fc
  .tuple(customerIdArb, emailArb, fc.string({ minLength: 2, maxLength: 30 }))
  .map(([id, email, name]) => ({
    id,
    name,
    mobile: '0400000000',
    user: { email },
  }));

function makeXeroService(): XeroService {
  const svc = new XeroService();
  // Inject authenticated state via private method workaround
  (svc as unknown as { getClient: () => Promise<unknown> }).getClient = jest.fn().mockResolvedValue(
    (require('xero-node').XeroClient as jest.Mock).mock.results[
      (require('xero-node').XeroClient as jest.Mock).mock.results.length - 1
    ]?.value ?? {}
  );
  (svc as unknown as { getTenantId: () => string }).getTenantId = jest
    .fn()
    .mockReturnValue('tenant-123');
  return svc;
}

describe('XeroService Property-Based Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockedPrisma.syncLog.create as jest.Mock).mockResolvedValue({});
  });

  /**
   * Property 23: Contact Sync Idempotency
   * Feature: dance-school-management-platform
   * For any customer, creating or syncing the customer multiple times should
   * result in exactly one Xero contact (idempotency). The second call should
   * update, not create.
   * **Validates: Requirements 10.1, 10.4**
   */
  describe('Property 23: Contact Sync Idempotency', () => {
    it('should return the same xeroContactId on repeated syncs and not create duplicates', async () => {
      await fc.assert(
        fc.asyncProperty(customerArb, xeroContactIdArb, async (customer, xeroContactId) => {
          const svc = makeXeroService();
          const xeroClientInstance = await (svc as unknown as { getClient: () => Promise<unknown> }).getClient();
          const accountingApi = (xeroClientInstance as { accountingApi: { updateContact: jest.Mock } }).accountingApi;

          // First call: no existing XeroContact record → search Xero → not found → create
          (mockedPrisma.customer.findUnique as jest.Mock)
            .mockResolvedValueOnce(customer)
            .mockResolvedValueOnce(customer);

          (mockedPrisma.xeroContact.findUnique as jest.Mock)
            .mockResolvedValueOnce(null) // first call: no existing record
            .mockResolvedValueOnce({ customerId: customer.id, xeroContactId }); // second call: record exists

          // Xero search returns no match on first call
          (xeroClientInstance as { accountingApi: { getContacts: jest.Mock } }).accountingApi.getContacts = jest
            .fn()
            .mockResolvedValue({ body: { contacts: [] } });

          // Xero create returns the new contact
          (xeroClientInstance as { accountingApi: { createContacts: jest.Mock } }).accountingApi.createContacts = jest
            .fn()
            .mockResolvedValue({ body: { contacts: [{ contactID: xeroContactId }] } });

          (mockedPrisma.xeroContact.create as jest.Mock).mockResolvedValue({
            customerId: customer.id,
            xeroContactId,
          });

          // Second call: existing XeroContact record → update
          accountingApi.updateContact = jest.fn().mockResolvedValue({});
          (mockedPrisma.xeroContact.update as jest.Mock).mockResolvedValue({
            customerId: customer.id,
            xeroContactId,
          });

          // First sync
          const result1 = await svc.syncContact(customer.id);
          expect(result1.success).toBe(true);
          expect(result1.xeroContactId).toBe(xeroContactId);

          // Second sync
          const result2 = await svc.syncContact(customer.id);
          expect(result2.success).toBe(true);
          expect(result2.xeroContactId).toBe(xeroContactId);

          // Both calls return the same xeroContactId — no duplicate created
          expect(result1.xeroContactId).toBe(result2.xeroContactId);

          // create was called exactly once (first sync only)
          expect(
            (xeroClientInstance as { accountingApi: { createContacts: jest.Mock } }).accountingApi.createContacts
          ).toHaveBeenCalledTimes(1);

          // update was called exactly once (second sync)
          expect(accountingApi.updateContact).toHaveBeenCalledTimes(1);
        }),
        { numRuns: 20 }
      );
    });
  });

  /**
   * Property 24: Contact Email Uniqueness
   * Feature: dance-school-management-platform
   * For any customer email that matches an existing Xero contact, no new Xero
   * contact should be created. The service should find the existing Xero contact
   * by email and link it rather than creating a duplicate.
   * **Validates: Requirements 10.6**
   */
  describe('Property 24: Contact Email Uniqueness', () => {
    it('should link an existing Xero contact by email instead of creating a duplicate', async () => {
      await fc.assert(
        fc.asyncProperty(
          customerArb,
          customerArb,
          xeroContactIdArb,
          async (customer1, customer2Raw, existingXeroContactId) => {
            // Both customers share the same email to simulate deduplication scenario
            const sharedEmail = customer1.user.email;
            const customer2 = { ...customer2Raw, user: { email: sharedEmail } };

            const svc = makeXeroService();
            const xeroClientInstance = await (svc as unknown as { getClient: () => Promise<unknown> }).getClient();

            // Neither customer has a local XeroContact record yet
            (mockedPrisma.customer.findUnique as jest.Mock)
              .mockResolvedValueOnce(customer1)
              .mockResolvedValueOnce(customer2);

            (mockedPrisma.xeroContact.findUnique as jest.Mock)
              .mockResolvedValueOnce(null) // customer1: no record
              .mockResolvedValueOnce(null); // customer2: no record

            // Xero search: first call returns no match (customer1 creates new contact)
            // second call returns the contact created for customer1 (customer2 links it)
            (xeroClientInstance as { accountingApi: { getContacts: jest.Mock } }).accountingApi.getContacts = jest
              .fn()
              .mockResolvedValueOnce({ body: { contacts: [] } }) // customer1: not found
              .mockResolvedValueOnce({
                body: {
                  contacts: [{ contactID: existingXeroContactId, emailAddress: sharedEmail }],
                },
              }); // customer2: found by email

            // customer1 creates a new Xero contact
            (xeroClientInstance as { accountingApi: { createContacts: jest.Mock } }).accountingApi.createContacts = jest
              .fn()
              .mockResolvedValue({ body: { contacts: [{ contactID: existingXeroContactId }] } });

            (mockedPrisma.xeroContact.create as jest.Mock)
              .mockResolvedValueOnce({ customerId: customer1.id, xeroContactId: existingXeroContactId })
              .mockResolvedValueOnce({ customerId: customer2.id, xeroContactId: existingXeroContactId });

            // Sync customer1 — creates new Xero contact
            const result1 = await svc.syncContact(customer1.id);
            expect(result1.success).toBe(true);
            expect(result1.xeroContactId).toBe(existingXeroContactId);

            // Sync customer2 (same email) — should link existing contact, not create new one
            const result2 = await svc.syncContact(customer2.id);
            expect(result2.success).toBe(true);
            expect(result2.xeroContactId).toBe(existingXeroContactId);

            // Both customers map to the same Xero contact ID
            expect(result1.xeroContactId).toBe(result2.xeroContactId);

            // createContacts called only once — customer2 reused the existing contact
            expect(
              (xeroClientInstance as { accountingApi: { createContacts: jest.Mock } }).accountingApi.createContacts
            ).toHaveBeenCalledTimes(1);
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Typed reference for invoice-related prisma mocks (Property 25)
// ---------------------------------------------------------------------------

const mockedPrismaExtended = prisma as jest.Mocked<typeof prisma> & {
  invoice: { findUnique: jest.Mock };
  xeroInvoice: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
};

// ---------------------------------------------------------------------------
// Arbitraries for invoice data
// ---------------------------------------------------------------------------

const invoiceIdArb = fc.uuid();
const xeroInvoiceIdArb = fc.uuid();
const invoiceNumberArb = fc
  .integer({ min: 1000, max: 9999 })
  .map((n) => `INV-${n}`);

const lineItemArb = fc
  .tuple(
    fc.string({ minLength: 3, maxLength: 20 }).filter((s) => /^[a-zA-Z ]+$/.test(s)),
    fc.integer({ min: 1, max: 10 }),
    fc.integer({ min: 10, max: 500 })
  )
  .map(([description, quantity, unitAmount]) => ({
    description,
    quantity,
    unitAmount,
    accountCode: '200',
  }));

const invoiceArb = fc
  .tuple(
    invoiceIdArb,
    invoiceNumberArb,
    fc.uuid(), // customerId
    fc.array(lineItemArb, { minLength: 1, maxLength: 3 })
  )
  .map(([id, invoiceNumber, customerId, lineItems]) => ({
    id,
    invoiceNumber,
    customerId,
    lineItems,
    dueDate: new Date('2025-12-31'),
    xeroInvoice: null as null | { xeroInvoiceId: string; invoiceId: string },
    customer: { id: customerId, name: 'Test Customer' },
  }));

// ---------------------------------------------------------------------------
// Helper to build a XeroService with mocked getClient / getTenantId
// (reuses the same pattern as makeXeroService above)
// ---------------------------------------------------------------------------

function makeXeroServiceForInvoice(): {
  svc: XeroService;
  accountingApi: {
    createInvoices: jest.Mock;
    updateInvoice: jest.Mock;
    getContacts: jest.Mock;
    createContacts: jest.Mock;
    updateContact: jest.Mock;
  };
} {
  const svc = new XeroService();

  // Grab the most recently constructed XeroClient mock instance
  const XeroClientMock = require('xero-node').XeroClient as jest.Mock;
  const xeroClientInstance =
    XeroClientMock.mock.results[XeroClientMock.mock.results.length - 1]?.value ?? {};

  const accountingApi = xeroClientInstance.accountingApi as {
    createInvoices: jest.Mock;
    updateInvoice: jest.Mock;
    getContacts: jest.Mock;
    createContacts: jest.Mock;
    updateContact: jest.Mock;
  };

  // Ensure all methods exist as jest.fn()
  accountingApi.createInvoices = jest.fn();
  accountingApi.updateInvoice = jest.fn();
  accountingApi.getContacts = jest.fn();
  accountingApi.createContacts = jest.fn();
  accountingApi.updateContact = jest.fn();

  (svc as unknown as { getClient: () => Promise<unknown> }).getClient = jest
    .fn()
    .mockResolvedValue(xeroClientInstance);
  (svc as unknown as { getTenantId: () => string }).getTenantId = jest
    .fn()
    .mockReturnValue('tenant-123');

  return { svc, accountingApi };
}

// ---------------------------------------------------------------------------
// Property 25: Invoice Generation Idempotency
// ---------------------------------------------------------------------------

describe('Property 25: Invoice Generation Idempotency', () => {
  /**
   * Property 25: Invoice Generation Idempotency
   * Feature: dance-school-management-platform
   * For any enrolment, confirming the enrolment multiple times with the same
   * idempotency key should result in exactly one Xero invoice. The second call
   * should update, not create.
   * **Validates: Requirements 11.1, 11.5**
   */
  it('should return the same xeroInvoiceId on repeated syncs and not create duplicate invoices', async () => {
    await fc.assert(
      fc.asyncProperty(
        invoiceArb,
        xeroInvoiceIdArb,
        async (baseInvoice, xeroInvoiceId) => {
          // Reset only call counts on specific mocks (not implementations),
          // so XeroClient mock.results and service method mocks remain intact.
          (mockedPrisma.syncLog.create as jest.Mock).mockReset().mockResolvedValue({});
          (mockedPrismaExtended.invoice.findUnique as jest.Mock).mockReset();
          (mockedPrismaExtended.xeroContact.findUnique as jest.Mock).mockReset();
          (mockedPrismaExtended.xeroInvoice.create as jest.Mock).mockReset();
          (mockedPrismaExtended.xeroInvoice.update as jest.Mock).mockReset();

          const { svc, accountingApi } = makeXeroServiceForInvoice();

          // XeroContact already exists for this customer (persistent — used by both syncInvoice calls)
          (mockedPrismaExtended.xeroContact.findUnique as jest.Mock).mockResolvedValue({
            customerId: baseInvoice.customerId,
            xeroContactId: 'xero-contact-abc',
          });

          // ----------------------------------------------------------------
          // First call: no XeroInvoice record → createInvoices → record created
          // ----------------------------------------------------------------
          const invoiceFirstCall = { ...baseInvoice, xeroInvoice: null };

          (mockedPrismaExtended.invoice.findUnique as jest.Mock).mockResolvedValueOnce(
            invoiceFirstCall
          );

          accountingApi.createInvoices.mockResolvedValueOnce({
            body: { invoices: [{ invoiceID: xeroInvoiceId }] },
          });

          (mockedPrismaExtended.xeroInvoice.create as jest.Mock).mockResolvedValueOnce({
            invoiceId: baseInvoice.id,
            xeroInvoiceId,
            lastSyncedAt: new Date(),
          });

          const result1 = await svc.syncInvoice(baseInvoice.id);

          expect(result1.success).toBe(true);
          expect(result1.xeroInvoiceId).toBe(xeroInvoiceId);

          // createInvoices called exactly once on first sync
          expect(accountingApi.createInvoices).toHaveBeenCalledTimes(1);
          // updateInvoice NOT called on first sync
          expect(accountingApi.updateInvoice).not.toHaveBeenCalled();

          // ----------------------------------------------------------------
          // Second call: XeroInvoice record exists → updateInvoice → no new record
          // ----------------------------------------------------------------
          const invoiceSecondCall = {
            ...baseInvoice,
            xeroInvoice: { xeroInvoiceId, invoiceId: baseInvoice.id },
          };

          (mockedPrismaExtended.invoice.findUnique as jest.Mock).mockResolvedValueOnce(
            invoiceSecondCall
          );

          accountingApi.updateInvoice.mockResolvedValueOnce({
            body: { invoices: [{ invoiceID: xeroInvoiceId }] },
          });

          (mockedPrismaExtended.xeroInvoice.update as jest.Mock).mockResolvedValueOnce({
            invoiceId: baseInvoice.id,
            xeroInvoiceId,
            lastSyncedAt: new Date(),
          });

          const result2 = await svc.syncInvoice(baseInvoice.id);

          expect(result2.success).toBe(true);
          expect(result2.xeroInvoiceId).toBe(xeroInvoiceId);

          // updateInvoice called exactly once on second sync
          expect(accountingApi.updateInvoice).toHaveBeenCalledTimes(1);
          // createInvoices still only called once total (not again on second sync)
          expect(accountingApi.createInvoices).toHaveBeenCalledTimes(1);

          // ----------------------------------------------------------------
          // Both calls return the same xeroInvoiceId — no duplicate created
          // ----------------------------------------------------------------
          expect(result1.xeroInvoiceId).toBe(result2.xeroInvoiceId);
        }
      ),
      { numRuns: 20 }
    );
  });
});
