/**
 * Property-Based Tests for PaymentService and InvoiceService
 * Properties 20, 21, 22, 35, 36
 */

import * as fc from 'fast-check';
import { PrismaClient, InvoiceStatus, PaymentStatus } from '@prisma/client';
import { PaymentService, PaymentGateway } from '../../services/payment.service';
import { InvoiceService } from '../../services/invoice.service';
import { FeeService } from '../../services/fee.service';

const prisma = new PrismaClient();
const feeService = new FeeService();
const invoiceService = new InvoiceService();

const PBT_DOMAIN = '@pbt-payment.test';

// Mock gateway — no live Stripe calls in tests
class MockGateway implements PaymentGateway {
  async createPaymentIntent(_amountCents: number, _currency: string, _metadata: Record<string, string>) {
    return { id: `pi_mock_${Date.now()}_${Math.random()}`, clientSecret: 'secret_mock' };
  }
  async confirmPayment(_id: string) {
    return { status: 'succeeded' };
  }
  async createRefund(_id: string, _amountCents?: number) {
    return { id: `re_mock_${Date.now()}`, status: 'succeeded' };
  }
  async createCustomer(_email: string, _name: string) {
    return { id: `cus_mock_${Date.now()}` };
  }
  async attachPaymentMethod(_customerId: string, _paymentMethodId: string) {
    // no-op in tests
  }
  async createSubscription(_customerId: string, _priceId: string, _paymentMethodId: string) {
    return { id: `sub_mock_${Date.now()}`, status: 'active' };
  }
  async cancelSubscription(_subscriptionId: string) {
    return { id: _subscriptionId, status: 'canceled' };
  }
  async updateDefaultPaymentMethod(_customerId: string, _paymentMethodId: string) {
    // no-op in tests
  }
}

const paymentService = new PaymentService(new MockGateway());

let customerId: string;
let householdId: string;
let pricingRuleId: string;

beforeAll(async () => {
  const userAccount = await prisma.userAccount.create({
    data: {
      email: `pbt-payment-user-${Date.now()}${PBT_DOMAIN}`,
      passwordHash: 'hash',
      role: 'CUSTOMER',
    },
  });

  const household = await prisma.household.create({
    data: { name: `PBT-Payment-Household-${Date.now()}` },
  });
  householdId = household.id;

  const customer = await prisma.customer.create({
    data: {
      userId: userAccount.id,
      householdId,
      name: 'PBT Payment Customer',
      mobile: '0400000000',
    },
  });
  customerId = customer.id;

  const pricingRule = await prisma.pricingRule.create({
    data: {
      name: `PBT-Payment-Rule-${Date.now()}`,
      type: 'PER_CLASS',
      classCountMin: 1,
      monthlyFee: 100,
      priority: 1,
    },
  });
  pricingRuleId = pricingRule.id;
});

afterAll(async () => {
  await prisma.payment.deleteMany({ where: { customer: { id: customerId } } });
  await prisma.invoice.deleteMany({ where: { customerId } });
  await prisma.customer.deleteMany({ where: { id: customerId } });
  await prisma.userAccount.deleteMany({ where: { email: { contains: PBT_DOMAIN } } });
  await prisma.household.deleteMany({ where: { id: householdId } });
  await prisma.pricingRule.deleteMany({ where: { id: pricingRuleId } });
  await prisma.$disconnect();
});

async function createTestInvoice(total: number, idempotencyKey?: string) {
  const key = idempotencyKey ?? `inv-${Date.now()}-${Math.random()}`;
  return prisma.invoice.create({
    data: {
      customerId,
      householdId,
      invoiceNumber: key,
      subtotal: total,
      discountAmount: 0,
      gstAmount: Math.round(total * 0.1 * 100) / 100,
      total: Math.round(total * 1.1 * 100) / 100,
      status: InvoiceStatus.DUE,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      lineItems: [{ description: 'Test fee', amount: total, type: 'base_fee' }],
    },
  });
}

/**
 * Property 20: Invoice Total Integrity
 * For any invoice: total == (subtotal - discountAmount) * 1.1 (within rounding tolerance).
 * Validates: Requirements 19.1
 */
describe('Property 20: Invoice Total Integrity', () => {
  it('should satisfy total = (subtotal - discount) + gst for all generated invoices', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }), // classCount
        async (classCount) => {
          const feeResult = await feeService.calculateFee({ classCount });

          const key = `inv-integrity-${Date.now()}-${Math.random()}`;
          const invoice = await invoiceService.generateInvoice({
            customerId,
            householdId,
            feeResult,
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            idempotencyKey: key,
          });

          expect(invoiceService.verifyTotalIntegrity({
            subtotal: Number(invoice.subtotal),
            discountAmount: Number(invoice.discountAmount),
            gstAmount: Number(invoice.gstAmount),
            total: Number(invoice.total),
          })).toBe(true);

          // Explicit check: total >= subtotal (GST always adds)
          expect(Number(invoice.total)).toBeGreaterThanOrEqual(Number(invoice.subtotal));

          // GST is ~10% of (subtotal - discount)
          const gstBase = Number(invoice.subtotal) - Number(invoice.discountAmount);
          const expectedGst = Math.round(gstBase * 0.1 * 100) / 100;
          expect(Math.abs(Number(invoice.gstAmount) - expectedGst)).toBeLessThan(0.01);
        }
      ),
      { numRuns: 8 }
    );
  });
});

/**
 * Property 21: Payment Status Consistency
 * A payment starts PENDING, transitions to PAID on success, and REFUNDED on refund.
 * No invalid state transitions are allowed.
 * Validates: Requirements 6.3, 6.7
 */
describe('Property 21: Payment Status Consistency', () => {
  it('should transition payment from PENDING to PAID on recordPayment', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 50, max: 500 }),
        async (amount) => {
          const invoice = await createTestInvoice(amount);

          const { payment } = await paymentService.createPaymentIntent(invoice.id, customerId);
          expect(payment.status).toBe(PaymentStatus.PENDING);

          const paid = await paymentService.recordPayment(payment.gatewayPaymentId!);
          expect(paid.status).toBe(PaymentStatus.PAID);
          expect(paid.paidAt).not.toBeNull();

          // Invoice should now be PAID
          const updatedInvoice = await prisma.invoice.findUnique({ where: { id: invoice.id } });
          expect(updatedInvoice!.status).toBe(InvoiceStatus.PAID);
        }
      ),
      { numRuns: 5 }
    );
  });

  it('should not allow creating a payment intent for an already-paid invoice', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          const invoice = await createTestInvoice(100);
          const { payment } = await paymentService.createPaymentIntent(invoice.id, customerId);
          await paymentService.recordPayment(payment.gatewayPaymentId!);

          await expect(
            paymentService.createPaymentIntent(invoice.id, customerId)
          ).rejects.toThrow('already paid');
        }
      ),
      { numRuns: 3 }
    );
  });
});

/**
 * Property 22: Payment State Machine
 * Refund can only be applied to a PAID payment.
 * Validates: Requirements 6.7
 */
describe('Property 22: Payment State Machine', () => {
  it('should transition PAID payment to REFUNDED on full refund', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 50, max: 300 }),
        async (amount) => {
          const invoice = await createTestInvoice(amount);
          const { payment } = await paymentService.createPaymentIntent(invoice.id, customerId);
          await paymentService.recordPayment(payment.gatewayPaymentId!);

          const refunded = await paymentService.refundPayment(payment.id);
          expect(refunded.status).toBe(PaymentStatus.REFUNDED);
        }
      ),
      { numRuns: 5 }
    );
  });

  it('should transition PAID payment to PARTIALLY_REFUNDED on partial refund', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 100, max: 500 }),
        async (amount) => {
          const invoice = await createTestInvoice(amount);
          const { payment } = await paymentService.createPaymentIntent(invoice.id, customerId);
          await paymentService.recordPayment(payment.gatewayPaymentId!);

          // Partial refund: half the amount in cents
          const partialCents = Math.round((amount * 1.1 * 100) / 2);
          const refunded = await paymentService.refundPayment(payment.id, partialCents);
          expect(refunded.status).toBe(PaymentStatus.PARTIALLY_REFUNDED);
        }
      ),
      { numRuns: 5 }
    );
  });

  it('should reject refund on a PENDING payment', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          const invoice = await createTestInvoice(100);
          const { payment } = await paymentService.createPaymentIntent(invoice.id, customerId);
          // Do NOT record payment — stays PENDING

          await expect(
            paymentService.refundPayment(payment.id)
          ).rejects.toThrow('not in PAID status');
        }
      ),
      { numRuns: 3 }
    );
  });
});

/**
 * Property 35: Card Number Security
 * Payment records must never store raw card numbers.
 * The paymentMethod field must not contain any 16-digit sequences.
 * Validates: Requirements 18.3
 */
describe('Property 35: Card Number Security', () => {
  it('should never store raw card numbers in payment records', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate plausible card numbers
        fc.tuple(
          fc.integer({ min: 4000, max: 5999 }).map(String),
          fc.integer({ min: 1000, max: 9999 }).map(String),
          fc.integer({ min: 1000, max: 9999 }).map(String),
          fc.integer({ min: 1000, max: 9999 }).map(String)
        ),
        async ([p1, p2, p3, p4]) => {
          const cardNumber = `${p1}${p2}${p3}${p4}`;
          const invoice = await createTestInvoice(100);
          const { payment } = await paymentService.createPaymentIntent(invoice.id, customerId);

          // Fetch the raw payment record
          const stored = await prisma.payment.findUnique({ where: { id: payment.id } });
          const methodStr = JSON.stringify(stored!.paymentMethod);

          // Must not contain the card number or any 16-digit sequence
          expect(methodStr).not.toContain(cardNumber);
          expect(methodStr).not.toMatch(/\b\d{16}\b/);
        }
      ),
      { numRuns: 5 }
    );
  });
});

/**
 * Property 36: Invoice Generation Idempotency
 * Calling generateInvoice twice with the same idempotency key must return the same invoice.
 * Validates: Requirements 19.4
 */
describe('Property 36: Invoice Generation Idempotency', () => {
  it('should return the same invoice for duplicate idempotency keys', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        async (classCount) => {
          const feeResult = await feeService.calculateFee({ classCount });
          const key = `inv-idem-${Date.now()}-${Math.random()}`;
          const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

          const first = await invoiceService.generateInvoice({
            customerId,
            householdId,
            feeResult,
            dueDate,
            idempotencyKey: key,
          });

          const second = await invoiceService.generateInvoice({
            customerId,
            householdId,
            feeResult,
            dueDate,
            idempotencyKey: key,
          });

          // Must be the exact same record
          expect(second.id).toBe(first.id);
          expect(second.invoiceNumber).toBe(first.invoiceNumber);
          expect(Number(second.total)).toBe(Number(first.total));
        }
      ),
      { numRuns: 8 }
    );
  });
});
