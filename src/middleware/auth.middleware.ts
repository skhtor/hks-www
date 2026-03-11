import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { authService } from '../services/auth.service';
import { JWTPayload } from '../services/auth.service';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

/**
 * Authentication middleware
 * Validates JWT token and attaches user to request
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    const payload = await authService.validateToken(token);
    req.user = payload;

    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired token',
      },
    });
  }
};

/**
 * Authorization middleware factory
 * Creates middleware that checks if user has required role(s)
 */
export const authorize = (...allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
        },
      });
      return;
    }

    next();
  };
};

/**
 * Resource-level permission check
 * Validates if user can access a specific resource
 */
export interface ResourcePermission {
  resourceType: string;
  resourceId: string;
  action: 'read' | 'write' | 'delete';
}

export const checkResourcePermission = (
  getPermission: (req: Request) => ResourcePermission
) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
        return;
      }

      const permission = getPermission(req);

      // Admin has access to all resources
      if (req.user.role === UserRole.ADMIN) {
        next();
        return;
      }

      // Customer can only access their own resources
      if (req.user.role === UserRole.CUSTOMER) {
        const hasAccess = await validateCustomerAccess(
          req.user.userId,
          permission.resourceType,
          permission.resourceId,
          permission.action
        );

        if (!hasAccess) {
          res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'You do not have permission to access this resource',
            },
          });
          return;
        }
      }

      // Teacher can only access assigned classes
      if (req.user.role === UserRole.TEACHER) {
        const hasAccess = await validateTeacherAccess(
          req.user.userId,
          permission.resourceType,
          permission.resourceId,
          permission.action
        );

        if (!hasAccess) {
          res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'You do not have permission to access this resource',
            },
          });
          return;
        }
      }

      next();
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Error checking permissions',
        },
      });
    }
  };
};

/**
 * Teacher-specific middleware to ensure they can only access assigned classes
 * 
 * Requirements: 2.3, 7.7 - Restrict teacher views to assigned classes only
 */
export const checkTeacherClassAccess = (
  getClassId: (req: Request) => string
) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
        return;
      }

      // Admin has access to all classes
      if (req.user.role === UserRole.ADMIN) {
        next();
        return;
      }

      // Only teachers need this check
      if (req.user.role !== UserRole.TEACHER) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'This endpoint is for teachers only',
          },
        });
        return;
      }

      const classId = getClassId(req);
      const hasAccess = await validateTeacherClassAccess(req.user.userId, classId);

      if (!hasAccess) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have access to this class',
          },
        });
        return;
      }

      next();
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Error checking class access',
        },
      });
    }
  };
};

/**
 * Validates teacher access to a specific class
 */
async function validateTeacherClassAccess(
  userId: string,
  classId: string
): Promise<boolean> {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  try {
    const teacher = await prisma.teacher.findUnique({
      where: { userId },
    });

    if (!teacher) {
      return false;
    }

    // Check if class is assigned to this teacher
    const classRecord = await prisma.class.findUnique({
      where: { id: classId },
    });

    return classRecord ? classRecord.teacherId === teacher.id : false;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Validates customer access to resources
 */
async function validateCustomerAccess(
  userId: string,
  resourceType: string,
  resourceId: string,
  _action: string
): Promise<boolean> {
  // Import PrismaClient here to avoid circular dependencies
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  try {
    // Get customer record
    const customer = await prisma.customer.findUnique({
      where: { userId },
      include: { household: { include: { dancers: true } } },
    });

    if (!customer) {
      return false;
    }

    // Check resource-specific access
    switch (resourceType) {
      case 'customer':
        return customer.id === resourceId;

      case 'dancer':
        return customer.household.dancers.some((d) => d.id === resourceId);

      case 'enrolment':
        const enrolment = await prisma.enrolment.findUnique({
          where: { id: resourceId },
          include: { dancer: true },
        });
        return enrolment
          ? customer.household.dancers.some((d) => d.id === enrolment.dancerId)
          : false;

      case 'invoice':
        return (
          (await prisma.invoice.count({
            where: { id: resourceId, customerId: customer.id },
          })) > 0
        );

      case 'payment':
        return (
          (await prisma.payment.count({
            where: { id: resourceId, customerId: customer.id },
          })) > 0
        );

      default:
        return false;
    }
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Validates teacher access to resources
 */
async function validateTeacherAccess(
  userId: string,
  resourceType: string,
  resourceId: string,
  action: string
): Promise<boolean> {
  // Import PrismaClient here to avoid circular dependencies
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  try {
    // Get teacher record
    const teacher = await prisma.teacher.findUnique({
      where: { userId },
    });

    if (!teacher) {
      return false;
    }

    // Teachers can only read, not write or delete
    if (action !== 'read') {
      return false;
    }

    // Check resource-specific access
    switch (resourceType) {
      case 'class':
        // Teacher can only access their assigned classes
        return (
          (await prisma.class.count({
            where: { id: resourceId, teacherId: teacher.id },
          })) > 0
        );

      case 'enrolment':
        // Teacher can access enrolments for their classes
        const enrolment = await prisma.enrolment.findUnique({
          where: { id: resourceId },
          include: { class: true },
        });
        return enrolment ? enrolment.class.teacherId === teacher.id : false;

      case 'attendance':
        // Teacher can access attendance for their classes
        const attendance = await prisma.attendanceRecord.findUnique({
          where: { id: resourceId },
          include: { class: true },
        });
        return attendance ? attendance.class.teacherId === teacher.id : false;

      default:
        return false;
    }
  } finally {
    await prisma.$disconnect();
  }
}
