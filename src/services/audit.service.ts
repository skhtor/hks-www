import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'REGISTER'
  | 'PASSWORD_RESET'
  | 'ENROLMENT_CREATE'
  | 'ENROLMENT_CANCEL'
  | 'ENROLMENT_MOVE'
  | 'PAYMENT_PROCESS'
  | 'PAYMENT_REFUND'
  | 'CLASS_CREATE'
  | 'CLASS_UPDATE'
  | 'CLASS_DELETE'
  | 'XERO_SYNC'
  | 'ADMIN_ACTION'
  | 'CONFIG_UPDATE';

export interface AuditEntry {
  userId?: string;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export const auditService = {
  async log(entry: AuditEntry): Promise<void> {
    // userId is required by schema - skip if not available
    if (!entry.userId) return;

    try {
      await prisma.auditLog.create({
        data: {
          userId: entry.userId,
          action: entry.action,
          entityType: entry.entityType ?? 'system',
          entityId: entry.entityId ?? 'N/A',
          changes: {
            ...(entry.details ?? {}),
            ipAddress: entry.ipAddress,
            userAgent: entry.userAgent,
          },
        },
      });
    } catch (err) {
      // Audit logging should never break the main flow
      console.error('[AuditService] Failed to write audit log:', err);
    }
  },
};
