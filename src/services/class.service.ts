import { PrismaClient, DayOfWeek } from '@prisma/client';

const prisma = new PrismaClient();

export interface CreateClassInput {
  name: string;
  style: string;
  level: string;
  dayOfWeek: DayOfWeek;
  startTime: string; // e.g. "09:00"
  duration: number; // minutes
  locationId: string;
  teacherId: string;
  capacity: number;
  pricingRuleId: string;
  description?: string;
  ageRange?: { min?: number; max?: number };
  roomId?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface UpdateClassInput {
  name?: string;
  style?: string;
  level?: string;
  dayOfWeek?: DayOfWeek;
  startTime?: string;
  duration?: number;
  locationId?: string;
  teacherId?: string;
  capacity?: number;
  pricingRuleId?: string;
  description?: string;
  ageRange?: { min?: number; max?: number };
  roomId?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface TimetableFilters {
  ageGroup?: string;
  level?: string;
  style?: string;
  locationId?: string;
  teacherId?: string;
  dayOfWeek?: DayOfWeek;
}

export class ClassService {
  /**
   * Creates a new class.
   * Requirements: 8.1, 8.2 - Admin creates class with required and optional fields
   */
  async createClass(input: CreateClassInput) {
    const {
      name, style, level, dayOfWeek, startTime, duration,
      locationId, teacherId, capacity, pricingRuleId,
      description, ageRange, roomId, startDate, endDate,
    } = input;

    // Verify teacher exists
    const teacher = await prisma.teacher.findUnique({ where: { id: teacherId } });
    if (!teacher) {
      throw new Error('Teacher not found');
    }

    // Verify location exists
    const location = await prisma.location.findUnique({ where: { id: locationId } });
    if (!location) {
      throw new Error('Location not found');
    }

    // Verify pricing rule exists
    const pricingRule = await prisma.pricingRule.findUnique({ where: { id: pricingRuleId } });
    if (!pricingRule) {
      throw new Error('Pricing rule not found');
    }

    return prisma.class.create({
      data: {
        name,
        style,
        level,
        dayOfWeek,
        startTime,
        duration,
        locationId,
        teacherId,
        capacity,
        pricingRuleId,
        description,
        ageRange: ageRange ?? undefined,
        roomId,
        startDate,
        endDate,
      },
      include: {
        teacher: true,
        location: true,
        pricingRule: true,
      },
    });
  }

  /**
   * Gets a class by ID.
   * Requirements: 8.3 - Changes reflected in timetable immediately
   */
  async getClassById(classId: string) {
    const cls = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        teacher: true,
        location: true,
        pricingRule: true,
      },
    });

    if (!cls) {
      throw new Error('Class not found');
    }

    return cls;
  }

  /**
   * Updates a class.
   * Requirements: 8.3 - Persist changes and reflect in timetable immediately
   */
  async updateClass(classId: string, input: UpdateClassInput) {
    const cls = await prisma.class.findUnique({ where: { id: classId } });
    if (!cls) {
      throw new Error('Class not found');
    }

    // Verify teacher exists if being updated
    if (input.teacherId !== undefined) {
      const teacher = await prisma.teacher.findUnique({ where: { id: input.teacherId } });
      if (!teacher) {
        throw new Error('Teacher not found');
      }
    }

    // Verify location exists if being updated
    if (input.locationId !== undefined) {
      const location = await prisma.location.findUnique({ where: { id: input.locationId } });
      if (!location) {
        throw new Error('Location not found');
      }
    }

    // Verify pricing rule exists if being updated
    if (input.pricingRuleId !== undefined) {
      const pricingRule = await prisma.pricingRule.findUnique({ where: { id: input.pricingRuleId } });
      if (!pricingRule) {
        throw new Error('Pricing rule not found');
      }
    }

    return prisma.class.update({
      where: { id: classId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.style !== undefined && { style: input.style }),
        ...(input.level !== undefined && { level: input.level }),
        ...(input.dayOfWeek !== undefined && { dayOfWeek: input.dayOfWeek }),
        ...(input.startTime !== undefined && { startTime: input.startTime }),
        ...(input.duration !== undefined && { duration: input.duration }),
        ...(input.locationId !== undefined && { locationId: input.locationId }),
        ...(input.teacherId !== undefined && { teacherId: input.teacherId }),
        ...(input.capacity !== undefined && { capacity: input.capacity }),
        ...(input.pricingRuleId !== undefined && { pricingRuleId: input.pricingRuleId }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.ageRange !== undefined && { ageRange: input.ageRange }),
        ...(input.roomId !== undefined && { roomId: input.roomId }),
        ...(input.startDate !== undefined && { startDate: input.startDate }),
        ...(input.endDate !== undefined && { endDate: input.endDate }),
      },
      include: {
        teacher: true,
        location: true,
        pricingRule: true,
      },
    });
  }

  /**
   * Deletes a class.
   * Requirements: 8.4 - Prevent deletion if active enrolments exist
   */
  async deleteClass(classId: string) {
    const cls = await prisma.class.findUnique({ where: { id: classId } });
    if (!cls) {
      throw new Error('Class not found');
    }

    const activeEnrolments = await prisma.enrolment.count({
      where: { classId, status: 'ACTIVE' },
    });

    if (activeEnrolments > 0) {
      throw new Error('Cannot delete class with active enrolments');
    }

    await prisma.class.delete({ where: { id: classId } });
  }

  /**
   * Gets all classes with optional filters (timetable).
   * Requirements: 3.1, 3.2 - Display and filter timetable
   */
  async getTimetable(filters: TimetableFilters = {}) {
    const where: Record<string, unknown> = {};

    if (filters.level) where.level = filters.level;
    if (filters.style) where.style = filters.style;
    if (filters.locationId) where.locationId = filters.locationId;
    if (filters.teacherId) where.teacherId = filters.teacherId;
    if (filters.dayOfWeek) where.dayOfWeek = filters.dayOfWeek;

    return prisma.class.findMany({
      where,
      include: {
        teacher: true,
        location: true,
        pricingRule: true,
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  /**
   * Gets all classes assigned to a specific teacher.
   * Requirements: 2.3, 7.1 - Teacher sees only their assigned classes
   */
  async getClassesForTeacher(teacherId: string) {
    const teacher = await prisma.teacher.findUnique({ where: { id: teacherId } });
    if (!teacher) {
      throw new Error('Teacher not found');
    }

    return prisma.class.findMany({
      where: { teacherId },
      include: {
        teacher: true,
        location: true,
        pricingRule: true,
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }
}

export const classService = new ClassService();
