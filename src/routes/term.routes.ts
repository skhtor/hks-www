import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { termService } from '../services/term.service';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();

router.use(authenticate);

const createTermSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  startDate: z.string().datetime({ message: 'Invalid start date' }),
  endDate: z.string().datetime({ message: 'Invalid end date' }),
  termFeeMultiplier: z.number().positive().optional(),
  isActive: z.boolean().optional(),
});

const updateTermSchema = z.object({
  name: z.string().min(1).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  termFeeMultiplier: z.number().positive().nullable().optional(),
  isActive: z.boolean().optional(),
});

/**
 * POST /api/terms
 * Create a term (admin only).
 * Requirements: 8.7, 29.1
 */
router.post('/', authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const data = createTermSchema.parse(req.body);
    const term = await termService.createTerm(data);
    res.status(201).json({ success: true, data: term });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/terms
 * List all terms (authenticated).
 * Requirements: 8.7, 29.1
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const activeOnly = req.query.activeOnly === 'true';
    const terms = await termService.getAllTerms(activeOnly);
    res.json({ success: true, data: terms });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/terms/pricing/:classId
 * Get both monthly and term pricing options for a class.
 * Requirements: 29.1, 29.2
 */
router.get('/pricing/:classId', async (req: Request, res: Response) => {
  try {
    const options = await termService.getTermPricingOptions(req.params.classId);
    res.json({ success: true, data: options });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * POST /api/terms/:id/notify-end
 * Send term-end notifications to all enrolled customers (admin only).
 * Requirements: 29.4
 */
router.post('/:id/notify-end', authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const result = await termService.sendTermEndNotifications(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/terms/current
 * Get the currently active term.
 * Requirements: 8.7, 29.1
 */
router.get('/current', async (_req: Request, res: Response) => {
  try {
    const term = await termService.getCurrentTerm();
    res.json({ success: true, data: term });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/terms/:id
 * Get a term by ID (authenticated).
 * Requirements: 8.7, 29.1
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const term = await termService.getTermById(req.params.id);
    res.json({ success: true, data: term });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * PUT /api/terms/:id
 * Update a term (admin only).
 * Requirements: 8.7, 29.1
 */
router.put('/:id', authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const data = updateTermSchema.parse(req.body);
    const term = await termService.updateTerm(req.params.id, data);
    res.json({ success: true, data: term });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * DELETE /api/terms/:id
 * Delete a term (admin only).
 * Requirements: 8.7, 29.1
 */
router.delete('/:id', authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    await termService.deleteTerm(req.params.id);
    res.json({ success: true, data: { message: 'Term deleted successfully' } });
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
    if (error.message === 'Term not found' || error.message === 'Class not found') {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      });
      return;
    }

    if (
      error.message === 'End date must be after start date'
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
