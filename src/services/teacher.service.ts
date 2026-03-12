import { PrismaClient, DayOfWeek } from '@prisma/client';
import { authService } from './auth.service';

// Map JS day index (0=Sun) to DayOfWeek enum values
const DAY_INDEX_TO_ENUM: DayOfWeek[] = [
  DayOfWeek.SUNDAY,
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
];

export interface WeeklyClassInfo {
  id: string;
  name: string;
  style: string;
  level: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  duration: number;
  location: {
    id: string;
    name: string;
    address: unknown;
  };
  enrolledCount: number;
  capacity: number;
}

const prisma = new PrismaClient();

export interface CreateTeacherInput {
  email: string;
  password: string;
  name: string;
  bio?: string;
  specialties?: string[];
  photoUrl?: string;
}

export interface UpdateTeacherInput {
  name?: string;
  bio?: string;
  specialties?: string[];
  photoUrl?: string;
}

export class TeacherService {
  /**
   * Creates a teacher account (admin only).
   * Requirements: 2.5 - Admin creates teacher account, prevents self-registration
   */
  async createTeacher(input: CreateTeacherInput) {
    const { email, password, name, bio, specialties, photoUrl } = input;

    // Register the user account with TEACHER role
    const authResult = await authService.register({ email, password, role: 'TEACHER' });
    const userId = authResult.user.id;

    // Create the teacher profile
    const teacher = await prisma.teacher.create({
      data: {
        userId,
        name,
        email,
        bio,
        specialties: specialties ?? [],
        photoUrl,
      },
      include: { user: { select: { id: true, email: true, role: true, createdAt: true } } },
    });

    return teacher;
  }

  /**
   * Gets a teacher profile by teacherId.
   * Requirements: 7.1 - Teacher can view their own profile
   */
  async getTeacherById(teacherId: string) {
    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      include: { user: { select: { id: true, email: true, role: true, createdAt: true } } },
    });

    if (!teacher) {
      throw new Error('Teacher profile not found');
    }

    return teacher;
  }

  /**
   * Gets a teacher profile by userId.
   * Requirements: 7.1 - Teacher can view their own profile
   */
  async getTeacherByUserId(userId: string) {
    const teacher = await prisma.teacher.findUnique({
      where: { userId },
      include: { user: { select: { id: true, email: true, role: true, createdAt: true } } },
    });

    if (!teacher) {
      throw new Error('Teacher profile not found');
    }

    return teacher;
  }

  /**
   * Lists all teacher profiles (admin only).
   */
  async listTeachers() {
    return prisma.teacher.findMany({
      include: { user: { select: { id: true, email: true, role: true, createdAt: true } } },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Updates a teacher profile.
   * Requirements: 7.1 - Teacher portal access
   */
  async updateTeacher(teacherId: string, input: UpdateTeacherInput) {
    const teacher = await prisma.teacher.findUnique({ where: { id: teacherId } });
    if (!teacher) {
      throw new Error('Teacher profile not found');
    }

    return prisma.teacher.update({
      where: { id: teacherId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.bio !== undefined && { bio: input.bio }),
        ...(input.specialties !== undefined && { specialties: input.specialties }),
        ...(input.photoUrl !== undefined && { photoUrl: input.photoUrl }),
      },
      include: { user: { select: { id: true, email: true, role: true, createdAt: true } } },
    });
  }

  /**
   * Gets classes for a teacher for the current week.
   * Requirements: 7.1, 7.2 - Teacher dashboard showing classes for current week
   * with time, location, and level information.
   */
  async getWeeklyClasses(userId: string): Promise<WeeklyClassInfo[]> {
    const teacher = await prisma.teacher.findUnique({ where: { userId } });
    if (!teacher) {
      throw new Error('Teacher profile not found');
    }

    // Determine which days of the week are in the current week (Mon–Sun)
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    // Build set of DayOfWeek enum values for the current week (all 7 days)
    const currentWeekDays = new Set<DayOfWeek>(DAY_INDEX_TO_ENUM);

    const classes = await prisma.class.findMany({
      where: {
        teacherId: teacher.id,
        dayOfWeek: { in: Array.from(currentWeekDays) },
        OR: [{ endDate: null }, { endDate: { gte: today } }],
      },
      select: {
        id: true,
        name: true,
        style: true,
        level: true,
        dayOfWeek: true,
        startTime: true,
        duration: true,
        enrolledCount: true,
        capacity: true,
        location: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    // Suppress unused variable warning
    void dayOfWeek;

    return classes.map((c) => ({
      id: c.id,
      name: c.name,
      style: c.style,
      level: c.level,
      dayOfWeek: c.dayOfWeek,
      startTime: c.startTime,
      duration: c.duration,
      location: {
        id: c.location.id,
        name: c.location.name,
        address: c.location.address,
      },
      enrolledCount: c.enrolledCount,
      capacity: c.capacity,
    }));
  }

  /**
   * Deletes a teacher profile and associated user account (admin only).
   */
  async deleteTeacher(teacherId: string) {
    const teacher = await prisma.teacher.findUnique({ where: { id: teacherId } });
    if (!teacher) {
      throw new Error('Teacher profile not found');
    }

    // Check for assigned classes
    const assignedClasses = await prisma.class.count({
      where: { teacherId },
    });

    if (assignedClasses > 0) {
      throw new Error('Cannot delete teacher with assigned classes');
    }

    // Delete teacher profile (cascades to user account via onDelete: Cascade)
    await prisma.userAccount.delete({ where: { id: teacher.userId } });
  }
}

export const teacherService = new TeacherService();
