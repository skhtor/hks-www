import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { dancerService } from '../services/dancer.service';
import { customerService } from '../services/customer.service';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();

// All dancer routes require authentication
router.use(authenticate);

// Validation schemas
const emergencyContactSchema = z.object({
  name: z.string().min(1, 'Emergency contact name is required'),
  phone: z.string().min(1, 'Emergency contact phone is required'),
  relationship: z.string().min(1, 'Emergency contact relationship is required'),
});

const createDancerSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  dateOfBirth: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid date of birth'),
  emergencyContact: emergencyContactSchema,
  medicalNotes: z.string().optional(),
  allergies: z.string().optional(),
  photoConsent: z.boolean().optional(),
  skillLevel: z.string().optional(),
});

const updateDancerSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  dateOfBirth: z
    .string()
    .refine((d) => !isNaN(Date.parse(d)), 'Invalid date of birth')
    .optional(),
  emergencyContact: emergencyContactSchema.optional(),
  medicalNotes: z.string().optional(),
  allergies: z.string().optional(),
  photoConsent: z.boolean().optional(),
  skillLevel: z.string().optional(),
});

/**
 * Helper to resolve the authenticated customer's ID.
 */
async function resolveCustomerId(req: Request): Promise<string> {
  const customer = await customerService.getCustomerByUserId(req.user!.userId);
  return customer.id;
}

/**
 * POST /api/dancers
 * Create a dancer profile linked to the authenticated customer's household.
 * Requirements: 1.4, 1.5
 */
router.post('/', authorize(UserRole.CUSTOMER), async (req: Request, res: Response) => {
  try {
    const validatedData = createDancerSchema.parse(req.body);
    const customerId = await resolveCustomerId(req);
    const dancer = await dancerService.addDancer(customerId, {
      ...validatedData,
      dateOfBirth: new Date(validatedData.dateOfBirth),
    });

    res.status(201).json({ success: true, data: dancer });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/dancers
 * List all dancers for the authenticated customer's household.
 */
router.get('/', authorize(UserRole.CUSTOMER, UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const customerId = await resolveCustomerId(req);
    const dancers = await dancerService.getDancersForCustomer(customerId);

    res.json({ success: true, data: dancers });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/dancers/:id
 * Get a specific dancer (ownership enforced).
 */
router.get('/:id', authorize(UserRole.CUSTOMER, UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const customerId = await resolveCustomerId(req);
    const dancer = await dancerService.getDancer(req.params.id, customerId);

    res.json({ success: true, data: dancer });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * PUT /api/dancers/:id
 * Update a dancer profile (ownership enforced).
 * Requirements: 1.5, 1.6
 */
router.put('/:id', authorize(UserRole.CUSTOMER), async (req: Request, res: Response) => {
  try {
    const validatedData = updateDancerSchema.parse(req.body);
    const customerId = await resolveCustomerId(req);
    const dancer = await dancerService.updateDancer(req.params.id, customerId, {
      ...validatedData,
      dateOfBirth: validatedData.dateOfBirth ? new Date(validatedData.dateOfBirth) : undefined,
    });

    res.json({ success: true, data: dancer });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * DELETE /api/dancers/:id
 * Delete a dancer profile (ownership enforced).
 */
router.delete('/:id', authorize(UserRole.CUSTOMER), async (req: Request, res: Response) => {
  try {
    const customerId = await resolveCustomerId(req);
    await dancerService.deleteDancer(req.params.id, customerId);

    res.json({ success: true, data: { message: 'Dancer deleted successfully' } });
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
    if (error.message === 'Customer profile not found' || error.message === 'Dancer not found') {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      });
      return;
    }

    if (error.message === 'Cannot delete dancer with active enrolments') {
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
