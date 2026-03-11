import { AuthService } from '../../services/auth.service';
import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const authService = new AuthService();

describe('AuthService', () => {
  beforeAll(async () => {
    // Clean up test data
    await prisma.userAccount.deleteMany({
      where: {
        email: {
          contains: '@test.example.com',
        },
      },
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.userAccount.deleteMany({
      where: {
        email: {
          contains: '@test.example.com',
        },
      },
    });
    await prisma.$disconnect();
  });

  describe('register', () => {
    it('should create account with valid credentials', async () => {
      const email = `user${Date.now()}@test.example.com`;
      const password = 'SecurePass123!';

      const result = await authService.register({ email, password });

      expect(result.user.email).toBe(email);
      expect(result.user.id).toBeDefined();
      expect(result.user.role).toBe(UserRole.CUSTOMER);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.expiresIn).toBeGreaterThan(0);

      // Verify password is hashed in database
      const user = await prisma.userAccount.findUnique({
        where: { email },
      });
      expect(user).toBeDefined();
      expect(user!.passwordHash).not.toBe(password);
      expect(await bcrypt.compare(password, user!.passwordHash)).toBe(true);
    });

    it('should reject weak passwords - too short', async () => {
      const email = `user${Date.now()}@test.example.com`;
      const password = 'Short1';

      await expect(authService.register({ email, password })).rejects.toThrow(
        'Password must be at least 8 characters long'
      );
    });

    it('should reject weak passwords - no uppercase', async () => {
      const email = `user${Date.now()}@test.example.com`;
      const password = 'lowercase123';

      await expect(authService.register({ email, password })).rejects.toThrow(
        'Password must contain at least one uppercase letter'
      );
    });

    it('should reject weak passwords - no lowercase', async () => {
      const email = `user${Date.now()}@test.example.com`;
      const password = 'UPPERCASE123';

      await expect(authService.register({ email, password })).rejects.toThrow(
        'Password must contain at least one lowercase letter'
      );
    });

    it('should reject weak passwords - no number', async () => {
      const email = `user${Date.now()}@test.example.com`;
      const password = 'NoNumbersHere';

      await expect(authService.register({ email, password })).rejects.toThrow(
        'Password must contain at least one number'
      );
    });

    it('should reject duplicate email addresses', async () => {
      const email = `duplicate${Date.now()}@test.example.com`;
      const password = 'SecurePass123!';

      await authService.register({ email, password });

      await expect(authService.register({ email, password: 'AnotherPass456!' })).rejects.toThrow(
        'Email already registered'
      );
    });

    it('should create account with specified role', async () => {
      const email = `admin${Date.now()}@test.example.com`;
      const password = 'SecurePass123!';

      const result = await authService.register({ email, password, role: UserRole.ADMIN });

      expect(result.user.role).toBe(UserRole.ADMIN);
    });
  });

  describe('login', () => {
    const testEmail = `login${Date.now()}@test.example.com`;
    const testPassword = 'SecurePass123!';

    beforeAll(async () => {
      await authService.register({ email: testEmail, password: testPassword });
    });

    it('should authenticate with valid credentials', async () => {
      const result = await authService.login({ email: testEmail, password: testPassword });

      expect(result.user.email).toBe(testEmail);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.expiresIn).toBeGreaterThan(0);
    });

    it('should reject invalid email', async () => {
      await expect(
        authService.login({ email: 'nonexistent@test.example.com', password: testPassword })
      ).rejects.toThrow('Invalid credentials');
    });

    it('should reject invalid password', async () => {
      await expect(
        authService.login({ email: testEmail, password: 'WrongPassword123!' })
      ).rejects.toThrow('Invalid credentials');
    });
  });

  describe('validateToken', () => {
    const testEmail = `validate${Date.now()}@test.example.com`;
    const testPassword = 'SecurePass123!';
    let accessToken: string;

    beforeAll(async () => {
      const result = await authService.register({ email: testEmail, password: testPassword });
      accessToken = result.accessToken;
    });

    it('should validate valid token', async () => {
      const payload = await authService.validateToken(accessToken);

      expect(payload.email).toBe(testEmail);
      expect(payload.userId).toBeDefined();
      expect(payload.role).toBe(UserRole.CUSTOMER);
    });

    it('should reject invalid token', async () => {
      await expect(authService.validateToken('invalid.token.here')).rejects.toThrow(
        'Invalid or expired token'
      );
    });
  });

  describe('refreshToken', () => {
    const testEmail = `refresh${Date.now()}@test.example.com`;
    const testPassword = 'SecurePass123!';
    let refreshToken: string;

    beforeAll(async () => {
      const result = await authService.register({ email: testEmail, password: testPassword });
      refreshToken = result.refreshToken;
    });

    it('should generate new tokens with valid refresh token', async () => {
      const result = await authService.refreshToken(refreshToken);

      expect(result.user.email).toBe(testEmail);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.accessToken).not.toBe(refreshToken);
    });

    it('should reject invalid refresh token', async () => {
      await expect(authService.refreshToken('invalid.refresh.token')).rejects.toThrow(
        'Invalid or expired refresh token'
      );
    });
  });

  describe('requestPasswordReset', () => {
    const testEmail = `reset${Date.now()}@test.example.com`;
    const testPassword = 'SecurePass123!';

    beforeAll(async () => {
      await authService.register({ email: testEmail, password: testPassword });
    });

    it('should generate reset token for valid email', async () => {
      const result = await authService.requestPasswordReset(testEmail);

      expect(result.token).toBeDefined();
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should throw error for non-existent email', async () => {
      await expect(
        authService.requestPasswordReset('nonexistent@test.example.com')
      ).rejects.toThrow('If the email exists, a reset link will be sent');
    });
  });

  describe('resetPassword', () => {
    const testEmail = `resetpw${Date.now()}@test.example.com`;
    const testPassword = 'SecurePass123!';
    const newPassword = 'NewSecurePass456!';
    let resetToken: string;

    beforeAll(async () => {
      await authService.register({ email: testEmail, password: testPassword });
      const result = await authService.requestPasswordReset(testEmail);
      resetToken = result.token;
    });

    it('should reset password with valid token', async () => {
      await authService.resetPassword(resetToken, newPassword);

      // Should be able to login with new password
      const loginResult = await authService.login({ email: testEmail, password: newPassword });
      expect(loginResult.user.email).toBe(testEmail);

      // Should not be able to login with old password
      await expect(authService.login({ email: testEmail, password: testPassword })).rejects.toThrow(
        'Invalid credentials'
      );
    });

    it('should reject weak password', async () => {
      const result = await authService.requestPasswordReset(testEmail);

      await expect(authService.resetPassword(result.token, 'weak')).rejects.toThrow(
        'Password must be at least 8 characters long'
      );
    });

    it('should reject invalid token', async () => {
      await expect(authService.resetPassword('invalid.token', newPassword)).rejects.toThrow(
        'Invalid or expired reset token'
      );
    });
  });

  describe('changePassword', () => {
    const testEmail = `changepw${Date.now()}@test.example.com`;
    const testPassword = 'SecurePass123!';
    const newPassword = 'NewSecurePass456!';
    let userId: string;

    beforeAll(async () => {
      const result = await authService.register({ email: testEmail, password: testPassword });
      userId = result.user.id;
    });

    it('should change password with correct old password', async () => {
      await authService.changePassword(userId, testPassword, newPassword);

      // Should be able to login with new password
      const loginResult = await authService.login({ email: testEmail, password: newPassword });
      expect(loginResult.user.email).toBe(testEmail);
    });

    it('should reject incorrect old password', async () => {
      await expect(
        authService.changePassword(userId, 'WrongPassword123!', 'AnotherPass789!')
      ).rejects.toThrow('Current password is incorrect');
    });

    it('should reject weak new password', async () => {
      await expect(authService.changePassword(userId, newPassword, 'weak')).rejects.toThrow(
        'Password must be at least 8 characters long'
      );
    });

    it('should reject non-existent user', async () => {
      await expect(
        authService.changePassword('non-existent-id', testPassword, newPassword)
      ).rejects.toThrow('User not found');
    });
  });
});
