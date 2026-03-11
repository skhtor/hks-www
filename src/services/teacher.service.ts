import { PrismaClient } from '@prisma/client';
import { authService } from './auth.service';

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
