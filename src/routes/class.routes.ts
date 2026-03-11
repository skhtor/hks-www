import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { classService } from '../services/class.service';
import { teacherService } from '../services/teacher.service';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole, DayOfWeek } from '@prisma/client';

const router = Router();

// All class routes require authentication
router.use(authenticate);

const dayOfWeekValues = Object.values(DayOfWeek) as [string, ...string[]];

// Validation schemas
const createClassSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  style: z.string().min(1, 'Style is required'),
  level: z.string().min(1, 'Level is required'),
  dayOfWeek: z.enum(dayOfWeekValues as [DayOfWeek, ...DayOfWeek[]], {
    errorMap: () => ({ message: 'Valid day of week is required' }),
  }),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Start time must be in HH:MM format'),
  duration: z.number().int().positive('Duration must be a positive integer (minutes)'),
  locationId: z.string().min(1, 'Location is required'),
  teacherId: z.string().min(1, 'Teacher is required'),
  capacity: z.number().int().positive('Capacity must be a positive integer'),
  pricingRuleId: z.string().min(1, 'Pricing rule is required'),
  description: z.string().optional(),
  ageRange: z
    .object({ min: z.number().int().nonnegative().optional(), max: z.number().int().nonnegative().optional() })
    .optional(),
  roomId: z.string().optional(),
  startDate: z.string().datetime().optional().transform((v) => (v ? new Date(v) : undefined)),
  endDate: z.string().datetime().optional().transform((v) => (v ? new Date(v) : undefined)),
});

const updateClassSchema = z.object({
  name: z.string().min(1).optional(),
  style: z.string().min(1).optional(),
  level: z.string().min(1).optional(),
  dayOfWeek: z.enum(dayOfWeekValues as [DayOfWeek, ...DayOfWeek[]]).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  duration: z.number().int().positive().optional(),
  locationId: z.string().min(1).optional(),
  teacherId: z.string().min(1).optional(),
  capacity: z.number().int().positive().optional(),
  pricingRuleId: z.string().min(1).optional(),
  description: z.string().optional(),
  ageRange: z
    .object({ min: z.number().int().nonnegative().optional(), max: z.number().int().nonnegative().optional() })
    .optional(),
  roomId: z.string().optional(),
  startDate: z.string().datetime().optional().transform((v) => (v ? new Date(v) : undefined)),
  endDate: z.string().datetime().optional().transform((v) => (v ? new Date(v) : undefined)),
});

const timetableFilterSchema = z.object({
  level: z.string().optional(),
  style: z.string().optional(),
  locationId: z.string().optional(),
  teacherId: z.string().optional(),
  dayOfWeek: z.enum(dayOfWeekValues as [DayOfWeek, ...DayOfWeek[]]).optional(),
  ageGroup: z.string().optional(),
});

/**
 * POST /api/classes
 * Create a class (admin only).
 * Requirements: 8.1, 8.2
 */
router.post('/', authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const validatedData = createClassSchema.parse(req.body);
    const cls = await classService.createClass(validatedData);
    res.status(201).json({ success: true, data: cls });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/classes
 * List/filter classes (timetable). Accessible to all authenticated users.
 * Requirements: 3.1, 3.2
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const filters = timetableFilterSchema.parse(req.query);
    const classes = await classService.getTimetable(filters);
    res.json({ success: true, data: classes });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/classes/teacher/:teacherId
 * Get classes for a specific teacher.
 * Requirements: 2.3, 7.1
 */
router.get('/teacher/:teacherId', authorize(UserRole.ADMIN, UserRole.TEACHER), async (req: Request, res: Response) => {
  try {
    // Teachers can only view their own classes
    if (req.user!.role === UserRole.TEACHER) {
      const ownProfile = await teacherService.getTeacherByUserId(req.user!.userId);
      if (ownProfile.id !== req.params.teacherId) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        });
        return;
      }
    }

    const classes = await classService.getClassesForTeacher(req.params.teacherId);
    res.json({ success: true, data: classes });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/classes/:id
 * Get a class by ID.
 * Requirements: 8.3
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const cls = await classService.getClassById(req.params.id);
    res.json({ success: true, data: cls });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * PUT /api/classes/:id
 * Update a class (admin only).
 * Requirements: 8.3
 */
router.put('/:id', authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const validatedData = updateClassSchema.parse(req.body);
    const cls = await classService.updateClass(req.params.id, validatedData);
    res.json({ success: true, data: cls });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * DELETE /api/classes/:id
 * Delete a class (admin only).
 * Requirements: 8.4
 */
router.delete('/:id', authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    await classService.deleteClass(req.params.id);
    res.json({ success: true, data: { message: 'Class deleted successfully' } });
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
    if (error.message === 'Class not found' || error.message === 'Teacher not found') {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      });
      return;
    }

    if (error.message === 'Cannot delete class with active enrolments') {
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
