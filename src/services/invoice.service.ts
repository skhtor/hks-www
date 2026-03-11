import { PrismaClient, InvoiceStatus } from '@prisma/client';
import { FeeService, FeeCalculationResult } from './fee.service';

const prisma = new PrismaClient();
const feeService = new FeeService();

export interface InvoiceLineItem {
  description: string;
  amount: number;
  type: string;
}

export class InvoiceService {
  /**
   * Generates an invoice for a customer/household.
   * Uses an idempotency key to prevent duplicate invoices.
   * Requirements: 11.1, 19.1, 19.4
   */
  async generateInvoice(params: {
    customerId: string;
    householdId: string;
    feeResult: FeeCalculationResult;
    dueDate: Date;
    idempotencyKey: string;
  }) {
    const { customerId, householdId, feeResult, dueDate, idempotencyKey } = params;

    // Idempotency: return existing invoice if already generated for this key
    const existing = await prisma.invoice.findUnique({
      where: { invoiceNumber: idempotencyKey },
    });
    if (existing) return existing;

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new Error('Customer not found');

    const household = await prisma.household.findUnique({ where: { id: householdId } });
    if (!household) throw new Error('Household not found');

    return prisma.invoice.create({
      data: {
        customerId,
        householdId,
        invoiceNumber: idempotencyKey,
        subtotal: feeResult.subtotal,
        discountAmount: feeResult.discountAmount,
        gstAmount: feeResult.gstAmount,
        total: feeResult.total,
        status: InvoiceStatus.DUE,
        dueDate,
        lineItems: feeResult.lineItems as unknown as object,
      },
    });
  }

  /**
   * Gets an invoice by ID.
   */
  async getInvoice(id: string) {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { customer: true, payments: true },
    });
    if (!invoice) throw new Error('Invoice not found');
    return invoice;
  }

  /**
   * Gets an invoice by invoice number (idempotency key).
   */
  async getInvoiceByNumber(invoiceNumber: string) {
    return prisma.invoice.findUnique({
      where: { invoiceNumber },
      include: { customer: true, payments: true },
    });
  }

  /**
   * Lists invoices for a customer.
   */
  async listInvoicesByCustomer(customerId: string) {
    return prisma.invoice.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: { payments: true },
    });
  }

  /**
   * Updates invoice status (e.g. to OVERDUE).
   * Requirements: 6.7, 6.8
   */
  async updateInvoiceStatus(id: string, status: InvoiceStatus) {
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new Error('Invoice not found');

    return prisma.invoice.update({
      where: { id },
      data: { status },
    });
  }

  /**
   * Marks overdue invoices — called by a scheduled job.
   * Requirements: 6.8
   */
  async markOverdueInvoices() {
    const now = new Date();
    const result = await prisma.invoice.updateMany({
      where: {
        status: InvoiceStatus.DUE,
        dueDate: { lt: now },
      },
      data: { status: InvoiceStatus.OVERDUE },
    });
    return result.count;
  }

  /**
   * Verifies invoice total integrity: subtotal - discountAmount + gstAmount == total (within rounding).
   * Used for validation.
   */
  verifyTotalIntegrity(invoice: {
    subtotal: number | string;
    discountAmount: number | string;
    gstAmount: number | string;
    total: number | string;
  }): boolean {
    const subtotal = Number(invoice.subtotal);
    const discount = Number(invoice.discountAmount);
    const gst = Number(invoice.gstAmount);
    const total = Number(invoice.total);

    const gstBase = subtotal - discount;
    const expectedTotal = Math.round((gstBase + gst) * 100) / 100;
    const actualTotal = Math.round(total * 100) / 100;

    return Math.abs(expectedTotal - actualTotal) < 0.01;
  }
}

export const invoiceService = new InvoiceService();
