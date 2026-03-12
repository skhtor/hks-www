import express, { Router, Request, Response } from 'express';
import { z } from 'zod';
import Stripe from 'stripe';
import { paymentService } from '../services/payment.service';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();

const createIntentSchema = z.object({
  invoiceId: z.string().min(1, 'Invoice ID is required'),
});

const refundSchema = z.object({
  amountCents: z.number().int().positive().optional(),
  reason: z.string().optional(),
});

const createSubscriptionSchema = z.object({
  paymentMethodId: z.string().min(1, 'Payment method ID is required'),
  priceId: z.string().min(1, 'Price ID is required'),
});

const updatePaymentMethodSchema = z.object({
  paymentMethodId: z.string().min(1, 'Payment method ID is required'),
});

/**
 * POST /api/payments/intent
 * Create a Stripe payment intent for an invoice.
 * Requirements: 6.1, 6.2
 */
router.post('/intent', authenticate, async (req: Request, res: Response) => {
  try {
    const { invoiceId } = createIntentSchema.parse(req.body);
    const customerId = req.user!.userId;

    const result = await paymentService.createPaymentIntent(invoiceId, customerId);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * POST /api/payments/webhook
 * Handle Stripe webhook events.
 * Requirements: 6.2, 6.3, 6.5
 *
 * Note: This endpoint uses express.raw() to receive the raw body for Stripe
 * signature verification. It must be registered before express.json() in app.ts,
 * or the raw body middleware here will override the parsed body for this route.
 */
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response) => {
    const sig = req.headers['stripe-signature'] as string | undefined;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event: Stripe.Event;

    if (webhookSecret && sig) {
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
          apiVersion: '2026-02-25.clover',
        });
        event = stripe.webhooks.constructEvent(req.body as Buffer, sig, webhookSecret);
      } catch {
        res.status(400).json({ success: false, error: 'Webhook signature verification failed' });
        return;
      }
    } else {
      // In development/test, accept unsigned events
      try {
        event = JSON.parse((req.body as Buffer).toString()) as Stripe.Event;
      } catch {
        res.status(400).json({ success: false, error: 'Invalid JSON body' });
        return;
      }
    }

    try {
      switch (event.type) {
        case 'payment_intent.succeeded': {
          const intent = event.data.object as Stripe.PaymentIntent;
          await paymentService.recordPayment(intent.id);
          break;
        }
        case 'payment_intent.payment_failed': {
          const intent = event.data.object as Stripe.PaymentIntent;
          await paymentService.markPaymentFailed(intent.id);
          break;
        }
        default:
          // Unhandled event type — acknowledge receipt
          break;
      }

      res.json({ received: true });
    } catch (error) {
      console.error('Webhook handler error:', error);
      res.status(500).json({ success: false, error: 'Webhook processing failed' });
    }
  }
);

/**
 * GET /api/payments/:id
 * Get a payment by ID (authenticated).
 * Requirements: 6.3
 */
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const payment = await paymentService.getPayment(req.params.id);
    res.json({ success: true, data: payment });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/payments/:id/receipt
 * Generate a receipt for a payment.
 * Requirements: 6.4
 */
router.get('/:id/receipt', authenticate, async (req: Request, res: Response) => {
  try {
    const receipt = await paymentService.generateReceipt(req.params.id);
    res.json({ success: true, data: receipt });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * POST /api/payments/:id/refund
 * Process a refund for a payment (admin only).
 * Requirements: 9.3, 26.3
 */
router.post('/:id/refund', authenticate, authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const { amountCents } = refundSchema.parse(req.body);
    const payment = await paymentService.refundPayment(req.params.id, amountCents);
    res.json({ success: true, data: payment });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * POST /api/payments/subscriptions
 * Set up a recurring subscription for the authenticated customer.
 * Stores only tokenized Stripe IDs — never raw card data.
 * Requirements: 6.6, 18.3
 */
router.post('/subscriptions', authenticate, async (req: Request, res: Response) => {
  try {
    const { paymentMethodId, priceId } = createSubscriptionSchema.parse(req.body);
    const customerId = req.user!.userId;
    const subscription = await paymentService.createSubscription(customerId, paymentMethodId, priceId);
    res.status(201).json({ success: true, data: subscription });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/payments/subscriptions
 * List subscriptions for the authenticated customer.
 * Requirements: 6.6
 */
router.get('/subscriptions', authenticate, async (req: Request, res: Response) => {
  try {
    const customerId = req.user!.userId;
    const subscriptions = await paymentService.listSubscriptions(customerId);
    res.json({ success: true, data: subscriptions });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * DELETE /api/payments/subscriptions/:id
 * Cancel a subscription (authenticated customer or admin).
 * Requirements: 6.6
 */
router.delete('/subscriptions/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const subscription = await paymentService.cancelSubscription(req.params.id);
    res.json({ success: true, data: subscription });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * PATCH /api/payments/subscriptions/:id/payment-method
 * Update the payment method for a subscription.
 * Stores only the new tokenized Stripe PaymentMethod ID — never raw card data.
 * Requirements: 6.6, 18.3
 */
router.patch('/subscriptions/:id/payment-method', authenticate, async (req: Request, res: Response) => {
  try {
    const { paymentMethodId } = updatePaymentMethodSchema.parse(req.body);
    const subscription = await paymentService.updatePaymentMethod(req.params.id, paymentMethodId);
    res.json({ success: true, data: subscription });
  } catch (error) {
    handleError(error, res);
  }
});

function handleError(error: unknown, res: Response): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input data',
        details: error.errors.reduce(
          (acc, err) => {
            acc[err.path.join('.')] = err.message;
            return acc;
          },
          {} as Record<string, string>
        ),
      },
    });
    return;
  }

  if (error instanceof Error) {
    if (
      error.message === 'Payment not found' ||
      error.message === 'Invoice not found' ||
      error.message === 'Customer not found' ||
      error.message === 'Subscription not found'
    ) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      });
      return;
    }

    if (
      error.message === 'Invoice is already paid' ||
      error.message === 'Payment is not in PAID status' ||
      error.message === 'Subscription is already cancelled' ||
      error.message === 'Cannot update payment method on a cancelled subscription'
    ) {
      res.status(409).json({
        success: false,
        error: { code: 'CONFLICT', message: error.message },
      });
      return;
    }
  }

  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
}

export default router;
