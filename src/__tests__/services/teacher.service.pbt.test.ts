import fc from 'fast-check';
import { PrismaClient, AttendanceStatus } from '@prisma/client';
import { TeacherService } from '../../services/teacher.service';

const prisma = new PrismaClient();
const teacherService = new TeacherService();

const PBT_DOMAIN = '@teacher-attendance-pbt.test';

// All valid AttendanceStatus values
const ALL_STATUSES: AttendanceStatus[] = [
  AttendanceStatus.PRESENT,
  AttendanceStatus.ABSENT,
  AttendanceStatus.LATE,
  AttendanceStatus.EXCUSED,
];

describe('TeacherService Attendance Property-Based Tests', () => {
  let locationId: string;
  let pricingRuleId: string;
  let householdId: string;
  let teacherId: string;
  let teacherUserId: string;
  let classId: string;

  beforeAll(async () => {
    // Clean up any leftover PBT data
    await prisma.attendanceRecord.deleteMany({
      where: { class: { name: { contains: 'PBT-Attendance' } } },
    });
    await prisma.enrolment.deleteMany({
      where: { class: { name: { contains: 'PBT-Attendance' } } },
    });
    await prisma.class.deleteMany({ where: { name: { contains: 'PBT-Attendance' } } });
    await prisma.dancer.deleteMany({ where: { household: { name: { contains: 'PBT-Attendance' } } } });
    await prisma.household.deleteMany({ where: { name: { contains: 'PBT-Attendance' } } });
    await prisma.teacher.deleteMany({ where: { user: { email: { contains: PBT_DOMAIN } } } });
    await prisma.userAccount.deleteMany({ where: { email: { contains: PBT_DOMAIN } } });
    await prisma.location.deleteMany({ where: { name: { contains: 'PBT-Attendance' } } });
    await prisma.pricingRule.deleteMany({ where: { name: { contains: 'PBT-Attendance' } } });

    // Create shared fixtures
    const location = await prisma.location.create({
      data: {
        name: `PBT-Attendance-Location-${Date.now()}`,
        address: { street: '1 Test St', suburb: 'Testville', state: 'VIC', postcode: '3000' },
      },
    });
    locationId = location.id;

    const pricingRule = await prisma.pricingRule.create({
      data: {
        name: `PBT-Attendance-Rule-${Date.now()}`,
        type: 'PER_CLASS',
        classCountMin: 1,
        monthlyFee: 80,
        priority: 1,
      },
    });
    pricingRuleId = pricingRule.id;

    const household = await prisma.household.create({
      data: { name: `PBT-Attendance-Household-${Date.now()}` },
    });
    householdId = household.id;

    // Create a teacher for the tests
    const teacher = await teacherService.createTeacher({
      email: `pbt-attendance-teacher-${Date.now()}${PBT_DOMAIN}`,
      password: 'SecurePass123!',
      name: 'PBT-Attendance-Teacher',
    });
    teacherId = teacher.id;
    teacherUserId = teacher.userId;

    // Create a class assigned to the teacher
    const cls = await prisma.class.create({
      data: {
        name: `PBT-Attendance-Class-${Date.now()}`,
        style: 'Ballet',
        level: 'Beginner',
        dayOfWeek: 'MONDAY',
        startTime: '09:00',
        duration: 60,
        locationId,
        teacherId,
        capacity: 20,
        enrolledCount: 0,
        pricingRuleId,
      },
    });
    classId = cls.id;
  });

  afterAll(async () => {
    await prisma.attendanceRecord.deleteMany({
      where: { classId },
    });
    await prisma.enrolment.deleteMany({ where: { classId } });
    await prisma.class.deleteMany({ where: { id: classId } });
    await prisma.dancer.deleteMany({ where: { householdId } });
    await prisma.household.deleteMany({ where: { id: householdId } });
    await prisma.teacher.deleteMany({ where: { id: teacherId } });
    await prisma.userAccount.deleteMany({ where: { id: teacherUserId } });
    await prisma.location.deleteMany({ where: { id: locationId } });
    await prisma.pricingRule.deleteMany({ where: { id: pricingRuleId } });
    await prisma.$disconnect();
  });

  /** Helper: create a dancer with an active enrolment in the shared class */
  async function createEnrolledDancer() {
    const dancer = await prisma.dancer.create({
      data: {
        householdId,
        firstName: `PBT${Date.now()}`,
        lastName: `Dancer${Math.floor(Math.random() * 100000)}`,
        dateOfBirth: new Date('2015-01-01'),
        emergencyContact: { name: 'Parent', phone: '0400000000', relationship: 'Parent' },
      },
    });

    await prisma.enrolment.create({
      data: {
        dancerId: dancer.id,
        classId,
        status: 'ACTIVE',
        startDate: new Date('2025-01-01'),
      },
    });

    // Update enrolledCount
    await prisma.class.update({
      where: { id: classId },
      data: { enrolledCount: { increment: 1 } },
    });

    return dancer;
  }

  /**
   * Property 33: Attendance Record Persistence
   *
   * For any valid set of attendance records marked for a class:
   * - The persisted records match exactly what was submitted (status and notes are preserved)
   * - Marking attendance twice for the same dancer/class/date updates (upserts) rather than creating duplicates
   * - All valid AttendanceStatus values (PRESENT, ABSENT, LATE, EXCUSED) can be persisted and retrieved
   *
   * **Validates: Requirements 17.2**
   */
  describe('Property 33: Attendance Record Persistence', () => {
    it('should persist attendance status and notes exactly as submitted for any valid status', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a random AttendanceStatus from the enum
          fc.constantFrom(...ALL_STATUSES),
          // Generate an optional notes string (null or a short string)
          fc.option(fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0), {
            nil: undefined,
          }),
          async (status, notes) => {
            const dancer = await createEnrolledDancer();
            const classDate = `2025-06-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`;

            const results = await teacherService.markAttendance(teacherUserId, classId, classDate, [
              { dancerId: dancer.id, status, notes },
            ]);

            expect(results).toHaveLength(1);
            expect(results[0].status).toBe(status);
            expect(results[0].notes).toBe(notes ?? null);
            expect(results[0].dancerId).toBe(dancer.id);
            expect(results[0].classId).toBe(classId);

            // Verify persistence by reading back from DB
            const persisted = await prisma.attendanceRecord.findFirst({
              where: { dancerId: dancer.id, classId },
            });
            expect(persisted).not.toBeNull();
            expect(persisted!.status).toBe(status);
            expect(persisted!.notes).toBe(notes ?? null);
          }
        ),
        { numRuns: 8 }
      );
    });

    it('should upsert (not duplicate) when marking attendance twice for the same dancer/class/date', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...ALL_STATUSES),
          fc.constantFrom(...ALL_STATUSES),
          async (firstStatus, secondStatus) => {
            const dancer = await createEnrolledDancer();
            const classDate = '2025-07-15';

            // Mark attendance first time
            await teacherService.markAttendance(teacherUserId, classId, classDate, [
              { dancerId: dancer.id, status: firstStatus },
            ]);

            // Mark attendance second time (same dancer, class, date)
            const secondResults = await teacherService.markAttendance(
              teacherUserId,
              classId,
              classDate,
              [{ dancerId: dancer.id, status: secondStatus }]
            );

            expect(secondResults).toHaveLength(1);
            expect(secondResults[0].status).toBe(secondStatus);

            // Verify only ONE record exists (upsert, not duplicate)
            const count = await prisma.attendanceRecord.count({
              where: {
                dancerId: dancer.id,
                classId,
                classDate: new Date(classDate),
              },
            });
            expect(count).toBe(1);

            // Verify the record has the latest status
            const record = await prisma.attendanceRecord.findFirst({
              where: { dancerId: dancer.id, classId, classDate: new Date(classDate) },
            });
            expect(record!.status).toBe(secondStatus);
          }
        ),
        { numRuns: 8 }
      );
    });

    it('should persist all records when marking attendance for multiple dancers simultaneously', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 4 }),
          async (dancerCount) => {
            const dancers = await Promise.all(
              Array.from({ length: dancerCount }, () => createEnrolledDancer())
            );

            const classDate = `2025-08-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`;
            const records = dancers.map((dancer, i) => ({
              dancerId: dancer.id,
              status: ALL_STATUSES[i % ALL_STATUSES.length],
              notes: i % 2 === 0 ? `Note for dancer ${i}` : undefined,
            }));

            const results = await teacherService.markAttendance(
              teacherUserId,
              classId,
              classDate,
              records
            );

            // All records returned
            expect(results).toHaveLength(dancerCount);

            // Each result matches the submitted record
            for (let i = 0; i < dancerCount; i++) {
              const result = results.find((r) => r.dancerId === records[i].dancerId);
              expect(result).toBeDefined();
              expect(result!.status).toBe(records[i].status);
              expect(result!.notes).toBe(records[i].notes ?? null);
            }

            // Verify all records persisted in DB
            const dbCount = await prisma.attendanceRecord.count({
              where: {
                classId,
                classDate: new Date(classDate),
                dancerId: { in: dancers.map((d) => d.id) },
              },
            });
            expect(dbCount).toBe(dancerCount);
          }
        ),
        { numRuns: 5 }
      );
    });
  });
});
