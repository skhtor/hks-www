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

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
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

/**
 * POST /api/auth/register
 * Register a new user account
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const validatedData = registerSchema.parse(req.body);

    // Role is always CUSTOMER for self-registration; admins/teachers are created by admins
    const result = await authService.register({ ...validatedData, role: UserRole.CUSTOMER });

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
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

    if (error instanceof Error) {
      // Check for specific error types
      if (error.message === 'Email already registered') {
        return res.status(409).json({
          success: false,
          error: {
            code: 'EMAIL_EXISTS',
            message: error.message,
          },
        });
      }

      if (error.message.includes('Password must')) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'WEAK_PASSWORD',
            message: error.message,
          },
        });
      }
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An error occurred during registration',
      },
    });
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

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
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

    if (error instanceof Error && error.message === 'Invalid credentials') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: error.message,
        },
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An error occurred during login',
      },
    });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const validatedData = refreshTokenSchema.parse(req.body);

    const result = await authService.refreshToken(validatedData.refreshToken);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
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

    if (error instanceof Error && error.message.includes('Invalid or expired')) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: error.message,
        },
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An error occurred during token refresh',
      },
    });
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

    // In production, send email with reset link
    res.status(200).json({
      success: true,
      data: {
        message: 'If the email exists, a reset link will be sent',
        // Expose token only in development to aid local testing
        ...(config.env !== 'production' && { token: result.token, expiresAt: result.expiresAt }),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
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

    // Always return success to prevent email enumeration
    res.status(200).json({
      success: true,
      data: {
        message: 'If the email exists, a reset link will be sent',
      },
    });
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

    res.status(200).json({
      success: true,
      data: {
        message: 'Password has been reset successfully',
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
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

    if (error instanceof Error) {
      if (error.message.includes('Password must')) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'WEAK_PASSWORD',
            message: error.message,
          },
        });
      }

      if (error.message.includes('Invalid or expired')) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: error.message,
          },
        });
      }
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An error occurred during password reset',
      },
    });
  }
});

/**
 * POST /api/auth/change-password
 * Change password for authenticated user
 */
router.post('/change-password', authenticate, async (req: Request, res: Response) => {
  try {
    const validatedData = changePasswordSchema.parse(req.body);
    const userId = req.user!.userId;

    await authService.changePassword(userId, validatedData.oldPassword, validatedData.newPassword);

    res.status(200).json({
      success: true,
      data: {
        message: 'Password has been changed successfully',
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
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

    if (error instanceof Error) {
      if (error.message.includes('Password must')) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'WEAK_PASSWORD',
            message: error.message,
          },
        });
      }

      if (error.message === 'Current password is incorrect') {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_PASSWORD',
            message: error.message,
          },
        });
      }

      if (error.message === 'User not found') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: error.message,
          },
        });
      }
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An error occurred during password change',
      },
    });
  }
});

/**
 * POST /api/auth/mfa/setup
 * Initiate MFA setup - generates TOTP secret and otpauth URL
 * Requires authentication. Requirements: 1.8, 18.7
 */
router.post('/mfa/setup', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const result = await authService.initiateMfaSetup(userId);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'User not found') {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: error.message },
      });
    }
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An error occurred during MFA setup' },
    });
  }
});

/**
 * POST /api/auth/mfa/verify
 * Verify TOTP code and enable MFA
 * Requires authentication. Requirements: 1.8, 18.7
 */
router.post('/mfa/verify', authenticate, async (req: Request, res: Response) => {
  try {
    const validatedData = mfaVerifySchema.parse(req.body);
    const userId = req.user!.userId;

    const result = await authService.verifyAndEnableMfa(userId, validatedData.totpCode);

    res.status(200).json({
      success: true,
      data: { message: 'MFA has been enabled successfully', ...result },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
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
    if (error instanceof Error) {
      if (error.message === 'Invalid TOTP code') {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_TOTP', message: error.message },
        });
      }
      if (error.message.includes('not initiated')) {
        return res.status(400).json({
          success: false,
          error: { code: 'MFA_NOT_INITIATED', message: error.message },
        });
      }
    }
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An error occurred during MFA verification' },
    });
  }
});

/**
 * POST /api/auth/mfa/disable
 * Disable MFA after verifying TOTP code
 * Requires authentication. Requirements: 1.8, 18.7
 */
router.post('/mfa/disable', authenticate, async (req: Request, res: Response) => {
  try {
    const validatedData = mfaVerifySchema.parse(req.body);
    const userId = req.user!.userId;

    const result = await authService.disableMfa(userId, validatedData.totpCode);

    res.status(200).json({
      success: true,
      data: { message: 'MFA has been disabled successfully', ...result },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
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
    if (error instanceof Error) {
      if (error.message === 'Invalid TOTP code') {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_TOTP', message: error.message },
        });
      }
      if (error.message.includes('not enabled')) {
        return res.status(400).json({
          success: false,
          error: { code: 'MFA_NOT_ENABLED', message: error.message },
        });
      }
    }
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An error occurred while disabling MFA' },
    });
  }
});

/**
 * POST /api/auth/mfa/login
 * Complete MFA login using pending MFA token and TOTP code
 * Requirements: 1.8, 18.7
 */
router.post('/mfa/login', async (req: Request, res: Response) => {
  try {
    const validatedData = mfaLoginSchema.parse(req.body);

    const result = await authService.completeMfaLogin(
      validatedData.mfaToken,
      validatedData.totpCode
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
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
    if (error instanceof Error) {
      if (error.message === 'Invalid MFA code') {
        return res.status(401).json({
          success: false,
          error: { code: 'INVALID_MFA_CODE', message: error.message },
        });
      }
      if (error.message.includes('Invalid or expired')) {
        return res.status(401).json({
          success: false,
          error: { code: 'INVALID_TOKEN', message: error.message },
        });
      }
    }
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An error occurred during MFA login' },
    });
  }
});

export default router;
