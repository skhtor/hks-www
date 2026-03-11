import fc from 'fast-check';
import { ClassService } from '../../services/class.service';
import { TeacherService } from '../../services/teacher.service';
import { PrismaClient, DayOfWeek } from '@prisma/client';

const prisma = new PrismaClient();
const classService = new ClassService();
const teacherService = new TeacherService();

const PBT_DOMAIN = '@timetable-filter-pbt.test';

/**
 * Property-Based Tests for Timetable Filtering
 *
 * Property 8: Timetable Filter Correctness
 * For any filter criteria (age group, level, style, location, teacher, day),
 * all returned classes should match the filter, and all matching classes should be returned.
 * **Validates: Requirements 3.2**
 *
 * Property 46: Location Filtering
 * For any location filter, only classes at the selected location should be returned.
 * **Validates: Requirements 28.3**
 */
describe('Timetable Filter Property-Based Tests', () => {
  let teacherId: string;
  let locationId: string;
  let altLocationId: string;
  let altTeacherId: string;
  let pricingRuleId: string;

  // Slot counter to avoid teacher/room scheduling conflicts
  let slotCounter = 0;

  function nextSlot(): { dayOfWeek: DayOfWeek; startTime: string } {
    const days: DayOfWeek[] = [
      DayOfWeek.MONDAY,
      DayOfWeek.TUESDAY,
      DayOfWeek.WEDNESDAY,
      DayOfWeek.THURSDAY,
      DayOfWeek.FRIDAY,
      DayOfWeek.SATURDAY,
      DayOfWeek.SUNDAY,
    ];
    const idx = slotCounter++;
    const day = days[Math.floor(idx / 10) % days.length];
    const hour = 8 + (idx % 10);
    return { dayOfWeek: day, startTime: `${String(hour).padStart(2, '0')}:00` };
  }

  beforeAll(async () => {
    await cleanupTestData();

    const teacher = await teacherService.createTeacher({
      email: `pbt-timetable-teacher-${Date.now()}${PBT_DOMAIN}`,
      password: 'SecurePass123!',
      name: 'PBT-Timetable-Teacher',
    });
    teacherId = teacher.id;

    const altTeacher = await teacherService.createTeacher({
      email: `pbt-timetable-alt-teacher-${Date.now()}${PBT_DOMAIN}`,
      password: 'SecurePass123!',
      name: 'PBT-Timetable-AltTeacher',
    });
    altTeacherId = altTeacher.id;

    const location = await prisma.location.create({
      data: {
        name: `PBT-Timetable-Location-${Date.now()}`,
        address: { street: '1 Test St', suburb: 'Testville', state: 'VIC', postcode: '3000' },
      },
    });
    locationId = location.id;

    const altLocation = await prisma.location.create({
      data: {
        name: `PBT-Timetable-AltLocation-${Date.now()}`,
        address: { street: '2 Alt St', suburb: 'Altville', state: 'VIC', postcode: '3001' },
      },
    });
    altLocationId = altLocation.id;

    const pricingRule = await prisma.pricingRule.create({
      data: {
        name: `PBT-Timetable-PricingRule-${Date.now()}`,
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

  // ─────────────────────────────────────────────────────────────────────────────
  // Property 8: Timetable Filter Correctness
  // **Validates: Requirements 3.2**
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Property 8: Timetable Filter Correctness', () => {
    /**
     * Level filter: all returned classes have the filtered level,
     * and no class with that level is excluded.
     */
    it('level filter — all returned classes match AND no matching class is excluded', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('Beginner', 'Intermediate', 'Advanced'),
          async (targetLevel) => {
            // Create one class at the target level and one at a different level
            const slot1 = nextSlot();
            const slot2 = nextSlot();

            const matchingClass = await classService.createClass({
              name: `PBT-TF-Level-Match-${Date.now()}`,
              style: 'Ballet',
              level: targetLevel,
              dayOfWeek: slot1.dayOfWeek,
              startTime: slot1.startTime,
              duration: 45,
              locationId,
              teacherId,
              capacity: 10,
              pricingRuleId,
            });

            const otherLevel = targetLevel === 'Beginner' ? 'Advanced' : 'Beginner';
            const nonMatchingClass = await classService.createClass({
              name: `PBT-TF-Level-NoMatch-${Date.now()}`,
              style: 'Jazz',
              level: otherLevel,
              dayOfWeek: slot2.dayOfWeek,
              startTime: slot2.startTime,
              duration: 45,
              locationId,
              teacherId,
              capacity: 10,
              pricingRuleId,
            });

            const results = await classService.getTimetable({ level: targetLevel });
            const resultIds = results.map((c) => c.id);

            // All returned classes must have the target level
            for (const cls of results) {
              expect(cls.level).toBe(targetLevel);
            }

            // The matching class must be included
            expect(resultIds).toContain(matchingClass.id);

            // The non-matching class must NOT be included
            expect(resultIds).not.toContain(nonMatchingClass.id);
          }
        ),
        { numRuns: 10 }
      );
    });

    /**
     * Style filter: all returned classes have the filtered style,
     * and no class with that style is excluded.
     */
    it('style filter — all returned classes match AND no matching class is excluded', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('Ballet', 'Jazz', 'Hip Hop', 'Contemporary', 'Tap'),
          async (targetStyle) => {
            const slot1 = nextSlot();
            const slot2 = nextSlot();

            const matchingClass = await classService.createClass({
              name: `PBT-TF-Style-Match-${Date.now()}`,
              style: targetStyle,
              level: 'Beginner',
              dayOfWeek: slot1.dayOfWeek,
              startTime: slot1.startTime,
              duration: 45,
              locationId,
              teacherId,
              capacity: 10,
              pricingRuleId,
            });

            const otherStyle = targetStyle === 'Ballet' ? 'Tap' : 'Ballet';
            const nonMatchingClass = await classService.createClass({
              name: `PBT-TF-Style-NoMatch-${Date.now()}`,
              style: otherStyle,
              level: 'Intermediate',
              dayOfWeek: slot2.dayOfWeek,
              startTime: slot2.startTime,
              duration: 45,
              locationId,
              teacherId,
              capacity: 10,
              pricingRuleId,
            });

            const results = await classService.getTimetable({ style: targetStyle });
            const resultIds = results.map((c) => c.id);

            // All returned classes must have the target style
            for (const cls of results) {
              expect(cls.style).toBe(targetStyle);
            }

            // The matching class must be included
            expect(resultIds).toContain(matchingClass.id);

            // The non-matching class must NOT be included
            expect(resultIds).not.toContain(nonMatchingClass.id);
          }
        ),
        { numRuns: 10 }
      );
    });

    /**
     * dayOfWeek filter: all returned classes have the filtered day,
     * and no class on that day is excluded.
     */
    it('dayOfWeek filter — all returned classes match AND no matching class is excluded', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            DayOfWeek.MONDAY,
            DayOfWeek.TUESDAY,
            DayOfWeek.WEDNESDAY,
            DayOfWeek.THURSDAY,
            DayOfWeek.FRIDAY
          ),
          async (targetDay) => {
            const otherDay =
              targetDay === DayOfWeek.MONDAY ? DayOfWeek.FRIDAY : DayOfWeek.MONDAY;

            // Use a dedicated teacher per run to avoid scheduling conflicts
            const runTeacher = await teacherService.createTeacher({
              email: `pbt-tf-day-${Date.now()}-${Math.random()}${PBT_DOMAIN}`,
              password: 'SecurePass123!',
              name: `PBT-TF-Day-Teacher-${Date.now()}`,
            });

            const matchingClass = await classService.createClass({
              name: `PBT-TF-Day-Match-${Date.now()}`,
              style: 'Ballet',
              level: 'Beginner',
              dayOfWeek: targetDay,
              startTime: '09:00',
              duration: 45,
              locationId,
              teacherId: runTeacher.id,
              capacity: 10,
              pricingRuleId,
            });

            const nonMatchingClass = await classService.createClass({
              name: `PBT-TF-Day-NoMatch-${Date.now()}`,
              style: 'Jazz',
              level: 'Intermediate',
              dayOfWeek: otherDay,
              startTime: '10:00',
              duration: 45,
              locationId,
              teacherId: runTeacher.id,
              capacity: 10,
              pricingRuleId,
            });

            const results = await classService.getTimetable({ dayOfWeek: targetDay });
            const resultIds = results.map((c) => c.id);

            // All returned classes must have the target day
            for (const cls of results) {
              expect(cls.dayOfWeek).toBe(targetDay);
            }

            // The matching class must be included
            expect(resultIds).toContain(matchingClass.id);

            // The non-matching class must NOT be included
            expect(resultIds).not.toContain(nonMatchingClass.id);
          }
        ),
        { numRuns: 10 }
      );
    });

    /**
     * teacherId filter: all returned classes have the filtered teacher,
     * and no class with that teacher is excluded.
     */
    it('teacherId filter — all returned classes match AND no matching class is excluded', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null),
          async (_) => {
            // Create two dedicated teachers for this run
            const teacher1 = await teacherService.createTeacher({
              email: `pbt-tf-teacher1-${Date.now()}-${Math.random()}${PBT_DOMAIN}`,
              password: 'SecurePass123!',
              name: `PBT-TF-Teacher1-${Date.now()}`,
            });
            const teacher2 = await teacherService.createTeacher({
              email: `pbt-tf-teacher2-${Date.now()}-${Math.random()}${PBT_DOMAIN}`,
              password: 'SecurePass123!',
              name: `PBT-TF-Teacher2-${Date.now()}`,
            });

            const matchingClass = await classService.createClass({
              name: `PBT-TF-Teacher-Match-${Date.now()}`,
              style: 'Ballet',
              level: 'Beginner',
              dayOfWeek: DayOfWeek.MONDAY,
              startTime: '09:00',
              duration: 45,
              locationId,
              teacherId: teacher1.id,
              capacity: 10,
              pricingRuleId,
            });

            const nonMatchingClass = await classService.createClass({
              name: `PBT-TF-Teacher-NoMatch-${Date.now()}`,
              style: 'Jazz',
              level: 'Intermediate',
              dayOfWeek: DayOfWeek.TUESDAY,
              startTime: '10:00',
              duration: 45,
              locationId,
              teacherId: teacher2.id,
              capacity: 10,
              pricingRuleId,
            });

            const results = await classService.getTimetable({ teacherId: teacher1.id });
            const resultIds = results.map((c) => c.id);

            // All returned classes must have the target teacher
            for (const cls of results) {
              expect(cls.teacherId).toBe(teacher1.id);
            }

            // The matching class must be included
            expect(resultIds).toContain(matchingClass.id);

            // The non-matching class must NOT be included
            expect(resultIds).not.toContain(nonMatchingClass.id);
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Property 46: Location Filtering
  // **Validates: Requirements 28.3**
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Property 46: Location Filtering', () => {
    /**
     * For any locationId filter, only classes at the selected location are returned,
     * and no class at that location is excluded.
     */
    it('locationId filter — only classes at the selected location are returned AND none are excluded', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(), // true = filter by locationId, false = filter by altLocationId
          async (useMainLocation) => {
            const targetLocationId = useMainLocation ? locationId : altLocationId;
            const otherLocationId = useMainLocation ? altLocationId : locationId;

            // Use a dedicated teacher per run to avoid scheduling conflicts
            const runTeacher = await teacherService.createTeacher({
              email: `pbt-tf-loc-${Date.now()}-${Math.random()}${PBT_DOMAIN}`,
              password: 'SecurePass123!',
              name: `PBT-TF-Loc-Teacher-${Date.now()}`,
            });

            const matchingClass = await classService.createClass({
              name: `PBT-TF-Loc-Match-${Date.now()}`,
              style: 'Ballet',
              level: 'Beginner',
              dayOfWeek: DayOfWeek.MONDAY,
              startTime: '09:00',
              duration: 45,
              locationId: targetLocationId,
              teacherId: runTeacher.id,
              capacity: 10,
              pricingRuleId,
            });

            const nonMatchingClass = await classService.createClass({
              name: `PBT-TF-Loc-NoMatch-${Date.now()}`,
              style: 'Jazz',
              level: 'Intermediate',
              dayOfWeek: DayOfWeek.TUESDAY,
              startTime: '10:00',
              duration: 45,
              locationId: otherLocationId,
              teacherId: runTeacher.id,
              capacity: 10,
              pricingRuleId,
            });

            const results = await classService.getTimetable({ locationId: targetLocationId });
            const resultIds = results.map((c) => c.id);

            // All returned classes must be at the target location
            for (const cls of results) {
              expect(cls.locationId).toBe(targetLocationId);
            }

            // The matching class must be included
            expect(resultIds).toContain(matchingClass.id);

            // The non-matching class must NOT be included
            expect(resultIds).not.toContain(nonMatchingClass.id);
          }
        ),
        { numRuns: 10 }
      );
    });

    /**
     * For any locationId filter, the result set is exactly the set of active classes
     * at that location — no more, no less.
     */
    it('locationId filter — result set is exactly the set of active classes at that location', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 3 }), // number of classes to create at target location
          async (classCount) => {
            // Use a dedicated teacher per run to avoid scheduling conflicts
            const runTeacher = await teacherService.createTeacher({
              email: `pbt-tf-loc-exact-${Date.now()}-${Math.random()}${PBT_DOMAIN}`,
              password: 'SecurePass123!',
              name: `PBT-TF-Loc-Exact-Teacher-${Date.now()}`,
            });

            // Create a fresh isolated location for this run
            const isolatedLocation = await prisma.location.create({
              data: {
                name: `PBT-TF-Isolated-Location-${Date.now()}-${Math.random()}`,
                address: { street: '99 Isolated St', suburb: 'Isolateville', state: 'VIC', postcode: '3999' },
              },
            });

            const createdIds: string[] = [];
            const days = [
              DayOfWeek.MONDAY,
              DayOfWeek.TUESDAY,
              DayOfWeek.WEDNESDAY,
            ];

            for (let i = 0; i < classCount; i++) {
              const cls = await classService.createClass({
                name: `PBT-TF-Loc-Exact-${Date.now()}-${i}`,
                style: 'Ballet',
                level: 'Beginner',
                dayOfWeek: days[i % days.length],
                startTime: `${String(9 + i).padStart(2, '0')}:00`,
                duration: 45,
                locationId: isolatedLocation.id,
                teacherId: runTeacher.id,
                capacity: 10,
                pricingRuleId,
              });
              createdIds.push(cls.id);
            }

            const results = await classService.getTimetable({ locationId: isolatedLocation.id });
            const resultIds = results.map((c) => c.id).sort();
            const expectedIds = [...createdIds].sort();

            // Exact match: every created class is returned and nothing extra
            expect(resultIds).toEqual(expectedIds);

            // All returned classes are at the isolated location
            for (const cls of results) {
              expect(cls.locationId).toBe(isolatedLocation.id);
            }

            // Cleanup isolated location
            await prisma.class.deleteMany({ where: { locationId: isolatedLocation.id } });
            await prisma.location.delete({ where: { id: isolatedLocation.id } });
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function cleanupTestData() {
  await prisma.enrolment.deleteMany({
    where: { class: { name: { contains: 'PBT-TF-' } } },
  });
  await prisma.class.deleteMany({ where: { name: { contains: 'PBT-TF-' } } });
  await prisma.teacher.deleteMany({
    where: { user: { email: { contains: PBT_DOMAIN } } },
  });
  await prisma.userAccount.deleteMany({
    where: { email: { contains: PBT_DOMAIN } },
  });
  await prisma.location.deleteMany({ where: { name: { contains: 'PBT-Timetable-' } } });
  await prisma.pricingRule.deleteMany({ where: { name: { contains: 'PBT-Timetable-PricingRule' } } });
}
