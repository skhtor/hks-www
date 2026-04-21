import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authService } from '../services/auth.service';
import { UserRole } from '@prisma/client';
import { authenticate } from '../middleware/auth.middleware';
import { config } from '../config/env';

const router = Router();

// Validation schemas
const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  // Role is not accepted from the client — all self-registrations are CUSTOMER
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const passwordResetRequestSchema = z.object({
  email: z.string().email('Invalid email address'),
});

const passwordResetSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(1, 'New password is required'),
});

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(1, 'New password is required'),
});

const mfaVerifySchema = z.object({
  totpCode: z.string().length(6, 'TOTP code must be 6 digits'),
});

const mfaLoginSchema = z.object({
  mfaToken: z.string().min(1, 'MFA token is required'),
  totpCode: z.string().length(6, 'TOTP code must be 6 digits'),
});

// Cookie options — HttpOnly prevents JS access; Secure enforces HTTPS in production
const ACCESS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.env === 'production',
  sameSite: 'strict' as const,
  maxAge: 60 * 60 * 1000, // 1 hour
  path: '/',
};

const REFRESH_COOKIE_OPTIONS = {
  ...ACCESS_COOKIE_OPTIONS,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/api/auth/refresh',
};

function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie('accessToken', accessToken, ACCESS_COOKIE_OPTIONS);
  res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);
}

function clearAuthCookies(res: Response): void {
  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
}

function zodError(res: Response, error: z.ZodError): void {
  res.status(400).json({
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid input data',
      details: error.errors.reduce((acc, err) => {
        acc[err.path.join('.')] = err.message;
        return acc;
      }, {} as Record<string, string>),
    },
  });
}

/**
 * POST /api/auth/register
 * Register a new user account (always CUSTOMER role)
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const validatedData = registerSchema.parse(req.body);
    const result = await authService.register({ ...validatedData, role: UserRole.CUSTOMER });

    setAuthCookies(res, result.accessToken, result.refreshToken);

    res.status(201).json({
      success: true,
      data: { user: result.user, expiresIn: result.expiresIn },
    });
  } catch (error) {
    if (error instanceof z.ZodError) { zodError(res, error); return; }
    if (error instanceof Error) {
      if (error.message === 'Email already registered') {
        res.status(409).json({ success: false, error: { code: 'EMAIL_EXISTS', message: error.message } })

        return;
      }
      if (error.message.includes('Password must')) {
        res.status(400).json({ success: false, error: { code: 'WEAK_PASSWORD', message: error.message } })

        return;
      }
    }
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An error occurred during registration' } });
  }
});

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const validatedData = loginSchema.parse(req.body);
    const result = await authService.login(validatedData);

    // MFA required — return mfaToken for second step, no cookies yet
    if ('mfaToken' in result) {
      res.status(200).json({ success: true, data: result })

      return;
    }

    setAuthCookies(res, result.accessToken, result.refreshToken);

    res.status(200).json({
      success: true,
      data: { user: result.user, expiresIn: result.expiresIn },
    });
  } catch (error) {
    if (error instanceof z.ZodError) { zodError(res, error); return; }
    if (error instanceof Error && error.message === 'Invalid credentials') {
      res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: error.message } })

      return;
    }
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An error occurred during login' } });
  }
});

/**
 * POST /api/auth/logout
 * Clear auth cookies
 */
router.post('/logout', (_req: Request, res: Response) => {
  clearAuthCookies(res);
  res.status(200).json({ success: true, data: { message: 'Logged out successfully' } });
});

/**
 * GET /api/auth/me
 * Return the currently authenticated user (used by frontend to restore session)
 */
router.get('/me', authenticate, (req: Request, res: Response) => {
  res.status(200).json({ success: true, data: { user: req.user } });
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refreshToken cookie
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    // Accept cookie (preferred) or body (API clients / tests)
    const refreshToken: string | undefined = req.cookies?.refreshToken ?? req.body?.refreshToken;

    if (!refreshToken) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Refresh token required' } })

      return;
    }

    const result = await authService.refreshToken(refreshToken);

    setAuthCookies(res, result.accessToken, result.refreshToken);

    res.status(200).json({
      success: true,
      data: { user: result.user, expiresIn: result.expiresIn },
    });
  } catch (error) {
    clearAuthCookies(res);
    if (error instanceof Error && error.message.includes('Invalid or expired')) {
      res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: error.message } })

      return;
    }
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An error occurred during token refresh' } });
  }
});

/**
 * POST /api/auth/reset-password-request
 * Request a password reset token
 */
router.post('/reset-password-request', async (req: Request, res: Response) => {
  try {
    const validatedData = passwordResetRequestSchema.parse(req.body);
    const result = await authService.requestPasswordReset(validatedData.email);

    res.status(200).json({
      success: true,
      data: {
        message: 'If the email exists, a reset link will be sent',
        // Expose token only outside production to aid local testing
        ...(config.env !== 'production' && { token: result.token, expiresAt: result.expiresAt }),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) { zodError(res, error); return; }
    // Always return success to prevent email enumeration
    res.status(200).json({ success: true, data: { message: 'If the email exists, a reset link will be sent' } });
  }
});

/**
 * POST /api/auth/reset-password
 * Reset password using reset token
 */
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const validatedData = passwordResetSchema.parse(req.body);
    await authService.resetPassword(validatedData.token, validatedData.newPassword);
    res.status(200).json({ success: true, data: { message: 'Password has been reset successfully' } });
  } catch (error) {
    if (error instanceof z.ZodError) { zodError(res, error); return; }
    if (error instanceof Error) {
      if (error.message.includes('Password must')) {
        res.status(400).json({ success: false, error: { code: 'WEAK_PASSWORD', message: error.message } })

        return;
      }
      if (error.message.includes('Invalid or expired')) {
        res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: error.message } })

        return;
      }
    }
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An error occurred during password reset' } });
  }
});

/**
 * POST /api/auth/change-password
 * Change password for authenticated user
 */
router.post('/change-password', authenticate, async (req: Request, res: Response) => {
  try {
    const validatedData = changePasswordSchema.parse(req.body);
    await authService.changePassword(req.user!.userId, validatedData.oldPassword, validatedData.newPassword);
    res.status(200).json({ success: true, data: { message: 'Password has been changed successfully' } });
  } catch (error) {
    if (error instanceof z.ZodError) { zodError(res, error); return; }
    if (error instanceof Error) {
      if (error.message.includes('Password must')) {
        res.status(400).json({ success: false, error: { code: 'WEAK_PASSWORD', message: error.message } })

        return;
      }
      if (error.message === 'Current password is incorrect') {
        res.status(401).json({ success: false, error: { code: 'INVALID_PASSWORD', message: error.message } })

        return;
      }
      if (error.message === 'User not found') {
        res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: error.message } })

        return;
      }
    }
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An error occurred during password change' } });
  }
});

/**
 * POST /api/auth/mfa/setup
 * Initiate MFA setup — generates TOTP secret and otpauth URL
 */
router.post('/mfa/setup', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await authService.initiateMfaSetup(req.user!.userId);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Error && error.message === 'User not found') {
      res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: error.message } })

      return;
    }
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An error occurred during MFA setup' } });
  }
});

/**
 * POST /api/auth/mfa/verify
 * Verify TOTP code and enable MFA
 */
router.post('/mfa/verify', authenticate, async (req: Request, res: Response) => {
  try {
    const { totpCode } = mfaVerifySchema.parse(req.body);
    const result = await authService.verifyAndEnableMfa(req.user!.userId, totpCode);
    res.status(200).json({ success: true, data: { message: 'MFA has been enabled successfully', ...result } });
  } catch (error) {
    if (error instanceof z.ZodError) { zodError(res, error); return; }
    if (error instanceof Error) {
      if (error.message === 'Invalid TOTP code') {
        res.status(400).json({ success: false, error: { code: 'INVALID_TOTP', message: error.message } })

        return;
      }
      if (error.message.includes('not initiated')) {
        res.status(400).json({ success: false, error: { code: 'MFA_NOT_INITIATED', message: error.message } })

        return;
      }
    }
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An error occurred during MFA verification' } });
  }
});

/**
 * POST /api/auth/mfa/disable
 * Disable MFA after verifying TOTP code
 */
router.post('/mfa/disable', authenticate, async (req: Request, res: Response) => {
  try {
    const { totpCode } = mfaVerifySchema.parse(req.body);
    const result = await authService.disableMfa(req.user!.userId, totpCode);
    res.status(200).json({ success: true, data: { message: 'MFA has been disabled successfully', ...result } });
  } catch (error) {
    if (error instanceof z.ZodError) { zodError(res, error); return; }
    if (error instanceof Error) {
      if (error.message === 'Invalid TOTP code') {
        res.status(400).json({ success: false, error: { code: 'INVALID_TOTP', message: error.message } })

        return;
      }
      if (error.message.includes('not enabled')) {
        res.status(400).json({ success: false, error: { code: 'MFA_NOT_ENABLED', message: error.message } })

        return;
      }
    }
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An error occurred while disabling MFA' } });
  }
});

/**
 * POST /api/auth/mfa/login
 * Complete MFA login using pending MFA token and TOTP code
 */
router.post('/mfa/login', async (req: Request, res: Response) => {
  try {
    const { mfaToken, totpCode } = mfaLoginSchema.parse(req.body);
    const result = await authService.completeMfaLogin(mfaToken, totpCode);

    setAuthCookies(res, result.accessToken, result.refreshToken);

    res.status(200).json({
      success: true,
      data: { user: result.user, expiresIn: result.expiresIn },
    });
  } catch (error) {
    if (error instanceof z.ZodError) { zodError(res, error); return; }
    if (error instanceof Error) {
      if (error.message === 'Invalid MFA code') {
        res.status(401).json({ success: false, error: { code: 'INVALID_MFA_CODE', message: error.message } })

        return;
      }
      if (error.message.includes('Invalid or expired')) {
        res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: error.message } })

        return;
      }
    }
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An error occurred during MFA login' } });
  }
});

export default router;
