import fc from 'fast-check';
import { ClassService } from '../../services/class.service';
import { TeacherService } from '../../services/teacher.service';
import { PrismaClient, DayOfWeek } from '@prisma/client';

const prisma = new PrismaClient();
const classService = new ClassService();
const teacherService = new TeacherService();

const PBT_DOMAIN = '@class-pbt.test';

describe('ClassService Property-Based Tests', () => {
  let teacherId: string;
  let locationId: string;
  let pricingRuleId: string;

  beforeAll(async () => {
    await cleanupTestData();

    // Create shared teacher
    const teacher = await teacherService.createTeacher({
      email: `pbt-teacher-${Date.now()}${PBT_DOMAIN}`,
      password: 'SecurePass123!',
      name: 'PBT-Test-Teacher',
    });
    teacherId = teacher.id;

    // Create shared location
    const location = await prisma.location.create({
      data: {
        name: `PBT-Test-Location-${Date.now()}`,
        address: { street: '1 Test St', suburb: 'Testville', state: 'VIC', postcode: '3000' },
      },
    });
    locationId = location.id;

    // Create shared pricing rule
    const pricingRule = await prisma.pricingRule.create({
      data: {
        name: `PBT-Test-PricingRule-${Date.now()}`,
        type: 'PER_CLASS',
        classCountMin: 1,
        monthlyFee: 80,
        priority: 1,
      },
    });
    pricingRuleId = pricingRule.id;
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  /**
   * Property 8: Timetable Filter Correctness / Class Display Completeness
   * Feature: dance-school-management-platform
   * For any class displayed in the timetable, the display should contain
   * time, duration, teacher name, remaining capacity, and price basis.
   * **Validates: Requirements 3.3, 8.3**
   */
  describe('Property 8: Class Display Completeness', () => {
    it('should include all required display fields for every class in the timetable', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random class parameters
          fc.record({
            name: fc.string({ minLength: 3, maxLength: 30 }).map((s) => `PBT-Test-${s}`),
            style: fc.constantFrom('Ballet', 'Jazz', 'Hip Hop', 'Contemporary', 'Tap'),
            level: fc.constantFrom('Beginner', 'Intermediate', 'Advanced'),
            dayOfWeek: fc.constantFrom(
              DayOfWeek.MONDAY,
              DayOfWeek.TUESDAY,
              DayOfWeek.WEDNESDAY,
              DayOfWeek.THURSDAY,
              DayOfWeek.FRIDAY,
              DayOfWeek.SATURDAY
            ),
            startTime: fc.constantFrom('09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'),
            duration: fc.integer({ min: 30, max: 120 }),
            capacity: fc.integer({ min: 5, max: 30 }),
          }),
          async ({ name, style, level, dayOfWeek, startTime, duration, capacity }) => {
            // Create a dedicated teacher per run to avoid scheduling conflicts
            const runTeacher = await teacherService.createTeacher({
              email: `pbt-run-teacher-${Date.now()}-${Math.random()}${PBT_DOMAIN}`,
              password: 'SecurePass123!',
              name: `PBT-Run-Teacher-${Date.now()}`,
            });

            // Create a class with the generated parameters
            const created = await classService.createClass({
              name,
              style,
              level,
              dayOfWeek,
              startTime,
              duration,
              locationId,
              teacherId: runTeacher.id,
              capacity,
              pricingRuleId,
            });

            // Retrieve the class via timetable (the display path)
            const timetable = await classService.getTimetable();
            const displayed = timetable.find((c) => c.id === created.id);

            expect(displayed).toBeDefined();

            // Verify all required display fields are present (Req 3.3)
            // 1. Time (startTime)
            expect(displayed!.startTime).toBeDefined();
            expect(typeof displayed!.startTime).toBe('string');
            expect(displayed!.startTime).toBe(startTime);

            // 2. Duration
            expect(displayed!.duration).toBeDefined();
            expect(typeof displayed!.duration).toBe('number');
            expect(displayed!.duration).toBe(duration);

            // 3. Teacher name (via teacher relation)
            expect(displayed!.teacher).toBeDefined();
            expect(displayed!.teacher.name).toBeDefined();
            expect(typeof displayed!.teacher.name).toBe('string');
            expect(displayed!.teacher.name.length).toBeGreaterThan(0);

            // 4. Remaining capacity (capacity and enrolledCount to compute remaining)
            expect(displayed!.capacity).toBeDefined();
            expect(typeof displayed!.capacity).toBe('number');
            expect(displayed!.enrolledCount).toBeDefined();
            expect(typeof displayed!.enrolledCount).toBe('number');
            // remaining = capacity - enrolledCount
            const remaining = displayed!.capacity - displayed!.enrolledCount;
            expect(remaining).toBeGreaterThanOrEqual(0);
            expect(remaining).toBeLessThanOrEqual(displayed!.capacity);

            // 5. Price basis (via pricingRule relation)
            // monthlyFee is a Prisma Decimal, so we convert to number for assertion
            expect(displayed!.pricingRule).toBeDefined();
            expect(displayed!.pricingRule.monthlyFee).toBeDefined();
            const monthlyFee = Number(displayed!.pricingRule.monthlyFee);
            expect(isNaN(monthlyFee)).toBe(false);
            expect(monthlyFee).toBeGreaterThan(0);
          }
        ),
        { numRuns: 15 }
      );
    });

    it('should include all required display fields when fetching a class by ID', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            name: fc.string({ minLength: 3, maxLength: 30 }).map((s) => `PBT-Test-${s}`),
            style: fc.constantFrom('Ballet', 'Jazz', 'Hip Hop', 'Contemporary', 'Tap'),
            level: fc.constantFrom('Beginner', 'Intermediate', 'Advanced'),
            dayOfWeek: fc.constantFrom(
              DayOfWeek.MONDAY,
              DayOfWeek.TUESDAY,
              DayOfWeek.WEDNESDAY,
              DayOfWeek.THURSDAY,
              DayOfWeek.FRIDAY
            ),
            startTime: fc.constantFrom('09:00', '10:00', '11:00', '14:00', '15:00'),
            duration: fc.integer({ min: 30, max: 120 }),
            capacity: fc.integer({ min: 5, max: 30 }),
          }),
          async ({ name, style, level, dayOfWeek, startTime, duration, capacity }) => {
            // Create a dedicated teacher per run to avoid scheduling conflicts
            const runTeacher = await teacherService.createTeacher({
              email: `pbt-run-teacher2-${Date.now()}-${Math.random()}${PBT_DOMAIN}`,
              password: 'SecurePass123!',
              name: `PBT-Run-Teacher2-${Date.now()}`,
            });

            const created = await classService.createClass({
              name,
              style,
              level,
              dayOfWeek,
              startTime,
              duration,
              locationId,
              teacherId: runTeacher.id,
              capacity,
              pricingRuleId,
            });

            // Fetch by ID (the direct display path)
            const displayed = await classService.getClassById(created.id);

            // startTime must be present
            expect(displayed.startTime).toBe(startTime);

            // duration must be present
            expect(displayed.duration).toBe(duration);

            // teacher name must be present
            expect(displayed.teacher).toBeDefined();
            expect(displayed.teacher.name).toBeTruthy();

            // capacity and enrolledCount for remaining capacity
            expect(displayed.capacity).toBe(capacity);
            expect(displayed.enrolledCount).toBeGreaterThanOrEqual(0);

            // pricingRule for price basis
            // monthlyFee is a Prisma Decimal, convert to number for assertion
            expect(displayed.pricingRule).toBeDefined();
            const monthlyFee = Number(displayed.pricingRule.monthlyFee);
            expect(isNaN(monthlyFee)).toBe(false);
            expect(monthlyFee).toBeGreaterThan(0);
          }
        ),
        { numRuns: 15 }
      );
    });
  });

  /**
   * Property 9: Class Update Round-Trip Persistence
   * Feature: dance-school-management-platform
   * For any class update, immediately reading back the class should return
   * the updated values (round-trip property).
   * **Validates: Requirements 3.3, 8.3**
   */
  describe('Property 9: Class Update Round-Trip Persistence', () => {
    it('should immediately reflect class updates in the timetable (round-trip)', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate update values
          fc.record({
            name: fc.string({ minLength: 3, maxLength: 30 }).map((s) => `PBT-Updated-${s}`),
            level: fc.constantFrom('Beginner', 'Intermediate', 'Advanced'),
            duration: fc.integer({ min: 30, max: 120 }),
            capacity: fc.integer({ min: 5, max: 30 }),
            startTime: fc.constantFrom('09:00', '10:00', '11:00', '14:00', '15:00', '16:00'),
          }),
          async ({ name, level, duration, capacity, startTime }) => {
            // Create a dedicated teacher per run to avoid scheduling conflicts
            const runTeacher = await teacherService.createTeacher({
              email: `pbt-update-teacher-${Date.now()}-${Math.random()}${PBT_DOMAIN}`,
              password: 'SecurePass123!',
              name: `PBT-Update-Teacher-${Date.now()}`,
            });

            // Create a base class
            const created = await classService.createClass({
              name: `PBT-Test-Base-${Date.now()}`,
              style: 'Ballet',
              level: 'Beginner',
              dayOfWeek: DayOfWeek.MONDAY,
              startTime: '09:00',
              duration: 60,
              locationId,
              teacherId: runTeacher.id,
              capacity: 15,
              pricingRuleId,
            });

            // Apply the update
            const updated = await classService.updateClass(created.id, {
              name,
              level,
              duration,
              capacity,
              startTime,
            });

            // Verify the returned value reflects the update immediately
            expect(updated.name).toBe(name);
            expect(updated.level).toBe(level);
            expect(updated.duration).toBe(duration);
            expect(updated.capacity).toBe(capacity);
            expect(updated.startTime).toBe(startTime);

            // Read back via getClassById and verify persistence
            const fetchedById = await classService.getClassById(created.id);
            expect(fetchedById.name).toBe(name);
            expect(fetchedById.level).toBe(level);
            expect(fetchedById.duration).toBe(duration);
            expect(fetchedById.capacity).toBe(capacity);
            expect(fetchedById.startTime).toBe(startTime);

            // Read back via timetable and verify persistence
            const timetable = await classService.getTimetable();
            const fromTimetable = timetable.find((c) => c.id === created.id);
            expect(fromTimetable).toBeDefined();
            expect(fromTimetable!.name).toBe(name);
            expect(fromTimetable!.level).toBe(level);
            expect(fromTimetable!.duration).toBe(duration);
            expect(fromTimetable!.capacity).toBe(capacity);
            expect(fromTimetable!.startTime).toBe(startTime);
          }
        ),
        { numRuns: 15 }
      );
    });

    it('should preserve unchanged fields after a partial update (round-trip)', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a new name to update
          fc.string({ minLength: 3, maxLength: 30 }).map((s) => `PBT-Partial-${s}`),
          async (newName) => {
            const originalStyle = 'Contemporary';
            const originalDuration = 45;

            // Create a dedicated teacher per run to avoid scheduling conflicts
            const runTeacher = await teacherService.createTeacher({
              email: `pbt-partial-teacher-${Date.now()}-${Math.random()}${PBT_DOMAIN}`,
              password: 'SecurePass123!',
              name: `PBT-Partial-Teacher-${Date.now()}`,
            });

            // Create a class with known values
            const created = await classService.createClass({
              name: `PBT-Test-Preserve-${Date.now()}`,
              style: originalStyle,
              level: 'Intermediate',
              dayOfWeek: DayOfWeek.WEDNESDAY,
              startTime: '10:00',
              duration: originalDuration,
              locationId,
              teacherId: runTeacher.id,
              capacity: 12,
              pricingRuleId,
            });

            // Update only the name
            await classService.updateClass(created.id, { name: newName });

            // Read back and verify: updated field changed, others preserved
            const fetched = await classService.getClassById(created.id);
            expect(fetched.name).toBe(newName);
            expect(fetched.style).toBe(originalStyle);
            expect(fetched.duration).toBe(originalDuration);
          }
        ),
        { numRuns: 15 }
      );
    });

    it('should reflect teacher reassignment immediately in timetable display', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null),
          async (_) => {
            // Create a second teacher for reassignment
            const newTeacher = await teacherService.createTeacher({
              email: `pbt-teacher2-${Date.now()}-${Math.random()}${PBT_DOMAIN}`,
              password: 'SecurePass123!',
              name: `PBT-Test-Teacher2-${Date.now()}`,
            });

            // Create a class assigned to the original teacher
            const created = await classService.createClass({
              name: `PBT-Test-Reassign-${Date.now()}`,
              style: 'Jazz',
              level: 'Beginner',
              dayOfWeek: DayOfWeek.TUESDAY,
              startTime: '11:00',
              duration: 60,
              locationId,
              teacherId,
              capacity: 10,
              pricingRuleId,
            });

            expect(created.teacherId).toBe(teacherId);

            // Reassign to new teacher
            const updated = await classService.updateClass(created.id, {
              teacherId: newTeacher.id,
            });

            expect(updated.teacherId).toBe(newTeacher.id);
            expect(updated.teacher.id).toBe(newTeacher.id);
            expect(updated.teacher.name).toBe(newTeacher.name);

            // Verify the timetable immediately reflects the new teacher
            const timetable = await classService.getTimetable();
            const fromTimetable = timetable.find((c) => c.id === created.id);
            expect(fromTimetable).toBeDefined();
            expect(fromTimetable!.teacherId).toBe(newTeacher.id);
            expect(fromTimetable!.teacher.name).toBe(newTeacher.name);
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  /**
   * Property 41: Room Scheduling Conflicts
   * Feature: dance-school-management-platform
   * For any time slot and room, at most one class should be scheduled in that room at that time.
   * **Validates: Requirements 24.1**
   */
  describe('Property 41: Room Scheduling Conflicts', () => {
    // roomId is a plain string identifier (no separate Room model in schema)
    const roomId = `pbt-test-room-${Date.now()}`;

    afterAll(async () => {
      await prisma.class.deleteMany({ where: { roomId } });
    });

    it('should reject a second class in the same room when time ranges overlap', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            dayOfWeek: fc.constantFrom(
              DayOfWeek.MONDAY,
              DayOfWeek.TUESDAY,
              DayOfWeek.WEDNESDAY,
              DayOfWeek.THURSDAY,
              DayOfWeek.FRIDAY,
            ),
            // First class starts at one of these times
            firstStartHour: fc.integer({ min: 9, max: 15 }),
            firstDuration: fc.integer({ min: 45, max: 90 }),
            // Overlap offset: second class starts within the first class's duration
            overlapOffsetMinutes: fc.integer({ min: 0, max: 44 }),
          }),
          async ({ dayOfWeek, firstStartHour, firstDuration, overlapOffsetMinutes }) => {
            const firstStartTime = `${String(firstStartHour).padStart(2, '0')}:00`;
            const secondStartMinutes = firstStartHour * 60 + overlapOffsetMinutes;
            const secondStartTime = `${String(Math.floor(secondStartMinutes / 60)).padStart(2, '0')}:${String(secondStartMinutes % 60).padStart(2, '0')}`;

            // Create a second teacher so teacher conflicts don't interfere
            const teacher2 = await teacherService.createTeacher({
              email: `pbt-room-teacher2-${Date.now()}-${Math.random()}${PBT_DOMAIN}`,
              password: 'SecurePass123!',
              name: `PBT-Room-Teacher2-${Date.now()}`,
            });

            // Create the first class in the room
            const firstClass = await classService.createClass({
              name: `PBT-Test-Room-First-${Date.now()}`,
              style: 'Ballet',
              level: 'Beginner',
              dayOfWeek,
              startTime: firstStartTime,
              duration: firstDuration,
              locationId,
              teacherId,
              capacity: 10,
              pricingRuleId,
              roomId,
            });

            // Attempt to create a second class in the same room with overlapping time
            await expect(
              classService.createClass({
                name: `PBT-Test-Room-Second-${Date.now()}`,
                style: 'Jazz',
                level: 'Intermediate',
                dayOfWeek,
                startTime: secondStartTime,
                duration: 60,
                locationId,
                teacherId: teacher2.id,
                capacity: 10,
                pricingRuleId,
                roomId,
              })
            ).rejects.toThrow(/scheduling conflict/i);

            // Clean up
            await prisma.class.delete({ where: { id: firstClass.id } });
          }
        ),
        { numRuns: 15 }
      );
    });

    it('should allow two classes in the same room when time ranges do not overlap', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            dayOfWeek: fc.constantFrom(
              DayOfWeek.MONDAY,
              DayOfWeek.TUESDAY,
              DayOfWeek.WEDNESDAY,
              DayOfWeek.THURSDAY,
              DayOfWeek.FRIDAY,
            ),
            firstStartHour: fc.integer({ min: 9, max: 11 }),
            firstDuration: fc.integer({ min: 30, max: 60 }),
          }),
          async ({ dayOfWeek, firstStartHour, firstDuration }) => {
            const firstStartTime = `${String(firstStartHour).padStart(2, '0')}:00`;
            // Second class starts after the first one ends (no overlap)
            const secondStartHour = firstStartHour + Math.ceil(firstDuration / 60) + 1;
            const secondStartTime = `${String(secondStartHour).padStart(2, '0')}:00`;

            // Create a second teacher so teacher conflicts don't interfere
            const teacher2 = await teacherService.createTeacher({
              email: `pbt-room-noconflict-${Date.now()}-${Math.random()}${PBT_DOMAIN}`,
              password: 'SecurePass123!',
              name: `PBT-Room-NoConflict-${Date.now()}`,
            });

            // Create the first class
            const firstClass = await classService.createClass({
              name: `PBT-Test-Room-NoConflict-First-${Date.now()}`,
              style: 'Ballet',
              level: 'Beginner',
              dayOfWeek,
              startTime: firstStartTime,
              duration: firstDuration,
              locationId,
              teacherId,
              capacity: 10,
              pricingRuleId,
              roomId,
            });

            // Second class should be created successfully (no overlap)
            const secondClass = await classService.createClass({
              name: `PBT-Test-Room-NoConflict-Second-${Date.now()}`,
              style: 'Jazz',
              level: 'Intermediate',
              dayOfWeek,
              startTime: secondStartTime,
              duration: 60,
              locationId,
              teacherId: teacher2.id,
              capacity: 10,
              pricingRuleId,
              roomId,
            });

            expect(secondClass.id).toBeDefined();
            expect(secondClass.roomId).toBe(roomId);

            // Clean up
            await prisma.class.delete({ where: { id: firstClass.id } });
            await prisma.class.delete({ where: { id: secondClass.id } });
          }
        ),
        { numRuns: 15 }
      );
    });
  });

  /**
   * Property 42: Teacher Scheduling Conflicts
   * Feature: dance-school-management-platform
   * For any time slot, a teacher should be assigned to at most one class at that time.
   * **Validates: Requirements 24.2**
   */
  describe('Property 42: Teacher Scheduling Conflicts', () => {
    it('should reject a second class for the same teacher when time ranges overlap', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            dayOfWeek: fc.constantFrom(
              DayOfWeek.MONDAY,
              DayOfWeek.TUESDAY,
              DayOfWeek.WEDNESDAY,
              DayOfWeek.THURSDAY,
              DayOfWeek.FRIDAY,
            ),
            firstStartHour: fc.integer({ min: 9, max: 15 }),
            firstDuration: fc.integer({ min: 45, max: 90 }),
            overlapOffsetMinutes: fc.integer({ min: 0, max: 44 }),
          }),
          async ({ dayOfWeek, firstStartHour, firstDuration, overlapOffsetMinutes }) => {
            // Create a dedicated teacher for this test run
            const dedicatedTeacher = await teacherService.createTeacher({
              email: `pbt-teacher-conflict-${Date.now()}-${Math.random()}${PBT_DOMAIN}`,
              password: 'SecurePass123!',
              name: `PBT-Teacher-Conflict-${Date.now()}`,
            });

            const firstStartTime = `${String(firstStartHour).padStart(2, '0')}:00`;
            const secondStartMinutes = firstStartHour * 60 + overlapOffsetMinutes;
            const secondStartTime = `${String(Math.floor(secondStartMinutes / 60)).padStart(2, '0')}:${String(secondStartMinutes % 60).padStart(2, '0')}`;

            // Create the first class for this teacher
            const firstClass = await classService.createClass({
              name: `PBT-Test-Teacher-First-${Date.now()}`,
              style: 'Ballet',
              level: 'Beginner',
              dayOfWeek,
              startTime: firstStartTime,
              duration: firstDuration,
              locationId,
              teacherId: dedicatedTeacher.id,
              capacity: 10,
              pricingRuleId,
            });

            // Attempt to create a second class for the same teacher with overlapping time
            await expect(
              classService.createClass({
                name: `PBT-Test-Teacher-Second-${Date.now()}`,
                style: 'Jazz',
                level: 'Intermediate',
                dayOfWeek,
                startTime: secondStartTime,
                duration: 60,
                locationId,
                teacherId: dedicatedTeacher.id,
                capacity: 10,
                pricingRuleId,
              })
            ).rejects.toThrow(/scheduling conflict/i);

            // Clean up
            await prisma.class.delete({ where: { id: firstClass.id } });
          }
        ),
        { numRuns: 15 }
      );
    });

    it('should allow the same teacher to teach two classes when time ranges do not overlap', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            dayOfWeek: fc.constantFrom(
              DayOfWeek.MONDAY,
              DayOfWeek.TUESDAY,
              DayOfWeek.WEDNESDAY,
              DayOfWeek.THURSDAY,
              DayOfWeek.FRIDAY,
            ),
            firstStartHour: fc.integer({ min: 9, max: 11 }),
            firstDuration: fc.integer({ min: 30, max: 60 }),
          }),
          async ({ dayOfWeek, firstStartHour, firstDuration }) => {
            // Create a dedicated teacher for this test run
            const dedicatedTeacher = await teacherService.createTeacher({
              email: `pbt-teacher-noconflict-${Date.now()}-${Math.random()}${PBT_DOMAIN}`,
              password: 'SecurePass123!',
              name: `PBT-Teacher-NoConflict-${Date.now()}`,
            });

            const firstStartTime = `${String(firstStartHour).padStart(2, '0')}:00`;
            // Second class starts after the first one ends (no overlap)
            const secondStartHour = firstStartHour + Math.ceil(firstDuration / 60) + 1;
            const secondStartTime = `${String(secondStartHour).padStart(2, '0')}:00`;

            // Create the first class
            const firstClass = await classService.createClass({
              name: `PBT-Test-Teacher-NoConflict-First-${Date.now()}`,
              style: 'Ballet',
              level: 'Beginner',
              dayOfWeek,
              startTime: firstStartTime,
              duration: firstDuration,
              locationId,
              teacherId: dedicatedTeacher.id,
              capacity: 10,
              pricingRuleId,
            });

            // Second class should be created successfully (no overlap)
            const secondClass = await classService.createClass({
              name: `PBT-Test-Teacher-NoConflict-Second-${Date.now()}`,
              style: 'Jazz',
              level: 'Intermediate',
              dayOfWeek,
              startTime: secondStartTime,
              duration: 60,
              locationId,
              teacherId: dedicatedTeacher.id,
              capacity: 10,
              pricingRuleId,
            });

            expect(secondClass.id).toBeDefined();
            expect(secondClass.teacherId).toBe(dedicatedTeacher.id);

            // Clean up
            await prisma.class.delete({ where: { id: firstClass.id } });
            await prisma.class.delete({ where: { id: secondClass.id } });
          }
        ),
        { numRuns: 15 }
      );
    });
  });
});

// Helper functions

async function cleanupTestData() {
  await prisma.enrolment.deleteMany({
    where: { class: { name: { contains: 'PBT-Test' } } },
  });
  await prisma.class.deleteMany({
    where: { name: { contains: 'PBT-Test' } },
  });
  await prisma.class.deleteMany({
    where: { name: { contains: 'PBT-Updated' } },
  });
  await prisma.class.deleteMany({
    where: { name: { contains: 'PBT-Partial' } },
  });
  await prisma.teacher.deleteMany({
    where: { user: { email: { contains: PBT_DOMAIN } } },
  });
  await prisma.userAccount.deleteMany({
    where: { email: { contains: PBT_DOMAIN } },
  });
  await prisma.location.deleteMany({
    where: { name: { contains: 'PBT-Test-Location' } },
  });
  await prisma.pricingRule.deleteMany({
    where: { name: { contains: 'PBT-Test-PricingRule' } },
  });
}
