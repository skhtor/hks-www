import { PrismaClient, DayOfWeek } from '@prisma/client';

const prisma = new PrismaClient();

export interface ConflictInfo {
  type: 'teacher' | 'room';
  conflictingClassId: string;
  conflictingClassName: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  conflicts: ConflictInfo[];
}

/**
 * Converts a "HH:MM" time string to total minutes since midnight.
 */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Returns true if two time ranges overlap.
 * Range A: [aStart, aStart + aDuration)
 * Range B: [bStart, bStart + bDuration)
 */
function timesOverlap(
  aStart: number,
  aDuration: number,
  bStart: number,
  bDuration: number,
): boolean {
  const aEnd = aStart + aDuration;
  const bEnd = bStart + bDuration;
  return aStart < bEnd && aEnd > bStart;
}

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
   * Checks for scheduling conflicts for a class definition.
   * Requirements: 24.1, 24.2, 24.5
   *
   * @param data - The class data to check (dayOfWeek, startTime, duration, teacherId, roomId)
   * @param excludeClassId - Optional class ID to exclude (used when updating an existing class)
   */
  async checkSchedulingConflicts(
    data: {
      dayOfWeek: DayOfWeek;
      startTime: string;
      duration: number;
      teacherId: string;
      roomId?: string;
    },
    excludeClassId?: string,
  ): Promise<ValidationResult> {
    const { dayOfWeek, startTime, duration, teacherId, roomId } = data;
    const conflicts: ConflictInfo[] = [];

    // Find all classes on the same day (excluding the class being updated)
    const candidateClasses = await prisma.class.findMany({
      where: {
        dayOfWeek,
        ...(excludeClassId ? { id: { not: excludeClassId } } : {}),
      },
      select: {
        id: true,
        name: true,
        startTime: true,
        duration: true,
        teacherId: true,
        roomId: true,
      },
    });

    const newStart = timeToMinutes(startTime);

    for (const existing of candidateClasses) {
      const existingStart = timeToMinutes(existing.startTime);
      const overlaps = timesOverlap(newStart, duration, existingStart, existing.duration);

      if (!overlaps) continue;

      // Check teacher conflict (Req 24.2)
      if (existing.teacherId === teacherId) {
        conflicts.push({
          type: 'teacher',
          conflictingClassId: existing.id,
          conflictingClassName: existing.name,
          message: `Teacher is already assigned to "${existing.name}" at an overlapping time on ${dayOfWeek}`,
        });
      }

      // Check room conflict (Req 24.1)
      if (roomId && existing.roomId && existing.roomId === roomId) {
        conflicts.push({
          type: 'room',
          conflictingClassId: existing.id,
          conflictingClassName: existing.name,
          message: `Room is already booked for "${existing.name}" at an overlapping time on ${dayOfWeek}`,
        });
      }
    }

    return { valid: conflicts.length === 0, conflicts };
  }

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

    // Check for scheduling conflicts (Req 24.1, 24.2, 24.5)
    const conflictResult = await this.checkSchedulingConflicts({
      dayOfWeek,
      startTime,
      duration,
      teacherId,
      roomId,
    });
    if (!conflictResult.valid) {
      const messages = conflictResult.conflicts.map((c) => c.message).join('; ');
      throw new Error(`Scheduling conflict detected: ${messages}`);
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

    // Check for scheduling conflicts if any scheduling fields are being updated (Req 24.1, 24.2, 24.5)
    const schedulingFieldsChanged =
      input.dayOfWeek !== undefined ||
      input.startTime !== undefined ||
      input.duration !== undefined ||
      input.teacherId !== undefined ||
      input.roomId !== undefined;

    if (schedulingFieldsChanged) {
      const effectiveDayOfWeek = input.dayOfWeek ?? cls.dayOfWeek;
      const effectiveStartTime = input.startTime ?? cls.startTime;
      const effectiveDuration = input.duration ?? cls.duration;
      const effectiveTeacherId = input.teacherId ?? cls.teacherId;
      const effectiveRoomId = input.roomId !== undefined ? input.roomId : cls.roomId ?? undefined;

      const conflictResult = await this.checkSchedulingConflicts(
        {
          dayOfWeek: effectiveDayOfWeek,
          startTime: effectiveStartTime,
          duration: effectiveDuration,
          teacherId: effectiveTeacherId,
          roomId: effectiveRoomId,
        },
        classId,
      );
      if (!conflictResult.valid) {
        const messages = conflictResult.conflicts.map((c) => c.message).join('; ');
        throw new Error(`Scheduling conflict detected: ${messages}`);
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
   * Gets all active classes with optional filters (timetable).
   * Active = endDate IS NULL OR endDate > NOW
   * Requirements: 3.1, 3.2 - Display and filter timetable
   */
  async getTimetable(filters: TimetableFilters = {}) {
    const now = new Date();

    // Build base where clause for active classes
    const baseWhere: Record<string, unknown> = {
      OR: [{ endDate: null }, { endDate: { gt: now } }],
    };

    if (filters.level) baseWhere.level = filters.level;
    if (filters.style) baseWhere.style = filters.style;
    if (filters.locationId) baseWhere.locationId = filters.locationId;
    if (filters.teacherId) baseWhere.teacherId = filters.teacherId;
    if (filters.dayOfWeek) baseWhere.dayOfWeek = filters.dayOfWeek;

    // ageGroup filter: parse as number, include classes where ageRange is null
    // or ageRange.min <= ageGroup <= ageRange.max
    // Uses raw SQL for reliable JSON field comparison (Requirements: 3.2)
    if (filters.ageGroup !== undefined) {
      const age = parseInt(filters.ageGroup, 10);
      if (!isNaN(age)) {
        // Get IDs of classes matching the age filter using raw SQL
        const matchingIds = await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "class"
          WHERE (
            "ageRange" IS NULL
            OR (
              ("ageRange"->>'min' IS NULL OR ("ageRange"->>'min')::int <= ${age})
              AND
              ("ageRange"->>'max' IS NULL OR ("ageRange"->>'max')::int >= ${age})
            )
          )
        `;
        const ids = matchingIds.map((r) => r.id);
        baseWhere.id = { in: ids };
      }
    }

    return prisma.class.findMany({
      where: baseWhere,
      include: {
        teacher: true,
        location: true,
        pricingRule: true,
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  /**
   * Gets capacity info for a specific class.
   * Requirements: 3.3, 3.4 - Show remaining capacity
   */
  async getClassCapacity(classId: string) {
    const cls = await prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, capacity: true, enrolledCount: true },
    });

    if (!cls) {
      throw new Error('Class not found');
    }

    const waitlistCount = await prisma.waitlistEntry.count({ where: { classId } });

    return {
      classId: cls.id,
      capacity: cls.capacity,
      enrolled: cls.enrolledCount,
      available: Math.max(0, cls.capacity - cls.enrolledCount),
      isFull: cls.enrolledCount >= cls.capacity,
      waitlistCount,
    };
  }

  /**
   * Gets a summary of all classes for the admin UI.
   * Includes enrolment counts and computed status (active/full/ended).
   * Requirements: 8.1, 8.2, 8.3
   */
  async getAdminClassSummary() {
    const now = new Date();

    const classes = await prisma.class.findMany({
      include: {
        teacher: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    return classes.map((cls) => {
      let status: 'active' | 'full' | 'ended';
      if (cls.endDate && cls.endDate <= now) {
        status = 'ended';
      } else if (cls.enrolledCount >= cls.capacity) {
        status = 'full';
      } else {
        status = 'active';
      }

      return {
        id: cls.id,
        name: cls.name,
        style: cls.style,
        level: cls.level,
        dayOfWeek: cls.dayOfWeek,
        startTime: cls.startTime,
        locationName: cls.location.name,
        teacherName: cls.teacher.name,
        capacity: cls.capacity,
        enrolledCount: cls.enrolledCount,
        status,
      };
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
