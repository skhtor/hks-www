import { Request, Response, NextFunction } from 'express';
import { auditService } from '../services/audit.service';

/**
 * Sanitize a string value - strip null bytes and trim
 */
function sanitizeString(value: unknown): unknown {
  if (typeof value === 'string') {
    // Remove null bytes and control characters (except newlines/tabs)
    return value.replace(/\0/g, '').replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
  }
  return value;
}

/**
 * Recursively sanitize all string values in an object
 */
function sanitizeObject(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  if (obj !== null && typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }
  return sanitizeString(obj);
}

/**
 * Input sanitization middleware - sanitizes req.body, req.query, req.params
 */
export const sanitizeInput = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  if (req.query) {
    req.query = sanitizeObject(req.query) as Record<string, string>;
  }
  next();
};

/**
 * Audit logging middleware for admin routes
 */
export const auditAdminAction = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.user && req.method !== 'GET') {
    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress;

    auditService.log({
      userId: req.user.userId,
      action: 'ADMIN_ACTION',
      entityType: req.path.split('/')[1],
      details: {
        method: req.method,
        path: req.path,
        body: req.body,
      },
      ipAddress,
      userAgent: req.headers['user-agent'],
    });
  }
  next();
};

/**
 * Request ID middleware - adds a unique request ID to each request
 */
export const requestId = (req: Request, res: Response, next: NextFunction): void => {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  req.headers['x-request-id'] = id;
  res.setHeader('X-Request-Id', id);
  next();
};
