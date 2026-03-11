import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { enrolmentService } from '../services/enrolment.service';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole, EnrolmentStatus } from '@prisma/client';

const router = Router();

router.use(authenticate);

const enrolmentStatusValues = Object.values(EnrolmentStatus) as [string, ...string[]];

const createEnrolmentSchema = z.object({
  dancerId: z.string().min(1, 'Dancer ID is required'),
  classId: z.string().min(1, 'Class ID is required'),
  startDate: z.string().datetime().transform((v) => new Date(v)),
  isTrial: z.boolean().optional(),
  status: z.enum(enrolmentStatusValues as [EnrolmentStatus, ...EnrolmentStatus[]]).optional(),
});

const cancelEnrolmentSchema = z.object({
  effectiveDate: z.string().datetime().transform((v) => new Date(v)),
});

const moveEnrolmentSchema = z.object({
  newClassId: z.string().min(1, 'New class ID is required'),
});

/**
 * POST /api/enrolments/bulk
 * Bulk enrol multiple dancers (admin only). All-or-nothing transaction.
 * Requirements: 4.1, 25.1, 25.4
 */
const bulkEnrolSchema = z.object({
  items: z.array(z.object({
    dancerId: z.string().min(1),
    classId: z.string().min(1),
    startDate: z.string().datetime().transform((v) => new Date(v)),
    isTrial: z.boolean().optional(),
  })).min(1, 'At least one enrolment item is required'),
});

router.post('/bulk', authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const { items } = bulkEnrolSchema.parse(req.body);
    const adminUserId = req.user!.userId;
    const enrolments = await enrolmentService.bulkEnrol(items, adminUserId);
    res.status(201).json({ success: true, data: enrolments });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * POST /api/enrolments
 * Create an enrolment (authenticated).
 * Requirements: 4.1, 4.4, 4.7, 19.5
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = createEnrolmentSchema.parse(req.body);
    const enrolment = await enrolmentService.createEnrolment(data);
    res.status(201).json({ success: true, data: enrolment });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/enrolments
 * List enrolments (admin only). Supports ?classId=, ?dancerId=, ?status= query params.
 * Requirements: 9.5
 */
router.get('/', authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const { classId, dancerId, status } = req.query;

    const filters: { classId?: string; dancerId?: string; status?: EnrolmentStatus } = {};
    if (typeof classId === 'string') filters.classId = classId;
    if (typeof dancerId === 'string') filters.dancerId = dancerId;
    if (typeof status === 'string' && enrolmentStatusValues.includes(status)) {
      filters.status = status as EnrolmentStatus;
    }

    const enrolments = await enrolmentService.listEnrolments(filters);
    res.json({ success: true, data: enrolments });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/enrolments/:id
 * Get enrolment by ID (authenticated).
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const enrolment = await enrolmentService.getEnrolment(req.params.id);
    res.json({ success: true, data: enrolment });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * POST /api/enrolments/:id/cancel
 * Cancel an enrolment (admin only).
 * Requirements: 9.2, 9.6
 */
router.post('/:id/cancel', authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const { effectiveDate } = cancelEnrolmentSchema.parse(req.body);
    const adminUserId = req.user!.userId;
    const enrolment = await enrolmentService.cancelEnrolment(req.params.id, effectiveDate, adminUserId);
    res.json({ success: true, data: enrolment });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * POST /api/enrolments/:id/move
 * Move enrolment to a different class (admin only).
 * Requirements: 9.1
 */
router.post('/:id/move', authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const { newClassId } = moveEnrolmentSchema.parse(req.body);
    const adminUserId = req.user!.userId;
    const enrolment = await enrolmentService.moveEnrolment(req.params.id, newClassId, adminUserId);
    res.json({ success: true, data: enrolment });
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
    const notFoundMessages = [
      'Dancer not found',
      'Class not found',
      'Enrolment not found',
      'Target class not found',
    ];
    if (notFoundMessages.includes(error.message)) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      });
      return;
    }

    const conflictMessages = [
      'Class is at full capacity',
      'Dancer is already actively enrolled in this class',
      'Target class is at full capacity',
    ];
    if (conflictMessages.includes(error.message)) {
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
