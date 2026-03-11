import fc from 'fast-check';
import { AuthService } from '../../services/auth.service';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const authService = new AuthService();

describe('AuthService Property-Based Tests', () => {
  beforeAll(async () => {
    // Clean up test data
    await prisma.userAccount.deleteMany({
      where: {
        email: {
          contains: '@pbt.test.com',
        },
      },
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.userAccount.deleteMany({
      where: {
        email: {
          contains: '@pbt.test.com',
        },
      },
    });
    await prisma.$disconnect();
  });

  /**
   * Property 1: Account Creation Uniqueness
   * Feature: dance-school-management-platform
   * For any email address, creating multiple customer accounts with that email
   * should result in exactly one account, with subsequent attempts rejected
   * due to uniqueness constraints.
   * **Validates: Requirements 1.1**
   */
  describe('Property 1: Account Creation Uniqueness', () => {
    it('should enforce email uniqueness across all registration attempts', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.emailAddress(),
          fc.string({ minLength: 8, maxLength: 20 }).filter((s) => {
            // Ensure password meets strength requirements
            return /[A-Z]/.test(s) && /[a-z]/.test(s) && /[0-9]/.test(s);
          }),
          async (email, password) => {
            // Use unique email for each test run
            const testEmail = `${Date.now()}.${email}@pbt.test.com`;

            // First registration should succeed
            const firstResult = await authService.register({
              email: testEmail,
              password,
            });

            expect(firstResult.user.email).toBe(testEmail);
            expect(firstResult.user.id).toBeDefined();

            // Second registration with same email should fail
            await expect(
              authService.register({
                email: testEmail,
                password: password + 'Different',
              })
            ).rejects.toThrow('Email already registered');

            // Verify only one account exists
            const accounts = await prisma.userAccount.findMany({
              where: { email: testEmail },
            });

            expect(accounts).toHaveLength(1);
          }
        ),
        { numRuns: 20 } // Reduced runs for database operations
      );
    });
  });

  /**
   * Property 4: Password Strength Enforcement
   * Feature: dance-school-management-platform
   * For any password that violates strength requirements (minimum length,
   * complexity rules), account creation or password change should be rejected.
   * **Validates: Requirements 1.7**
   */
  describe('Property 4: Password Strength Enforcement', () => {
    it('should reject passwords shorter than 8 characters', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.emailAddress(),
          fc.string({ minLength: 1, maxLength: 7 }),
          async (email, shortPassword) => {
            const testEmail = `${Date.now()}.${email}@pbt.test.com`;

            await expect(
              authService.register({
                email: testEmail,
                password: shortPassword,
              })
            ).rejects.toThrow('Password must be at least 8 characters long');
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should reject passwords without uppercase letters', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.emailAddress(),
          fc
            .string({ minLength: 8, maxLength: 20 })
            .filter((s) => !/[A-Z]/.test(s) && /[a-z]/.test(s) && /[0-9]/.test(s)),
          async (email, password) => {
            const testEmail = `${Date.now()}.${email}@pbt.test.com`;

            await expect(
              authService.register({
                email: testEmail,
                password,
              })
            ).rejects.toThrow('Password must contain at least one uppercase letter');
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should reject passwords without lowercase letters', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.emailAddress(),
          fc
            .string({ minLength: 8, maxLength: 20 })
            .filter((s) => /[A-Z]/.test(s) && !/[a-z]/.test(s) && /[0-9]/.test(s)),
          async (email, password) => {
            const testEmail = `${Date.now()}.${email}@pbt.test.com`;

            await expect(
              authService.register({
                email: testEmail,
                password,
              })
            ).rejects.toThrow('Password must contain at least one lowercase letter');
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should reject passwords without numbers', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.emailAddress(),
          fc
            .string({ minLength: 8, maxLength: 20 })
            .filter((s) => /[A-Z]/.test(s) && /[a-z]/.test(s) && !/[0-9]/.test(s)),
          async (email, password) => {
            const testEmail = `${Date.now()}.${email}@pbt.test.com`;

            await expect(
              authService.register({
                email: testEmail,
                password,
              })
            ).rejects.toThrow('Password must contain at least one number');
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should accept passwords meeting all strength requirements', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.emailAddress(),
          fc.string({ minLength: 8, maxLength: 20 }).filter((s) => {
            return /[A-Z]/.test(s) && /[a-z]/.test(s) && /[0-9]/.test(s);
          }),
          async (email, password) => {
            const testEmail = `${Date.now()}.${email}@pbt.test.com`;

            const result = await authService.register({
              email: testEmail,
              password,
            });

            expect(result.user.email).toBe(testEmail);
            expect(result.user.id).toBeDefined();
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  /**
   * Property 34: Password Hashing
   * Feature: dance-school-management-platform
   * For any stored password, the database value should be a hash, not plaintext,
   * and should verify correctly against the original password.
   * **Validates: Requirements 18.1**
   */
  describe('Property 34: Password Hashing', () => {
    it('should never store plaintext passwords and hashes should verify correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.emailAddress(),
          fc.string({ minLength: 8, maxLength: 20 }).filter((s) => {
            return /[A-Z]/.test(s) && /[a-z]/.test(s) && /[0-9]/.test(s);
          }),
          async (email, password) => {
            const testEmail = `${Date.now()}.${email}@pbt.test.com`;

            // Register user
            await authService.register({
              email: testEmail,
              password,
            });

            // Retrieve user from database
            const user = await prisma.userAccount.findUnique({
              where: { email: testEmail },
            });

            expect(user).toBeDefined();

            // Password hash should not equal plaintext password
            expect(user!.passwordHash).not.toBe(password);

            // Password hash should be a bcrypt hash (starts with $2b$ or $2a$)
            expect(user!.passwordHash).toMatch(/^\$2[ab]\$/);

            // Hash should verify correctly against original password
            const isValid = await bcrypt.compare(password, user!.passwordHash);
            expect(isValid).toBe(true);

            // Hash should not verify against different password
            const isInvalid = await bcrypt.compare(password + 'wrong', user!.passwordHash);
            expect(isInvalid).toBe(false);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  /**
   * Property 2: Authentication Round Trip
   * Feature: dance-school-management-platform
   * For any valid customer account, logging in with correct credentials should
   * grant access to the customer portal with the correct user identity and role.
   * **Validates: Requirements 1.2**
   */
  describe('Property 2: Authentication Round Trip', () => {
    it('should successfully complete register -> login -> validate token round trip', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.emailAddress(),
          fc.string({ minLength: 8, maxLength: 20 }).filter((s) => {
            return /[A-Z]/.test(s) && /[a-z]/.test(s) && /[0-9]/.test(s);
          }),
          async (email, password) => {
            const testEmail = `${Date.now()}.${email}@pbt.test.com`;

            // Step 1: Register
            const registerResult = await authService.register({
              email: testEmail,
              password,
            });

            expect(registerResult.user.email).toBe(testEmail);
            expect(registerResult.accessToken).toBeDefined();

            // Step 2: Login with same credentials
            const loginResult = await authService.login({
              email: testEmail,
              password,
            });

            expect(loginResult.user.email).toBe(testEmail);
            expect(loginResult.user.id).toBe(registerResult.user.id);
            expect(loginResult.user.role).toBe(registerResult.user.role);
            expect(loginResult.accessToken).toBeDefined();

            // Step 3: Validate token
            const validatedPayload = await authService.validateToken(loginResult.accessToken);

            expect(validatedPayload.email).toBe(testEmail);
            expect(validatedPayload.userId).toBe(registerResult.user.id);
            expect(validatedPayload.role).toBe(registerResult.user.role);

            // Step 4: Refresh token should also work
            const refreshResult = await authService.refreshToken(loginResult.refreshToken);

            expect(refreshResult.user.email).toBe(testEmail);
            expect(refreshResult.user.id).toBe(registerResult.user.id);
            expect(refreshResult.accessToken).toBeDefined();
            expect(refreshResult.refreshToken).toBeDefined();

            // New access token should validate correctly
            const newValidatedPayload = await authService.validateToken(
              refreshResult.accessToken
            );
            expect(newValidatedPayload.email).toBe(testEmail);
            expect(newValidatedPayload.userId).toBe(registerResult.user.id);
            expect(newValidatedPayload.role).toBe(registerResult.user.role);
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
