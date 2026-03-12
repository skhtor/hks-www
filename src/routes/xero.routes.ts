import { Router, Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { xeroService } from '../services/xero.service';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

/**
 * GET /api/xero/auth
 * Redirect to Xero OAuth 2.0 authorization page.
 * Requirements: 10.5
 */
router.get('/auth', async (_req: Request, res: Response) => {
  try {
    const authUrl = await xeroService.getAuthorizationUrl();
    res.redirect(authUrl);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'XERO_AUTH_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate Xero authorization URL',
      },
    });
  }
});

/**
 * GET /api/xero/callback
 * Handle OAuth callback from Xero, exchange code for tokens.
 * Requirements: 10.5, 18.4
 */
router.get('/callback', async (req: Request, res: Response) => {
  try {
    const { code, error, error_description } = req.query;

    if (error) {
      res.status(400).json({
        success: false,
        error: {
          code: 'XERO_OAUTH_ERROR',
          message: (error_description as string) ?? (error as string),
        },
      });
      return;
    }

    if (!code || typeof code !== 'string') {
      res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_CODE',
          message: 'Authorization code is required',
        },
      });
      return;
    }

    await xeroService.exchangeCodeForTokens(code);

    res.json({
      success: true,
      data: {
        message: 'Xero connected successfully',
        status: xeroService.getStatus(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'XERO_TOKEN_EXCHANGE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to exchange authorization code',
      },
    });
  }
});

/**
 * GET /api/xero/status
 * Return Xero connection status (admin only).
 * Requirements: 10.5, 22.4
 */
router.get(
  '/status',
  authenticate,
  authorize(UserRole.ADMIN),
  (_req: Request, res: Response) => {
    try {
      const status = xeroService.getStatus();
      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'XERO_STATUS_ERROR',
          message: error instanceof Error ? error.message : 'Failed to retrieve Xero status',
        },
      });
    }
  }
);

/**
 * POST /api/xero/sync/contact/:customerId
 * Sync a customer to Xero as a contact (admin only).
 * Requirements: 10.1, 10.2, 10.4, 10.6
 */
router.post(
  '/sync/contact/:customerId',
  authenticate,
  authorize(UserRole.ADMIN),
  async (req: Request, res: Response) => {
    try {
      const { customerId } = req.params;
      const result = await xeroService.syncContact(customerId);

      if (!result.success) {
        const isNotFound = result.error === 'Customer not found';
        res.status(isNotFound ? 404 : 502).json({
          success: false,
          error: {
            code: isNotFound ? 'NOT_FOUND' : 'XERO_SYNC_ERROR',
            message: result.error ?? 'Contact sync failed',
          },
        });
        return;
      }

      res.json({
        success: true,
        data: {
          xeroContactId: result.xeroContactId,
          message: 'Contact synced successfully',
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
        },
      });
    }
  }
);

/**
 * POST /api/xero/sync/invoice/:invoiceId
 * Sync an invoice to Xero (admin only).
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
 */
router.post(
  '/sync/invoice/:invoiceId',
  authenticate,
  authorize(UserRole.ADMIN),
  async (req: Request, res: Response) => {
    try {
      const { invoiceId } = req.params;
      const result = await xeroService.syncInvoice(invoiceId);

      if (!result.success) {
        const isNotFound = result.error === 'Invoice not found';
        res.status(isNotFound ? 404 : 502).json({
          success: false,
          error: {
            code: isNotFound ? 'NOT_FOUND' : 'XERO_SYNC_ERROR',
            message: result.error ?? 'Invoice sync failed',
          },
        });
        return;
      }

      res.json({
        success: true,
        data: {
          xeroInvoiceId: result.xeroInvoiceId,
          message: 'Invoice synced successfully',
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
        },
      });
    }
  }
);

export default router;
