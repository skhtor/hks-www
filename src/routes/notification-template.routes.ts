import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { NotificationType } from '@prisma/client';
import { UserRole } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  notificationTemplateService,
  TemplateNotFoundError,
  TemplateValidationError,
} from '../services/notification-template.service';

const router = Router();

const templateBodySchema = z.object({
  type: z.nativeEnum(NotificationType),
  name: z.string().min(1, 'Name is required'),
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Body is required'),
  variables: z.array(z.string()).default([]),
  active: z.boolean().default(true),
});

const updateTemplateSchema = templateBodySchema.partial();

const previewSchema = z.object({
  variables: z.record(z.string(), z.string()).default({}),
});

/**
 * POST /api/notification-templates
 * Create a new notification template (admin only).
 * Requirements: 23.1, 23.2, 23.3
 */
router.post(
  '/',
  authenticate,
  authorize(UserRole.ADMIN),
  (req: Request, res: Response) => {
    try {
      const data = templateBodySchema.parse(req.body);
      const template = notificationTemplateService.createTemplate(data);
      res.status(201).json({ success: true, data: template });
    } catch (error) {
      handleError(error, res);
    }
  }
);

/**
 * GET /api/notification-templates
 * List all templates, optional ?type= filter (admin only).
 * Requirements: 23.1
 */
router.get(
  '/',
  authenticate,
  authorize(UserRole.ADMIN),
  (req: Request, res: Response) => {
    try {
      const type = req.query.type as NotificationType | undefined;
      if (type && !Object.values(NotificationType).includes(type)) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: `Invalid type: ${type}` },
        });
        return;
      }
      const templates = notificationTemplateService.listTemplates(type);
      res.json({ success: true, data: templates });
    } catch (error) {
      handleError(error, res);
    }
  }
);

/**
 * GET /api/notification-templates/:id
 * Get a template by ID (admin only).
 * Requirements: 23.1
 */
router.get(
  '/:id',
  authenticate,
  authorize(UserRole.ADMIN),
  (req: Request, res: Response) => {
    try {
      const template = notificationTemplateService.getTemplate(req.params.id);
      res.json({ success: true, data: template });
    } catch (error) {
      handleError(error, res);
    }
  }
);

/**
 * PUT /api/notification-templates/:id
 * Update a template (admin only).
 * Requirements: 23.1, 23.2, 23.3
 */
router.put(
  '/:id',
  authenticate,
  authorize(UserRole.ADMIN),
  (req: Request, res: Response) => {
    try {
      const data = updateTemplateSchema.parse(req.body);
      const template = notificationTemplateService.updateTemplate(req.params.id, data);
      res.json({ success: true, data: template });
    } catch (error) {
      handleError(error, res);
    }
  }
);

/**
 * DELETE /api/notification-templates/:id
 * Delete a template (admin only).
 * Requirements: 23.1
 */
router.delete(
  '/:id',
  authenticate,
  authorize(UserRole.ADMIN),
  (req: Request, res: Response) => {
    try {
      notificationTemplateService.deleteTemplate(req.params.id);
      res.json({ success: true, data: { message: 'Template deleted' } });
    } catch (error) {
      handleError(error, res);
    }
  }
);

/**
 * POST /api/notification-templates/:id/preview
 * Render a template with sample variables (admin only).
 * Requirements: 23.4
 */
router.post(
  '/:id/preview',
  authenticate,
  authorize(UserRole.ADMIN),
  (req: Request, res: Response) => {
    try {
      const { variables } = previewSchema.parse(req.body);
      const rendered = notificationTemplateService.renderTemplate(req.params.id, variables);
      res.json({ success: true, data: rendered });
    } catch (error) {
      handleError(error, res);
    }
  }
);

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

  if (error instanceof TemplateNotFoundError) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: error.message },
    });
    return;
  }

  if (error instanceof TemplateValidationError) {
    res.status(400).json({
      success: false,
      error: { code: 'TEMPLATE_VALIDATION_ERROR', message: error.message },
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
}

export default router;
