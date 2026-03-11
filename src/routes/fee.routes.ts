import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PricingRuleType, DiscountType } from '@prisma/client';
import { feeService } from '../services/fee.service';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();

// All fee routes require authentication and admin role
router.use(authenticate);

// Validation schemas
const createPricingRuleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.nativeEnum(PricingRuleType),
  classCountMin: z.number().int().min(0, 'classCountMin must be >= 0'),
  classCountMax: z.number().int().min(1).optional(),
  monthlyFee: z.number().min(0, 'monthlyFee must be >= 0'),
  termFee: z.number().min(0).optional(),
  locationId: z.string().uuid().optional(),
  priority: z.number().int().min(0, 'priority must be >= 0'),
  active: z.boolean().optional(),
});

const updatePricingRuleSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.nativeEnum(PricingRuleType).optional(),
  classCountMin: z.number().int().min(0).optional(),
  classCountMax: z.number().int().min(1).optional().nullable(),
  monthlyFee: z.number().min(0).optional(),
  termFee: z.number().min(0).optional().nullable(),
  locationId: z.string().uuid().optional().nullable(),
  priority: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

/**
 * POST /api/fees/pricing-rules
 * Create a new pricing rule (admin only)
 * Requirements: 5.1, 5.2, 5.5, 22.2
 */
router.post('/pricing-rules', authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const data = createPricingRuleSchema.parse(req.body);
    const rule = await feeService.createPricingRule(data);
    res.status(201).json({ success: true, data: rule });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/fees/pricing-rules
 * List all pricing rules (admin only)
 * Requirements: 22.1
 */
router.get('/pricing-rules', authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const activeOnly = req.query.activeOnly === 'true';
    const rules = await feeService.listPricingRules(activeOnly);
    res.json({ success: true, data: rules });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/fees/pricing-rules/:id
 * Get a pricing rule by ID (admin only)
 * Requirements: 22.1
 */
router.get('/pricing-rules/:id', authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const rule = await feeService.getPricingRule(req.params.id);
    res.json({ success: true, data: rule });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * PUT /api/fees/pricing-rules/:id
 * Update a pricing rule (admin only)
 * Requirements: 5.5, 22.1
 */
router.put('/pricing-rules/:id', authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const data = updatePricingRuleSchema.parse(req.body);
    const rule = await feeService.updatePricingRule(req.params.id, data as any);
    res.json({ success: true, data: rule });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * DELETE /api/fees/pricing-rules/:id
 * Delete a pricing rule (admin only)
 * Requirements: 22.1
 */
router.delete('/pricing-rules/:id', authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    await feeService.deletePricingRule(req.params.id);
    res.json({ success: true, data: { message: 'Pricing rule deleted successfully' } });
  } catch (error) {
    handleError(error, res);
  }
});

// ─── Discount Rule Schemas ────────────────────────────────────────────────────

const createDiscountRuleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.nativeEnum(DiscountType),
  value: z.number().min(0, 'value must be >= 0'),
  eligibilityCriteria: z.record(z.unknown()).default({}),
  priority: z.number().int().min(0, 'priority must be >= 0'),
  active: z.boolean().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

const updateDiscountRuleSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.nativeEnum(DiscountType).optional(),
  value: z.number().min(0).optional(),
  eligibilityCriteria: z.record(z.unknown()).optional(),
  priority: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
});

/**
 * POST /api/fees/discount-rules
 * Create a new discount rule (admin only)
 * Requirements: 5.3, 5.4, 22.3
 */
router.post('/discount-rules', authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const data = createDiscountRuleSchema.parse(req.body);
    const rule = await feeService.createDiscountRule({
      ...data,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate ? new Date(data.endDate) : undefined,
    });
    res.status(201).json({ success: true, data: rule });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/fees/discount-rules
 * List all discount rules (admin only)
 * Requirements: 22.3
 */
router.get('/discount-rules', authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const activeOnly = req.query.activeOnly === 'true';
    const rules = await feeService.listDiscountRules(activeOnly);
    res.json({ success: true, data: rules });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/fees/discount-rules/:id
 * Get a discount rule by ID (admin only)
 * Requirements: 22.3
 */
router.get('/discount-rules/:id', authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const rule = await feeService.getDiscountRule(req.params.id);
    res.json({ success: true, data: rule });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * PUT /api/fees/discount-rules/:id
 * Update a discount rule (admin only)
 * Requirements: 22.3
 */
router.put('/discount-rules/:id', authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const data = updateDiscountRuleSchema.parse(req.body);
    const rule = await feeService.updateDiscountRule(req.params.id, {
      ...data,
      startDate: data.startDate === null ? null : data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate === null ? null : data.endDate ? new Date(data.endDate) : undefined,
    });
    res.json({ success: true, data: rule });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * DELETE /api/fees/discount-rules/:id
 * Delete a discount rule (admin only)
 * Requirements: 22.3
 */
router.delete('/discount-rules/:id', authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    await feeService.deleteDiscountRule(req.params.id);
    res.json({ success: true, data: { message: 'Discount rule deleted successfully' } });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * POST /api/fees/calculate
 * Calculate fees for a given enrolment scenario (authenticated users)
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.7, 5.8
 */
const calculateFeeSchema = z.object({
  classCount: z.number().int().min(1, 'classCount must be >= 1'),
  locationId: z.string().uuid().optional(),
  discountIds: z.array(z.string().uuid()).optional(),
  oneTimeFeeAmount: z.number().min(0).optional(),
});

router.post('/calculate', async (req: Request, res: Response) => {
  try {
    const data = calculateFeeSchema.parse(req.body);
    const result = await feeService.calculateFee(data);
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
    if (
      error.message === 'Pricing rule not found' ||
      error.message === 'Discount rule not found' ||
      error.message === 'No applicable pricing rule found for the given class count'
    ) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      });
      return;
    }

    if (error.message === 'Cannot delete pricing rule that is assigned to classes') {
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
