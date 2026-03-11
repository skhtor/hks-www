import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { classService, TimetableFilters } from '../services/class.service';
import { getRedisClient } from '../config/redis';
import { DayOfWeek } from '@prisma/client';

const router = Router();

const CACHE_TTL_SECONDS = 300; // 5 minutes

const dayOfWeekValues = Object.values(DayOfWeek) as [string, ...string[]];

const timetableQuerySchema = z.object({
  view: z.enum(['week', 'list']).default('list'),
  level: z.string().optional(),
  style: z.string().optional(),
  locationId: z.string().optional(),
  teacherId: z.string().optional(),
  dayOfWeek: z.enum(dayOfWeekValues as [DayOfWeek, ...DayOfWeek[]]).optional(),
  ageGroup: z.string().optional(),
});

/**
 * Groups an array of classes by dayOfWeek.
 */
function groupByDay(classes: unknown[]): Record<string, unknown[]> {
  const grouped: Record<string, unknown[]> = {};
  for (const cls of classes as Array<{ dayOfWeek: string }>) {
    if (!grouped[cls.dayOfWeek]) {
      grouped[cls.dayOfWeek] = [];
    }
    grouped[cls.dayOfWeek].push(cls);
  }
  return grouped;
}

/**
 * Builds a stable cache key from the view and filters.
 */
function buildCacheKey(view: string, filters: TimetableFilters): string {
  const filtersHash = crypto
    .createHash('md5')
    .update(JSON.stringify(filters, Object.keys(filters).sort()))
    .digest('hex');
  return `timetable:${view}:${filtersHash}`;
}

/**
 * GET /api/timetable
 * Public endpoint — no auth required.
 * Returns all active classes in week-grid or list format.
 * Supports Redis caching with 5-minute TTL.
 * Requirements: 3.1, 3.5
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { view, ...filterParams } = timetableQuerySchema.parse(req.query);

    const filters: TimetableFilters = {};
    if (filterParams.level) filters.level = filterParams.level;
    if (filterParams.style) filters.style = filterParams.style;
    if (filterParams.locationId) filters.locationId = filterParams.locationId;
    if (filterParams.teacherId) filters.teacherId = filterParams.teacherId;
    if (filterParams.dayOfWeek) filters.dayOfWeek = filterParams.dayOfWeek;
    if (filterParams.ageGroup) filters.ageGroup = filterParams.ageGroup;

    const cacheKey = buildCacheKey(view, filters);

    // Try cache first
    try {
      const redis = getRedisClient();
      if (redis.isOpen) {
        const cached = await redis.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          return res.json({ success: true, data: parsed, cached: true });
        }
      }
    } catch {
      // Redis unavailable — fall through to DB
    }

    const classes = await classService.getTimetable(filters);

    const data = view === 'week' ? groupByDay(classes) : classes;

    // Store in cache
    try {
      const redis = getRedisClient();
      if (redis.isOpen) {
        await redis.setEx(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(data));
      }
    } catch {
      // Cache write failure is non-fatal
    }

    return res.json({ success: true, data });
  } catch (error) {
    return handleError(error, res);
  }
});

/**
 * GET /api/timetable/capacity/:classId
 * Public endpoint — no auth required.
 * Returns remaining capacity for a specific class.
 * Requirements: 3.3, 3.4
 */
router.get('/capacity/:classId', async (req: Request, res: Response) => {
  try {
    const capacity = await classService.getClassCapacity(req.params.classId);
    return res.json({ success: true, data: capacity });
  } catch (error) {
    return handleError(error, res);
  }
});

function handleError(error: unknown, res: Response): Response {
  if (error instanceof z.ZodError) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid query parameters',
        details: error.errors.reduce(
          (acc, err) => {
            acc[err.path.join('.')] = err.message;
            return acc;
          },
          {} as Record<string, string>,
        ),
      },
    });
  }

  if (error instanceof Error && error.message === 'Class not found') {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: error.message },
    });
  }

  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
}

export default router;
