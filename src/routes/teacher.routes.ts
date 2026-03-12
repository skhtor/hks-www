import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { teacherService } from '../services/teacher.service';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();

// All teacher routes require authentication
router.use(authenticate);

// Validation schemas
const createTeacherSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required'),
  bio: z.string().optional(),
  specialties: z.array(z.string()).optional(),
  photoUrl: z.string().url('Invalid photo URL').optional(),
});

const updateTeacherSchema = z.object({
  name: z.string().min(1).optional(),
  bio: z.string().optional(),
  specialties: z.array(z.string()).optional(),
  photoUrl: z.string().url('Invalid photo URL').optional(),
});

/**
 * POST /api/teachers
 * Create a teacher account (admin only).
 * Requirements: 2.5 - Admin creates teacher account, prevents self-registration
 */
router.post('/', authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const validatedData = createTeacherSchema.parse(req.body);
    const teacher = await teacherService.createTeacher(validatedData);
    res.status(201).json({ success: true, data: teacher });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/teachers
 * List all teachers (admin only).
 */
router.get('/', authorize(UserRole.ADMIN), async (_req: Request, res: Response) => {
  try {
    const teachers = await teacherService.listTeachers();
    res.json({ success: true, data: teachers });
  } catch (error) {
    handleError(error, res);
  }
});

// Attendance validation schema
const markAttendanceSchema = z.object({
  classDate: z.string().min(1, 'classDate is required'),
  records: z.array(
    z.object({
      dancerId: z.string().min(1, 'dancerId is required'),
      status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']),
      notes: z.string().optional(),
    })
  ).min(1, 'At least one attendance record is required'),
});

/**
 * POST /api/teacher/classes/:classId/attendance
 * Mark attendance for a class on a given date.
 * Requirements: 17.1, 17.2, 17.3
 */
router.post(
  '/classes/:classId/attendance',
  authorize(UserRole.TEACHER, UserRole.ADMIN),
  async (req: Request, res: Response) => {
    try {
      const { classId } = req.params;
      const { classDate, records } = markAttendanceSchema.parse(req.body);
      const result = await teacherService.markAttendance(req.user!.userId, classId, classDate, records as any);
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      handleError(error, res);
    }
  }
);

/**
 * GET /api/teacher/classes/:classId/attendance
 * Get attendance records for a class on a given date.
 * Query param: classDate (ISO date string)
 * Requirements: 17.1, 17.2
 */
router.get(
  '/classes/:classId/attendance',
  authorize(UserRole.TEACHER, UserRole.ADMIN),
  async (req: Request, res: Response) => {
    try {
      const { classId } = req.params;
      const classDate = req.query.classDate as string;
      if (!classDate) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'classDate query parameter is required' },
        });
        return;
      }
      const records = await teacherService.getAttendance(req.user!.userId, classId, classDate);
      res.json({ success: true, data: records });
    } catch (error) {
      handleError(error, res);
    }
  }
);


 * - TEACHER role: can only view their assigned classes (Req 7.7)
 * - ADMIN role: can view any class roll
 * Requirements: 7.3, 7.4, 7.7
 */
router.get(
  '/classes/:classId/roll',
  authorize(UserRole.TEACHER, UserRole.ADMIN),
  async (req: Request, res: Response) => {
    try {
      const { classId } = req.params;

      if (req.user!.role === UserRole.ADMIN) {
        // Admin can view any class roll — fetch directly without teacher ownership check
        const { PrismaClient: PC } = await import('@prisma/client');
        const adminPrisma = new PC();
        try {
          const { authorizationService: authSvc } = await import('../services/authorization.service');
          const policy = await authSvc.getTeacherAccessPolicy('admin');
          const enrolments = await adminPrisma.enrolment.findMany({
            where: { classId, status: 'ACTIVE' },
            include: { dancer: true },
          });
          const roll = enrolments.map((enrolment) => {
            const student: Record<string, unknown> = {
              id: enrolment.dancer.id,
              firstName: enrolment.dancer.firstName,
              lastName: enrolment.dancer.lastName,
              enrolmentId: enrolment.id,
              enrolmentStatus: enrolment.status,
            };
            if (policy.showMedicalNotes && enrolment.dancer.medicalNotes) {
              student.medicalNotes = enrolment.dancer.medicalNotes;
            }
            if (policy.showAllergies && enrolment.dancer.allergies) {
              student.allergies = enrolment.dancer.allergies;
            }
            return student;
          });
          res.json({ success: true, data: roll });
        } finally {
          await adminPrisma.$disconnect();
        }
        return;
      }

      // TEACHER role: enforce assigned-class restriction
      const roll = await teacherService.getClassRoll(req.user!.userId, classId);
      res.json({ success: true, data: roll });
    } catch (error) {
      handleError(error, res);
    }
  }
);

/**
 * GET /api/teachers/dashboard
 * Get the authenticated teacher's classes for the current week.
 * Requirements: 7.1, 7.2 - Teacher dashboard with weekly classes, time, location, level
 */
router.get('/dashboard', authorize(UserRole.TEACHER, UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const classes = await teacherService.getWeeklyClasses(req.user!.userId);
    res.json({ success: true, data: classes });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/teachers/me
 * Get the authenticated teacher's own profile.
 * Requirements: 7.1 - Teacher can view their own profile
 */
router.get('/me', authorize(UserRole.TEACHER), async (req: Request, res: Response) => {
  try {
    const teacher = await teacherService.getTeacherByUserId(req.user!.userId);
    res.json({ success: true, data: teacher });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/teachers/:id
 * Get a teacher profile by ID (admin or the teacher themselves).
 */
router.get('/:id', authorize(UserRole.ADMIN, UserRole.TEACHER), async (req: Request, res: Response) => {
  try {
    const teacher = await teacherService.getTeacherById(req.params.id);

    // Teachers can only view their own profile
    if (req.user!.role === UserRole.TEACHER) {
      const ownProfile = await teacherService.getTeacherByUserId(req.user!.userId);
      if (ownProfile.id !== teacher.id) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        });
        return;
      }
    }

    res.json({ success: true, data: teacher });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * PUT /api/teachers/me
 * Update the authenticated teacher's own profile.
 * Requirements: 7.1 - Teacher portal access
 */
router.put('/me', authorize(UserRole.TEACHER), async (req: Request, res: Response) => {
  try {
    const validatedData = updateTeacherSchema.parse(req.body);
    const teacher = await teacherService.getTeacherByUserId(req.user!.userId);
    const updated = await teacherService.updateTeacher(teacher.id, validatedData);
    res.json({ success: true, data: updated });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * PUT /api/teachers/:id
 * Update a teacher profile by ID (admin only).
 */
router.put('/:id', authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const validatedData = updateTeacherSchema.parse(req.body);
    const updated = await teacherService.updateTeacher(req.params.id, validatedData);
    res.json({ success: true, data: updated });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * DELETE /api/teachers/:id
 * Delete a teacher account (admin only).
 */
router.delete('/:id', authorize(UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    await teacherService.deleteTeacher(req.params.id);
    res.json({ success: true, data: { message: 'Teacher deleted successfully' } });
  } catch (error) {
    handleError(error, res);
  }
});

function handleError(error: unknown, res: Response): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input data',
        details: error.errors.reduce(
          (acc, err) => {
            acc[err.path.join('.')] = err.message;
            return acc;
          },
          {} as Record<string, string>
        ),
      },
    });
    return;
  }

  if (error instanceof Error) {
    if (error.message === 'Teacher profile not found') {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      });
      return;
    }

    if (
      error.message === 'Email already registered' ||
      error.message === 'Cannot delete teacher with assigned classes'
    ) {
      res.status(409).json({
        success: false,
        error: { code: 'CONFLICT', message: error.message },
      });
      return;
    }

    if (error.message === 'Teacher does not have access to this class') {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: error.message },
      });
      return;
    }
  }

  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
}

export default router;
