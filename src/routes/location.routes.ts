import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { locationService } from '../services/location.service';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();

router.use(authenticate);

const addressSchema = z.object({
  street: z.string().optional(),
  suburb: z.string().optional(),
  state: z.string().optional(),
  postcode: z.string().optional(),
  country: z.string().optional(),
});

const createLocationSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  address: addressSchema,
  contactPhone: z.string().optional(),
});

const updateLocationSchema = z.object({
  name: z.string().min(1).optional(),
  address: addressSchema.optional(),
  contactPhone: z.string().optional(),
});

/**
 * POST /api/locations
 * Create a location (admin only).
 * Requirements: 28.1
 */
router.post('/', authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const data = createLocationSchema.parse(req.body);
    const location = await locationService.createLocation(data);
    res.status(201).json({ success: true, data: location });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/locations
 * List all locations.
 * Requirements: 28.1
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const locations = await locationService.getAllLocations();
    res.json({ success: true, data: locations });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/locations/:id
 * Get a location by ID.
 * Requirements: 28.1
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const location = await locationService.getLocationById(req.params.id);
    res.json({ success: true, data: location });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * PUT /api/locations/:id
 * Update a location (admin only).
 * Requirements: 28.1
 */
router.put('/:id', authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const data = updateLocationSchema.parse(req.body);
    const location = await locationService.updateLocation(req.params.id, data);
    res.json({ success: true, data: location });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * DELETE /api/locations/:id
 * Delete a location (admin only).
 * Requirements: 28.1
 */
router.delete('/:id', authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    await locationService.deleteLocation(req.params.id);
    res.json({ success: true, data: { message: 'Location deleted successfully' } });
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
    if (error.message === 'Location not found') {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      });
      return;
    }

    if (error.message === 'Cannot delete location with associated classes') {
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
