import { PrismaClient, PaymentStatus, InvoiceStatus, SubscriptionStatus } from '@prisma/client';
import Stripe from 'stripe';

export interface ReceiptLineItem {
  description: string;
  amount: number;
  type: string;
}

export interface Receipt {
  receiptNumber: string;
  paymentId: string;
  invoiceNumber: string;
  issuedAt: Date;
  customer: { id: string; name: string };
  amount: number;
  currency: string;
  status: PaymentStatus;
  gatewayPaymentId: string | null;
  lineItems: ReceiptLineItem[];
  subtotal: number;
  discountAmount: number;
  gstAmount: number;
  total: number;
}

const prisma = new PrismaClient();

// Gateway abstraction — allows test injection without live Stripe
export interface PaymentGateway {
  createPaymentIntent(amountCents: number, currency: string, metadata: Record<string, string>): Promise<{ id: string; clientSecret: string }>;
  confirmPayment(paymentIntentId: string): Promise<{ status: string }>;
  createRefund(paymentIntentId: string, amountCents?: number): Promise<{ id: string; status: string }>;
  // Subscription / recurring payment methods
  createCustomer(email: string, name: string): Promise<{ id: string }>;
  attachPaymentMethod(customerId: string, paymentMethodId: string): Promise<void>;
  createSubscription(customerId: string, priceId: string, paymentMethodId: string): Promise<{ id: string; status: string }>;
  cancelSubscription(subscriptionId: string): Promise<{ id: string; status: string }>;
  updateDefaultPaymentMethod(customerId: string, paymentMethodId: string): Promise<void>;
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

  async createCustomer(email: string, name: string) {
    const customer = await this.stripe.customers.create({ email, name });
    return { id: customer.id };
  }

  async attachPaymentMethod(customerId: string, paymentMethodId: string) {
    await this.stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
  }

  async createSubscription(customerId: string, priceId: string, paymentMethodId: string) {
    const subscription = await this.stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      default_payment_method: paymentMethodId,
    });
    return { id: subscription.id, status: subscription.status };
  }

  async cancelSubscription(subscriptionId: string) {
    const subscription = await this.stripe.subscriptions.cancel(subscriptionId);
    return { id: subscription.id, status: subscription.status };
  }

  async updateDefaultPaymentMethod(customerId: string, paymentMethodId: string) {
    await this.stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
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

  /**
   * Marks a payment as FAILED (e.g. from Stripe webhook payment_intent.payment_failed).
   * Requirements: 6.5
   */
  async markPaymentFailed(gatewayPaymentId: string) {
    const payment = await prisma.payment.findFirst({ where: { gatewayPaymentId } });
    if (!payment) throw new Error('Payment record not found');

    return prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.FAILED },
    });
  }

  /**
   * Generates a structured JSON receipt for a completed payment.
   * Requirements: 6.4
   */
  async generateReceipt(paymentId: string): Promise<Receipt> {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        invoice: {
          include: { customer: true },
        },
      },
    });

    if (!payment) throw new Error('Payment not found');
    if (payment.status !== PaymentStatus.PAID) throw new Error('Receipt only available for paid payments');

    const invoice = payment.invoice;
    const customer = invoice.customer;

    return {
      receiptNumber: `REC-${payment.id.slice(0, 8).toUpperCase()}`,
      paymentId: payment.id,
      invoiceNumber: invoice.invoiceNumber,
      issuedAt: payment.paidAt ?? payment.createdAt,
      customer: {
        id: customer.id,
        name: customer.name,
      },
      amount: Number(payment.amount),
      currency: payment.currency,
      status: payment.status,
      gatewayPaymentId: payment.gatewayPaymentId,
      lineItems: invoice.lineItems as unknown as ReceiptLineItem[],
      subtotal: Number(invoice.subtotal),
      discountAmount: Number(invoice.discountAmount),
      gstAmount: Number(invoice.gstAmount),
      total: Number(invoice.total),
    };
  }

  /**
   * Sets up a recurring subscription for a customer.
   * Creates a Stripe Customer, attaches the tokenized payment method, and stores
   * only the Stripe IDs (never raw card data) in the database.
   * Requirements: 6.6, 18.3
   */
  async createSubscription(customerId: string, paymentMethodId: string, priceId: string) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: { user: true },
    });
    if (!customer) throw new Error('Customer not found');

    // Create a Stripe Customer to hold the payment method securely
    const stripeCustomer = await this.getGateway().createCustomer(
      customer.user.email,
      customer.name,
    );

    // Attach the tokenized payment method to the Stripe customer
    await this.getGateway().attachPaymentMethod(stripeCustomer.id, paymentMethodId);

    // Create the Stripe subscription
    const stripeSubscription = await this.getGateway().createSubscription(
      stripeCustomer.id,
      priceId,
      paymentMethodId,
    );

    // Persist only Stripe tokens — never raw card data (Req 18.3)
    const subscription = await prisma.subscription.create({
      data: {
        customerId,
        stripeCustomerId: stripeCustomer.id,
        stripeSubscriptionId: stripeSubscription.id,
        stripePaymentMethodId: paymentMethodId, // tokenized PM ID, not card number
        status: SubscriptionStatus.ACTIVE,
      },
    });

    return subscription;
  }

  /**
   * Cancels an active subscription.
   * Requirements: 6.6
   */
  async cancelSubscription(subscriptionId: string) {
    const subscription = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
    if (!subscription) throw new Error('Subscription not found');
    if (subscription.status === SubscriptionStatus.CANCELLED) {
      throw new Error('Subscription is already cancelled');
    }

    if (subscription.stripeSubscriptionId) {
      await this.getGateway().cancelSubscription(subscription.stripeSubscriptionId);
    }

    return prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: SubscriptionStatus.CANCELLED },
    });
  }

  /**
   * Updates the default payment method for a customer's subscription.
   * Stores only the new tokenized payment method ID — never raw card data.
   * Requirements: 6.6, 18.3
   */
  async updatePaymentMethod(subscriptionId: string, newPaymentMethodId: string) {
    const subscription = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
    if (!subscription) throw new Error('Subscription not found');
    if (subscription.status === SubscriptionStatus.CANCELLED) {
      throw new Error('Cannot update payment method on a cancelled subscription');
    }

    // Attach new payment method to the Stripe customer
    await this.getGateway().attachPaymentMethod(subscription.stripeCustomerId, newPaymentMethodId);

    // Update the default payment method on the Stripe customer
    await this.getGateway().updateDefaultPaymentMethod(
      subscription.stripeCustomerId,
      newPaymentMethodId,
    );

    // Persist only the new token — never raw card data (Req 18.3)
    return prisma.subscription.update({
      where: { id: subscriptionId },
      data: { stripePaymentMethodId: newPaymentMethodId },
    });
  }

  /**
   * Lists all subscriptions for a customer.
   */
  async listSubscriptions(customerId: string) {
    return prisma.subscription.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export const paymentService = new PaymentService();
