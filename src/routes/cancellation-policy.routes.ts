import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { cancellationPolicyService } from '../services/cancellation-policy.service';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();

/**
 * GET /api/cancellation-policies/public
 * Returns the default active cancellation policy in a customer-friendly format.
 * No authentication required.
 * Requirements: 26.5
 */
router.get('/public', async (_req: Request, res: Response) => {
  try {
    const policy = await cancellationPolicyService.getDefaultPolicy();
    if (!policy) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'No cancellation policy is currently available' },
      });
      return;
    }
    const noticePeriodDays = Number(policy.noticePeriodDays);
    const refundPercentage = Number(policy.refundPercentage);
    const description =
      refundPercentage > 0
        ? `Cancel ${noticePeriodDays} day${noticePeriodDays !== 1 ? 's' : ''} or more before your class for a ${refundPercentage}% refund`
        : `Cancellations within ${noticePeriodDays} day${noticePeriodDays !== 1 ? 's' : ''} are not eligible for a refund`;
    res.json({
      success: true,
      data: {
        policyName: policy.name,
        noticePeriodDays,
        refundPercentage,
        description,
      },
    });
  } catch (error) {
    handleError(error, res);
  }
});

router.use(authenticate);

const createPolicySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  noticePeriodDays: z.number().int().min(0, 'Notice period must be a non-negative integer'),
  refundPercentage: z.number().min(0).max(100, 'Refund percentage must be between 0 and 100'),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

const updatePolicySchema = z.object({
  name: z.string().min(1).optional(),
  noticePeriodDays: z.number().int().min(0).optional(),
  refundPercentage: z.number().min(0).max(100).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

const calculateRefundSchema = z.object({
  daysNotice: z.number().int().min(0),
  baseAmount: z.number().min(0),
});

/**
 * POST /api/cancellation-policies
 * Create a cancellation policy (admin only).
 * Requirements: 26.1
 */
router.post('/', authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const data = createPolicySchema.parse(req.body);
    const policy = await cancellationPolicyService.createPolicy(data);
    res.status(201).json({ success: true, data: policy });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/cancellation-policies
 * List all cancellation policies.
 * Accepts ?activeOnly=true to filter to active policies only.
 * Requirements: 26.1
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const activeOnly = req.query.activeOnly === 'true';
    const policies = await cancellationPolicyService.listPolicies(activeOnly);
    res.json({ success: true, data: policies });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/cancellation-policies/default
 * Get the default cancellation policy.
 * Requirements: 26.1
 */
router.get('/default', async (_req: Request, res: Response) => {
  try {
    const policy = await cancellationPolicyService.getDefaultPolicy();
    if (!policy) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'No default cancellation policy configured' },
      });
      return;
    }
    res.json({ success: true, data: policy });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/cancellation-policies/:id
 * Get a cancellation policy by ID.
 * Requirements: 26.1
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const policy = await cancellationPolicyService.getPolicy(req.params.id);
    res.json({ success: true, data: policy });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * PUT /api/cancellation-policies/:id
 * Update a cancellation policy (admin only).
 * Requirements: 26.1
 */
router.put('/:id', authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const data = updatePolicySchema.parse(req.body);
    const policy = await cancellationPolicyService.updatePolicy(req.params.id, data);
    res.json({ success: true, data: policy });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * DELETE /api/cancellation-policies/:id
 * Delete a cancellation policy (admin only).
 * Requirements: 26.1
 */
router.delete('/:id', authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    await cancellationPolicyService.deletePolicy(req.params.id);
    res.json({ success: true, data: { message: 'Cancellation policy deleted successfully' } });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * POST /api/cancellation-policies/calculate-refund
 * Calculate refund amount based on days notice and base amount.
 * Requirements: 26.1, 26.2
 */
router.post('/calculate-refund', async (req: Request, res: Response) => {
  try {
    const { daysNotice, baseAmount } = calculateRefundSchema.parse(req.body);
    const result = await cancellationPolicyService.calculateRefund(daysNotice, baseAmount);
    res.json({ success: true, data: result });
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
    if (error.message === 'Cancellation policy not found') {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      });
      return;
    }

    if (
      error.message.includes('Refund percentage') ||
      error.message.includes('Notice period')
    ) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: error.message },
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
