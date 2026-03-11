import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { customerService } from '../services/customer.service';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();

// All customer routes require authentication
router.use(authenticate);

// Validation schemas
const createCustomerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  mobile: z.string().min(1, 'Mobile is required'),
  address: z
    .object({
      street: z.string().optional(),
      suburb: z.string().optional(),
      state: z.string().optional(),
      postcode: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
});

const updateCustomerSchema = z.object({
  name: z.string().min(1).optional(),
  mobile: z.string().min(1).optional(),
  address: z
    .object({
      street: z.string().optional(),
      suburb: z.string().optional(),
      state: z.string().optional(),
      postcode: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
});

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
 * POST /api/customers/me
 * Create customer profile for authenticated user
 */
router.post('/me', authorize(UserRole.CUSTOMER), async (req: Request, res: Response) => {
  try {
    const validatedData = createCustomerSchema.parse(req.body);
    const customer = await customerService.createCustomer({
      userId: req.user!.userId,
      ...validatedData,
    });

    res.status(201).json({ success: true, data: customer });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/customers/me
 * Get current customer profile
 */
router.get('/me', authorize(UserRole.CUSTOMER, UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const customer = await customerService.getCustomerByUserId(req.user!.userId);
    res.json({ success: true, data: customer });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * PUT /api/customers/me
 * Update current customer profile
 */
router.put('/me', authorize(UserRole.CUSTOMER), async (req: Request, res: Response) => {
  try {
    const validatedData = updateCustomerSchema.parse(req.body);
    const customer = await customerService.getCustomerByUserId(req.user!.userId);
    const updated = await customerService.updateCustomer(customer.id, validatedData);

    res.json({ success: true, data: updated });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/customers/me/dancers
 * List dancers in household
 */
router.get('/me/dancers', authorize(UserRole.CUSTOMER), async (req: Request, res: Response) => {
  try {
    const customer = await customerService.getCustomerByUserId(req.user!.userId);
    const dancers = await customerService.getDancers(customer.id);

    res.json({ success: true, data: dancers });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * POST /api/customers/me/dancers
 * Add dancer to household
 */
router.post('/me/dancers', authorize(UserRole.CUSTOMER), async (req: Request, res: Response) => {
  try {
    const validatedData = createDancerSchema.parse(req.body);
    const customer = await customerService.getCustomerByUserId(req.user!.userId);
    const dancer = await customerService.addDancer(customer.id, {
      ...validatedData,
      dateOfBirth: new Date(validatedData.dateOfBirth),
    });

    res.status(201).json({ success: true, data: dancer });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * PUT /api/customers/me/dancers/:id
 * Update dancer profile
 */
router.put('/me/dancers/:id', authorize(UserRole.CUSTOMER), async (req: Request, res: Response) => {
  try {
    const validatedData = updateDancerSchema.parse(req.body);
    const customer = await customerService.getCustomerByUserId(req.user!.userId);
    const dancer = await customerService.updateDancer(customer.id, req.params.id, {
      ...validatedData,
      dateOfBirth: validatedData.dateOfBirth ? new Date(validatedData.dateOfBirth) : undefined,
    });

    res.json({ success: true, data: dancer });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * DELETE /api/customers/me/dancers/:id
 * Remove dancer from household
 */
router.delete('/me/dancers/:id', authorize(UserRole.CUSTOMER), async (req: Request, res: Response) => {
  try {
    const customer = await customerService.getCustomerByUserId(req.user!.userId);
    await customerService.removeDancer(customer.id, req.params.id);

    res.json({ success: true, data: { message: 'Dancer removed successfully' } });
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

    if (
      error.message === 'Customer profile already exists for this user' ||
      error.message === 'Cannot remove dancer with active enrolments'
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
