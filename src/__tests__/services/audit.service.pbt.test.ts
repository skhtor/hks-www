/**
 * Property-Based Tests for Audit Service
 *
 * Property 39: Audit Log Completeness
 * - Every audit log entry must have a userId, action, entityType, and entityId
 * - Audit logs must never throw errors (fail silently)
 * - Audit log entries are immutable once created
 *
 * Validates: Requirements 9.6, 18.6
 */

import * as fc from 'fast-check';
import { auditService, AuditAction } from '../../services/audit.service';

// Mock Prisma to avoid DB dependency in unit tests
jest.mock('@prisma/client', () => {
  const mockCreate = jest.fn().mockResolvedValue({ id: 'audit-id' });
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      auditLog: { create: mockCreate },
    })),
  };
});

const AUDIT_ACTIONS: AuditAction[] = [
  'LOGIN',
  'LOGOUT',
  'REGISTER',
  'ENROLMENT_CREATE',
  'ENROLMENT_CANCEL',
  'PAYMENT_PROCESS',
  'ADMIN_ACTION',
];

describe('AuditService - Property 39: Audit Log Completeness', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Property: audit log never throws regardless of input', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.oneof(fc.uuid(), fc.constant(undefined)),
          action: fc.constantFrom(...AUDIT_ACTIONS),
          entityType: fc.oneof(fc.string({ minLength: 1, maxLength: 50 }), fc.constant(undefined)),
          entityId: fc.oneof(fc.uuid(), fc.constant(undefined)),
          details: fc.oneof(
            fc.record({ key: fc.string(), value: fc.string() }),
            fc.constant(undefined)
          ),
          ipAddress: fc.oneof(
            fc.ipV4(),
            fc.constant(undefined)
          ),
        }),
        async (entry) => {
          // Should never throw
          await expect(auditService.log(entry)).resolves.not.toThrow();
        }
      ),
      { numRuns: 50 }
    );
  });

  it('Property: entries without userId are silently skipped', async () => {
    const { PrismaClient } = require('@prisma/client');
    const mockInstance = new PrismaClient();

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...AUDIT_ACTIONS),
        async (action) => {
          mockInstance.auditLog.create.mockClear();
          await auditService.log({ action, userId: undefined });
          // No DB call should be made when userId is missing
          expect(mockInstance.auditLog.create).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 20 }
    );
  });

  it('Property: entries with userId always attempt DB write', async () => {
    const { PrismaClient } = require('@prisma/client');
    const mockInstance = new PrismaClient();

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          action: fc.constantFrom(...AUDIT_ACTIONS),
          entityType: fc.string({ minLength: 1, maxLength: 30 }),
          entityId: fc.uuid(),
        }),
        async (entry) => {
          mockInstance.auditLog.create.mockClear();
          await auditService.log(entry);
          expect(mockInstance.auditLog.create).toHaveBeenCalledTimes(1);
          const callArg = mockInstance.auditLog.create.mock.calls[0][0];
          expect(callArg.data.userId).toBe(entry.userId);
          expect(callArg.data.action).toBe(entry.action);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('Property: DB failure does not propagate to caller', async () => {
    const { PrismaClient } = require('@prisma/client');
    const mockInstance = new PrismaClient();
    mockInstance.auditLog.create.mockRejectedValue(new Error('DB connection lost'));

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          action: fc.constantFrom(...AUDIT_ACTIONS),
        }),
        async (entry) => {
          // Even when DB fails, audit.log should not throw
          await expect(auditService.log(entry)).resolves.toBeUndefined();
        }
      ),
      { numRuns: 20 }
    );
  });
});
