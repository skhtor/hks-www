import { PrismaClient, PaymentStatus, InvoiceStatus } from '@prisma/client';
import Stripe from 'stripe';

const prisma = new PrismaClient();

// Gateway abstraction — allows test injection without live Stripe
export interface PaymentGateway {
  createPaymentIntent(amountCents: number, currency: string, metadata: Record<string, string>): Promise<{ id: string; clientSecret: string }>;
  confirmPayment(paymentIntentId: string): Promise<{ status: string }>;
  createRefund(paymentIntentId: string, amountCents?: number): Promise<{ id: string; status: string }>;
}

export class StripeGateway implements PaymentGateway {
  private stripe: Stripe;

  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey, { apiVersion: '2026-02-25.clover' });
  }

  async createPaymentIntent(amountCents: number, currency: string, metadata: Record<string, string>) {
    const intent = await this.stripe.paymentIntents.create({
      amount: amountCents,
      currency,
      metadata,
    });
    return { id: intent.id, clientSecret: intent.client_secret! };
  }

  async confirmPayment(paymentIntentId: string) {
    const intent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
    return { status: intent.status };
  }

  async createRefund(paymentIntentId: string, amountCents?: number) {
    const refund = await this.stripe.refunds.create({
      payment_intent: paymentIntentId,
      ...(amountCents !== undefined && { amount: amountCents }),
    });
    return { id: refund.id, status: refund.status ?? 'succeeded' };
  }
}

export class PaymentService {
  private gateway?: PaymentGateway;

  constructor(gateway?: PaymentGateway) {
    if (gateway) {
      this.gateway = gateway;
    }
    // Default gateway is lazy — only instantiated when first method is called
  }

  private getGateway(): PaymentGateway {
    if (!this.gateway) {
      this.gateway = new StripeGateway(process.env.STRIPE_SECRET_KEY ?? '');
    }
    return this.gateway;
  }

  /**
   * Creates a payment intent for an invoice.
   * Requirements: 6.1, 6.2
   */
  async createPaymentIntent(invoiceId: string, customerId: string) {
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new Error('Invoice not found');
    if (invoice.status === InvoiceStatus.PAID) throw new Error('Invoice is already paid');

    const amountCents = Math.round(Number(invoice.total) * 100);

    const intent = await this.getGateway().createPaymentIntent(amountCents, 'aud', {
      invoiceId,
      customerId,
      invoiceNumber: invoice.invoiceNumber,
    });

    // Create a PENDING payment record
    const payment = await prisma.payment.create({
      data: {
        invoiceId,
        customerId,
        amount: invoice.total,
        currency: 'AUD',
        status: PaymentStatus.PENDING,
        gatewayPaymentId: intent.id,
        paymentMethod: { type: 'card' },
      },
    });

    return { payment, clientSecret: intent.clientSecret };
  }

  /**
   * Records a successful payment (e.g. from Stripe webhook).
   * Requirements: 6.3
   */
  async recordPayment(gatewayPaymentId: string) {
    const payment = await prisma.payment.findFirst({
      where: { gatewayPaymentId },
    });
    if (!payment) throw new Error('Payment record not found');

    return prisma.$transaction(async (tx) => {
      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.PAID,
          paidAt: new Date(),
        },
      });

      // Mark invoice as paid
      await tx.invoice.update({
        where: { id: payment.invoiceId },
        data: {
          status: InvoiceStatus.PAID,
          paidDate: new Date(),
        },
      });

      return updated;
    });
  }

  /**
   * Processes a refund for a payment.
   * Requirements: 9.3, 26.3
   */
  async refundPayment(paymentId: string, amountCents?: number) {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new Error('Payment not found');
    if (payment.status !== PaymentStatus.PAID) throw new Error('Payment is not in PAID status');
    if (!payment.gatewayPaymentId) throw new Error('No gateway payment ID on record');

    const refund = await this.getGateway().createRefund(payment.gatewayPaymentId, amountCents);
    void refund; // result used for status tracking in future

    const isPartial = amountCents !== undefined && amountCents < Math.round(Number(payment.amount) * 100);

    return prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: isPartial ? PaymentStatus.PARTIALLY_REFUNDED : PaymentStatus.REFUNDED,
      },
    });
  }

  /**
   * Gets a payment by ID.
   */
  async getPayment(id: string) {
    const payment = await prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new Error('Payment not found');
    return payment;
  }

  /**
   * Lists payments for an invoice.
   */
  async listPaymentsByInvoice(invoiceId: string) {
    return prisma.payment.findMany({
      where: { invoiceId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export const paymentService = new PaymentService();
