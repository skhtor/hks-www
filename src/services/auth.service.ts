import bcrypt from 'bcrypt';
import jwt, { SignOptions } from 'jsonwebtoken';
import { PrismaClient, UserRole } from '@prisma/client';
import speakeasy from 'speakeasy';
import { config } from '../config/env';

const prisma = new PrismaClient();

export interface RegisterInput {
  email: string;
  password: string;
  role?: UserRole;
}

export interface LoginInput {
  email: string;
  password: string;
  totpCode?: string;
}

export interface AuthToken {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  mfaRequired?: boolean;
  mfaToken?: string;
  user: {
    id: string;
    email: string;
    role: UserRole;
  };
}

export interface MfaSetupResult {
  secret: string;
  otpauthUrl: string;
}

export interface MfaVerifyResult {
  success: boolean;
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export interface PasswordResetToken {
  token: string;
  expiresAt: Date;
}

export class AuthService {
  /**
   * Validates password strength
   * Requirements: minimum 8 characters, at least one uppercase, one lowercase, one number
   */
  private validatePasswordStrength(password: string): void {
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    if (!/[A-Z]/.test(password)) {
      throw new Error('Password must contain at least one uppercase letter');
    }

    if (!/[a-z]/.test(password)) {
      throw new Error('Password must contain at least one lowercase letter');
    }

    if (!/[0-9]/.test(password)) {
      throw new Error('Password must contain at least one number');
    }
  }

  /**
   * Hashes a password using bcrypt
   */
  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, config.bcrypt.rounds);
  }

  /**
   * Verifies a password against a hash
   */
  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generates JWT access and refresh tokens
   */
  private generateTokens(payload: JWTPayload): { accessToken: string; refreshToken: string } {
    const accessToken = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    } as SignOptions);

    const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpiresIn,
    } as SignOptions);

    return { accessToken, refreshToken };
  }

  /**
   * Registers a new user account
   * Validates email uniqueness and password strength
   * Hashes password before storage
   */
  async register(input: RegisterInput): Promise<AuthToken> {
    const { email, password, role = UserRole.CUSTOMER } = input;

    // Validate password strength
    this.validatePasswordStrength(password);

    // Check if email already exists
    const existingUser = await prisma.userAccount.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new Error('Email already registered');
    }

    // Hash password
    const passwordHash = await this.hashPassword(password);

    // Create user account
    const user = await prisma.userAccount.create({
      data: {
        email,
        passwordHash,
        role,
      },
    });

    // Generate tokens
    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const { accessToken, refreshToken } = this.generateTokens(payload);

    // Calculate expiry time in seconds
    const expiresIn = this.parseExpiryToSeconds(config.jwt.expiresIn);

    return {
      accessToken,
      refreshToken,
      expiresIn,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  /**
   * Authenticates a user with email and password
   * For staff accounts (TEACHER/ADMIN) with MFA enabled, requires TOTP code
   * Requirements: 1.8, 18.7
   */
  async login(input: LoginInput): Promise<AuthToken> {
    const { email, password, totpCode } = input;

    // Find user by email
    const user = await prisma.userAccount.findUnique({
      where: { email },
    });

    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Verify password
    const isValidPassword = await this.verifyPassword(password, user.passwordHash);

    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    // Check MFA requirement for staff accounts (TEACHER/ADMIN)
    const isStaff = user.role === UserRole.TEACHER || user.role === UserRole.ADMIN;
    if (isStaff && user.mfaEnabled) {
      if (!totpCode) {
        // Return a partial response indicating MFA is required
        // Use a short-lived MFA token to identify the pending session
        const mfaToken = jwt.sign(
          { userId: user.id, type: 'mfa_pending' },
          config.jwt.secret,
          { expiresIn: '5m' } as SignOptions
        );
        return {
          accessToken: '',
          refreshToken: '',
          expiresIn: 0,
          mfaRequired: true,
          mfaToken,
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
          },
        };
      }

      // Verify TOTP code
      if (!user.mfaSecret) {
        throw new Error('MFA configuration error');
      }
      const isValidTotp = speakeasy.totp.verify({
        secret: user.mfaSecret,
        encoding: 'base32',
        token: totpCode,
        window: 1,
      });
      if (!isValidTotp) {
        throw new Error('Invalid MFA code');
      }
    }

    // Generate tokens
    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const { accessToken, refreshToken } = this.generateTokens(payload);

    const expiresIn = this.parseExpiryToSeconds(config.jwt.expiresIn);

    return {
      accessToken,
      refreshToken,
      expiresIn,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  /**
   * Completes MFA login using a pending MFA token and TOTP code
   * Requirements: 1.8, 18.7
   */
  async completeMfaLogin(mfaToken: string, totpCode: string): Promise<AuthToken> {
    let decoded: any;
    try {
      decoded = jwt.verify(mfaToken, config.jwt.secret) as any;
    } catch {
      throw new Error('Invalid or expired MFA token');
    }

    if (decoded.type !== 'mfa_pending') {
      throw new Error('Invalid MFA token');
    }

    const user = await prisma.userAccount.findUnique({
      where: { id: decoded.userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new Error('MFA not enabled for this account');
    }

    const isValidTotp = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token: totpCode,
      window: 1,
    });
    if (!isValidTotp) {
      throw new Error('Invalid MFA code');
    }

    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const { accessToken, refreshToken } = this.generateTokens(payload);
    const expiresIn = this.parseExpiryToSeconds(config.jwt.expiresIn);

    return {
      accessToken,
      refreshToken,
      expiresIn,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  /**
   * Validates and decodes an access token
   */
  async validateToken(token: string): Promise<JWTPayload> {
    try {
      const decoded = jwt.verify(token, config.jwt.secret) as JWTPayload;
      return decoded;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Refreshes an access token using a refresh token
   */
  async refreshToken(refreshToken: string): Promise<AuthToken> {
    try {
      const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret) as JWTPayload;

      // Verify user still exists
      const user = await prisma.userAccount.findUnique({
        where: { id: decoded.userId },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Generate new tokens
      const payload: JWTPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
      };

      const tokens = this.generateTokens(payload);
      const expiresIn = this.parseExpiryToSeconds(config.jwt.expiresIn);

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      };
    } catch (error) {
      throw new Error('Invalid or expired refresh token');
    }
  }

  /**
   * Parses JWT expiry string to seconds
   */
  private parseExpiryToSeconds(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) return 3600; // default 1 hour

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86400;
      default:
        return 3600;
    }
  }

  /**
   * Generates a secure password reset token
   */
  async requestPasswordReset(email: string): Promise<PasswordResetToken> {
    // Find user by email
    const user = await prisma.userAccount.findUnique({
      where: { email },
    });

    if (!user) {
      // Don't reveal if email exists or not for security
      throw new Error('If the email exists, a reset link will be sent');
    }

    // Generate reset token (valid for 1 hour)
    const resetPayload = {
      userId: user.id,
      email: user.email,
      type: 'password_reset',
    };

    const token = jwt.sign(resetPayload, config.jwt.secret, {
      expiresIn: '1h',
    } as SignOptions);

    const expiresAt = new Date(Date.now() + 3600000); // 1 hour from now

    return {
      token,
      expiresAt,
    };
  }

  /**
   * Changes user password using reset token
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    try {
      // Verify token
      const decoded = jwt.verify(token, config.jwt.secret) as any;

      if (decoded.type !== 'password_reset') {
        throw new Error('Invalid reset token');
      }

      // Validate new password strength
      this.validatePasswordStrength(newPassword);

      // Hash new password
      const passwordHash = await this.hashPassword(newPassword);

      // Update user password
      await prisma.userAccount.update({
        where: { id: decoded.userId },
        data: { passwordHash },
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Password must')) {
        throw error;
      }
      throw new Error('Invalid or expired reset token');
    }
  }

  /**
   * Changes password for authenticated user
   */
  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    // Get user
    const user = await prisma.userAccount.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Verify old password
    const isValidPassword = await this.verifyPassword(oldPassword, user.passwordHash);

    if (!isValidPassword) {
      throw new Error('Current password is incorrect');
    }

    // Validate new password strength
    this.validatePasswordStrength(newPassword);

    // Hash new password
    const passwordHash = await this.hashPassword(newPassword);

    // Update password
    await prisma.userAccount.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  /**
   * Initiates MFA setup by generating a TOTP secret
   * Returns the secret and otpauth URL for QR code generation
   * Requirements: 1.8, 18.7
   */
  async initiateMfaSetup(userId: string): Promise<MfaSetupResult> {
    const user = await prisma.userAccount.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const secretObj = speakeasy.generateSecret({
      name: `DanceSchool:${user.email}`,
      issuer: 'DanceSchool',
    });
    const secret = secretObj.base32;
    const otpauthUrl = secretObj.otpauth_url ?? speakeasy.otpauthURL({
      secret,
      label: user.email,
      issuer: 'DanceSchool',
      encoding: 'base32',
    });

    // Store the secret temporarily (not yet enabled until verified)
    await prisma.userAccount.update({
      where: { id: userId },
      data: { mfaSecret: secret },
    });

    return { secret, otpauthUrl };
  }

  /**
   * Verifies a TOTP code and enables MFA for the user
   * Requirements: 1.8, 18.7
   */
  async verifyAndEnableMfa(userId: string, totpCode: string): Promise<MfaVerifyResult> {
    const user = await prisma.userAccount.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.mfaSecret) {
      throw new Error('MFA setup not initiated. Call initiateMfaSetup first.');
    }

    const isValid = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token: totpCode,
      window: 1,
    });

    if (!isValid) {
      throw new Error('Invalid TOTP code');
    }

    await prisma.userAccount.update({
      where: { id: userId },
      data: { mfaEnabled: true },
    });

    return { success: true };
  }

  /**
   * Disables MFA for a user after verifying their TOTP code
   * Requirements: 1.8, 18.7
   */
  async disableMfa(userId: string, totpCode: string): Promise<MfaVerifyResult> {
    const user = await prisma.userAccount.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new Error('MFA is not enabled for this account');
    }

    const isValid = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token: totpCode,
      window: 1,
    });

    if (!isValid) {
      throw new Error('Invalid TOTP code');
    }

    await prisma.userAccount.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecret: null },
    });

    return { success: true };
  }
}

export const authService = new AuthService();
