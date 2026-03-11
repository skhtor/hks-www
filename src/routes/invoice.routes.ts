import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { InvoiceStatus } from '@prisma/client';
import { invoiceService } from '../services/invoice.service';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();

const generateInvoiceSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID'),
  householdId: z.string().uuid('Invalid household ID'),
  dueDate: z.string().datetime({ message: 'Invalid due date' }),
  idempotencyKey: z.string().min(1, 'Idempotency key is required'),
  feeResult: z.object({
    pricingRule: z
      .object({
        id: z.string(),
        name: z.string(),
        type: z.string(),
        monthlyFee: z.number(),
      })
      .nullable(),
    appliedDiscounts: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        type: z.string(),
        amount: z.number(),
      })
    ),
    subtotal: z.number().nonnegative(),
    discountAmount: z.number().nonnegative(),
    oneTimeFee: z.number().nonnegative(),
    gstAmount: z.number().nonnegative(),
    total: z.number().nonnegative(),
    lineItems: z.array(
      z.object({
        description: z.string(),
        amount: z.number(),
        type: z.enum(['base_fee', 'discount', 'one_time_fee', 'gst']),
      })
    ),
  }),
});

const updateStatusSchema = z.object({
  status: z.nativeEnum(InvoiceStatus),
});

/**
 * POST /api/invoices
 * Generate an invoice (admin only).
 * Requirements: 11.1, 19.1, 19.4
 */
router.post(
  '/',
  authenticate,
  authorize(UserRole.ADMIN),
  async (req: Request, res: Response) => {
    try {
      const body = generateInvoiceSchema.parse(req.body);
      const invoice = await invoiceService.generateInvoice({
        customerId: body.customerId,
        householdId: body.householdId,
        feeResult: body.feeResult,
        dueDate: new Date(body.dueDate),
        idempotencyKey: body.idempotencyKey,
      });
      res.status(201).json({ success: true, data: invoice });
    } catch (error) {
      handleError(error, res);
    }
  }
);

/**
 * POST /api/invoices/mark-overdue
 * Mark all overdue invoices (admin only, for scheduled job trigger).
 * Requirements: 6.8
 */
router.post(
  '/mark-overdue',
  authenticate,
  authorize(UserRole.ADMIN),
  async (_req: Request, res: Response) => {
    try {
      const count = await invoiceService.markOverdueInvoices();
      res.json({ success: true, data: { markedCount: count } });
    } catch (error) {
      handleError(error, res);
    }
  }
);

/**
 * GET /api/invoices/customer/:customerId
 * List invoices for a customer (authenticated).
 * Requirements: 19.1
 */
router.get(
  '/customer/:customerId',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const invoices = await invoiceService.listInvoicesByCustomer(req.params.customerId);
      res.json({ success: true, data: invoices });
    } catch (error) {
      handleError(error, res);
    }
  }
);

/**
 * GET /api/invoices/:id
 * Get an invoice by ID (authenticated).
 * Requirements: 19.1
 */
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const invoice = await invoiceService.getInvoice(req.params.id);
    res.json({ success: true, data: invoice });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * PATCH /api/invoices/:id/status
 * Update invoice status (admin only).
 * Requirements: 6.7, 6.8
 */
router.patch(
  '/:id/status',
  authenticate,
  authorize(UserRole.ADMIN),
  async (req: Request, res: Response) => {
    try {
      const { status } = updateStatusSchema.parse(req.body);
      const invoice = await invoiceService.updateInvoiceStatus(req.params.id, status);
      res.json({ success: true, data: invoice });
    } catch (error) {
      handleError(error, res);
    }
  }
);

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
      error.message === 'Invoice not found' ||
      error.message === 'Customer not found' ||
      error.message === 'Household not found'
    ) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
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
