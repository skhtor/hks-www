import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { merchandiseService } from '../services/merchandise.service';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();

const createItemSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  price: z.number().positive('Price must be positive'),
  stockQuantity: z.number().int().min(0).optional(),
  sku: z.string().min(1, 'SKU is required'),
  isActive: z.boolean().optional(),
});

const updateItemSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  price: z.number().positive().optional(),
  stockQuantity: z.number().int().min(0).optional(),
  sku: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

const adjustStockSchema = z.object({
  quantity: z.number().int().positive('Quantity must be a positive integer'),
});

const purchaseSchema = z.object({
  customerId: z.string().uuid('customerId must be a valid UUID'),
  items: z
    .array(
      z.object({
        merchandiseItemId: z.string().uuid('merchandiseItemId must be a valid UUID'),
        quantity: z.number().int().positive('Quantity must be a positive integer'),
      })
    )
    .min(1, 'At least one item is required'),
});

/**
 * POST /api/merchandise
 * Create a merchandise item (admin only).
 * Requirements: 27.1
 */
router.post('/', authenticate, authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const data = createItemSchema.parse(req.body);
    const item = await merchandiseService.createItem(data);
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * POST /api/merchandise/purchase
 * Purchase merchandise items (standalone shop endpoint).
 * Accepts { customerId, items: [{merchandiseItemId, quantity}] }
 * Decrements stock, creates an invoice with line items, and triggers Xero sync.
 * Requirements: 27.1, 27.2, 27.3, 27.4
 */
router.post('/purchase', authenticate, async (req: Request, res: Response) => {
  try {
    const data = purchaseSchema.parse(req.body);
    const result = await merchandiseService.purchaseMerchandise(data.customerId, data.items);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/merchandise
 * List all merchandise items (public).
 * Requirements: 27.1
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const activeOnly = req.query.activeOnly === 'true';
    const items = await merchandiseService.getAllItems(activeOnly);
    res.json({ success: true, data: items });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/merchandise/:id
 * Get a merchandise item by ID (public).
 * Requirements: 27.1
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const item = await merchandiseService.getItemById(req.params.id);
    res.json({ success: true, data: item });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * PUT /api/merchandise/:id
 * Update a merchandise item (admin only).
 * Requirements: 27.1
 */
router.put('/:id', authenticate, authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const data = updateItemSchema.parse(req.body);
    const item = await merchandiseService.updateItem(req.params.id, data);
    res.json({ success: true, data: item });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * DELETE /api/merchandise/:id
 * Delete a merchandise item (admin only).
 * Requirements: 27.1
 */
router.delete('/:id', authenticate, authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    await merchandiseService.deleteItem(req.params.id);
    res.json({ success: true, data: { message: 'Merchandise item deleted successfully' } });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * POST /api/merchandise/:id/decrement-stock
 * Decrement stock for a merchandise item (admin only).
 * Requirements: 27.5
 */
router.post('/:id/decrement-stock', authenticate, authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const { quantity } = adjustStockSchema.parse(req.body);
    const item = await merchandiseService.decrementStock(req.params.id, quantity);
    res.json({ success: true, data: item });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * POST /api/merchandise/:id/increment-stock
 * Increment stock for a merchandise item (admin only).
 * Requirements: 27.5
 */
router.post('/:id/increment-stock', authenticate, authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const { quantity } = adjustStockSchema.parse(req.body);
    const item = await merchandiseService.incrementStock(req.params.id, quantity);
    res.json({ success: true, data: item });
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
    if (error.message === 'SKU already exists') {
      res.status(409).json({
        success: false,
        error: { code: 'CONFLICT', message: error.message },
      });
      return;
    }

    if (
      error.message === 'Merchandise item not found' ||
      error.message.startsWith('Merchandise item not found:')
    ) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      });
      return;
    }

    if (error.message === 'Customer not found') {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      });
      return;
    }

    if (error.message === 'Insufficient stock' || error.message.startsWith('Insufficient stock for item:')) {
      res.status(422).json({
        success: false,
        error: { code: 'INSUFFICIENT_STOCK', message: error.message },
      });
      return;
    }

    if (error.message.startsWith('Merchandise item is not available:')) {
      res.status(422).json({
        success: false,
        error: { code: 'ITEM_UNAVAILABLE', message: error.message },
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
