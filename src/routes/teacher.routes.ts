import { Router, Request, Response } from 'express';
import { authenticate, authorize, checkTeacherClassAccess } from '../middleware/auth.middleware';
import { authorizationService } from '../services/authorization.service';

const router = Router();

/**
 * GET /teacher/classes
 * Get all classes assigned to the authenticated teacher
 * 
 * Requirements: 2.3, 7.7 - Teachers should only see classes assigned to them
 */
router.get(
  '/classes',
  authenticate,
  authorize('TEACHER', 'ADMIN'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
        return;
      }

      // Get teacher record
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();

      try {
        const teacher = await prisma.teacher.findUnique({
          where: { userId: req.user.userId },
        });

        if (!teacher) {
          res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Teacher not found' },
          });
          return;
        }

        // Get classes assigned to this teacher
        const classes = await authorizationService.getTeacherClassDetails(teacher.id);

        res.json({
          success: true,
          data: classes,
        });
      } finally {
        await prisma.$disconnect();
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch classes' },
      });
    }
  }
);

/**
 * GET /teacher/classes/:classId/roll
 * Get class roll with filtered student information based on access policy
 * 
 * Requirements: 2.3, 2.4, 7.7 - Teachers can only view assigned classes
 * and student information is filtered based on access policy
 */
router.get(
  '/classes/:classId/roll',
  authenticate,
  authorize('TEACHER', 'ADMIN'),
  checkTeacherClassAccess((req) => req.params.classId),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
        return;
      }

      const { classId } = req.params;

      // Get teacher record
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();

      try {
        const teacher = await prisma.teacher.findUnique({
          where: { userId: req.user.userId },
        });

        if (!teacher) {
          res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Teacher not found' },
          });
          return;
        }

        // Get class roll with filtered student information
        const classRoll = await authorizationService.getClassRollForTeacher(
          teacher.id,
          classId
        );

        res.json({
          success: true,
          data: {
            classId,
            students: classRoll,
          },
        });
      } finally {
        await prisma.$disconnect();
      }
    } catch (error: any) {
      if (error.message === 'Teacher does not have access to this class') {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: error.message },
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch class roll' },
      });
    }
  }
);

/**
 * GET /teacher/access-policy
 * Get the current access policy for the authenticated teacher
 * 
 * Requirements: 2.4 - Display student information based on access policy
 */
router.get(
  '/access-policy',
  authenticate,
  authorize('TEACHER', 'ADMIN'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
        return;
      }

      // Get teacher record
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();

      try {
        const teacher = await prisma.teacher.findUnique({
          where: { userId: req.user.userId },
        });

        if (!teacher) {
          res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Teacher not found' },
          });
          return;
        }

        // Get access policy
        const policy = await authorizationService.getTeacherAccessPolicy(teacher.id);

        res.json({
          success: true,
          data: policy,
        });
      } finally {
        await prisma.$disconnect();
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch access policy' },
      });
    }
  }
);

export default router;
