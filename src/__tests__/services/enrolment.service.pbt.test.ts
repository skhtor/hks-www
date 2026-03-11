import fc from 'fast-check';
import { EnrolmentService } from '../../services/enrolment.service';
import { PrismaClient, EnrolmentStatus } from '@prisma/client';
import { TeacherService } from '../../services/teacher.service';

const prisma = new PrismaClient();
const enrolmentService = new EnrolmentService();
const teacherService = new TeacherService();

const PBT_DOMAIN = '@enrolment-pbt.test';

describe('EnrolmentService Property-Based Tests', () => {
  let locationId: string;
  let pricingRuleId: string;
  let householdId: string;

  beforeAll(async () => {
    // Clean up any leftover PBT data
    await prisma.auditLog.deleteMany({
      where: { user: { email: { contains: PBT_DOMAIN } } },
    });
    await prisma.enrolment.deleteMany({
      where: { class: { name: { contains: 'PBT-Enrolment' } } },
    });
    await prisma.class.deleteMany({ where: { name: { contains: 'PBT-Enrolment' } } });
    await prisma.dancer.deleteMany({ where: { household: { name: { contains: 'PBT-Enrolment' } } } });
    await prisma.household.deleteMany({ where: { name: { contains: 'PBT-Enrolment' } } });
    await prisma.teacher.deleteMany({ where: { user: { email: { contains: PBT_DOMAIN } } } });
    await prisma.userAccount.deleteMany({ where: { email: { contains: PBT_DOMAIN } } });
    await prisma.location.deleteMany({ where: { name: { contains: 'PBT-Enrolment' } } });
    await prisma.pricingRule.deleteMany({ where: { name: { contains: 'PBT-Enrolment' } } });

    const location = await prisma.location.create({
      data: {
        name: `PBT-Enrolment-Location-${Date.now()}`,
        address: { street: '1 Test St', suburb: 'Testville', state: 'VIC', postcode: '3000' },
      },
    });
    locationId = location.id;

    const pricingRule = await prisma.pricingRule.create({
      data: {
        name: `PBT-Enrolment-Rule-${Date.now()}`,
        type: 'PER_CLASS',
        classCountMin: 1,
        monthlyFee: 80,
        priority: 1,
      },
    });
    pricingRuleId = pricingRule.id;

    const household = await prisma.household.create({
      data: { name: `PBT-Enrolment-Household-${Date.now()}` },
    });
    householdId = household.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { user: { email: { contains: PBT_DOMAIN } } },
    });
    await prisma.enrolment.deleteMany({
      where: { class: { name: { contains: 'PBT-Enrolment' } } },
    });
    await prisma.class.deleteMany({ where: { name: { contains: 'PBT-Enrolment' } } });
    await prisma.dancer.deleteMany({ where: { householdId } });
    await prisma.household.deleteMany({ where: { id: householdId } });
    await prisma.teacher.deleteMany({ where: { user: { email: { contains: PBT_DOMAIN } } } });
    await prisma.userAccount.deleteMany({ where: { email: { contains: PBT_DOMAIN } } });
    await prisma.location.deleteMany({ where: { id: locationId } });
    await prisma.pricingRule.deleteMany({ where: { id: pricingRuleId } });
    await prisma.$disconnect();
  });

  /** Helper: create a class with given capacity */
  async function createClass(capacity: number, teacherId: string) {
    return prisma.class.create({
      data: {
        name: `PBT-Enrolment-Class-${Date.now()}-${Math.random()}`,
        style: 'Ballet',
        level: 'Beginner',
        dayOfWeek: 'MONDAY',
        startTime: '09:00',
        duration: 60,
        locationId,
        teacherId,
        capacity,
        enrolledCount: 0,
        pricingRuleId,
      },
    });
  }

  /** Helper: create a dancer */
  async function createDancer() {
    return prisma.dancer.create({
      data: {
        householdId,
        firstName: `PBT${Date.now()}`,
        lastName: 'Dancer',
        dateOfBirth: new Date('2015-01-01'),
        emergencyContact: { name: 'Parent', phone: '0400000000', relationship: 'Parent' },
      },
    });
  }

  /** Helper: create an admin user */
  async function createAdminUser() {
    return prisma.userAccount.create({
      data: {
        email: `pbt-admin-${Date.now()}-${Math.random()}${PBT_DOMAIN}`,
        passwordHash: 'hash',
        role: 'ADMIN',
      },
    });
  }

  /**
   * Property 12: Capacity Enforcement
   * For any class with capacity N, enrolling N+1 dancers must fail.
   * The class enrolledCount must never exceed capacity.
   * Validates: Requirements 4.4, 4.7, 8.6
   */
  describe('Property 12: Capacity Enforcement', () => {
    it('should never allow enrolledCount to exceed capacity', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }), // capacity
          async (capacity) => {
            const teacher = await teacherService.createTeacher({
              email: `pbt-cap-teacher-${Date.now()}-${Math.random()}${PBT_DOMAIN}`,
              password: 'SecurePass123!',
              name: `PBT-Cap-Teacher-${Date.now()}`,
            });
            const cls = await createClass(capacity, teacher.id);

            // Create capacity+1 dancers
            const dancers = await Promise.all(
              Array.from({ length: capacity + 1 }, () => createDancer())
            );

            // Enrol exactly capacity dancers — all should succeed
            for (let i = 0; i < capacity; i++) {
              await enrolmentService.createEnrolment({
                dancerId: dancers[i].id,
                classId: cls.id,
                startDate: new Date('2025-01-01'),
              });
            }

            // Verify enrolledCount equals capacity
            const filled = await prisma.class.findUnique({ where: { id: cls.id } });
            expect(filled!.enrolledCount).toBe(capacity);

            // The (capacity+1)th enrolment must fail
            await expect(
              enrolmentService.createEnrolment({
                dancerId: dancers[capacity].id,
                classId: cls.id,
                startDate: new Date('2025-01-01'),
              })
            ).rejects.toThrow('Class is at full capacity');

            // enrolledCount must still equal capacity (not incremented on failure)
            const afterFail = await prisma.class.findUnique({ where: { id: cls.id } });
            expect(afterFail!.enrolledCount).toBe(capacity);
            expect(afterFail!.enrolledCount).toBeLessThanOrEqual(afterFail!.capacity);
          }
        ),
        { numRuns: 5 }
      );
    });
  });

  /**
   * Property 13: Enrolment Count Invariant
   * The class enrolledCount must always equal the number of ACTIVE or TRIAL enrolments.
   * Validates: Requirements 4.4, 19.5
   */
  describe('Property 13: Enrolment Count Invariant', () => {
    it('should keep enrolledCount consistent with active enrolment count', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 4 }), // number of enrolments to create
          async (enrolCount) => {
            const teacher = await teacherService.createTeacher({
              email: `pbt-inv-teacher-${Date.now()}-${Math.random()}${PBT_DOMAIN}`,
              password: 'SecurePass123!',
              name: `PBT-Inv-Teacher-${Date.now()}`,
            });
            const cls = await createClass(10, teacher.id);
            const adminUser = await createAdminUser();

            const dancers = await Promise.all(
              Array.from({ length: enrolCount }, () => createDancer())
            );

            // Enrol all dancers
            const enrolments = [];
            for (const dancer of dancers) {
              const e = await enrolmentService.createEnrolment({
                dancerId: dancer.id,
                classId: cls.id,
                startDate: new Date('2025-01-01'),
              });
              enrolments.push(e);
            }

            // Verify count matches
            const afterEnrol = await prisma.class.findUnique({ where: { id: cls.id } });
            const activeCount = await prisma.enrolment.count({
              where: {
                classId: cls.id,
                status: { in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.TRIAL] },
              },
            });
            expect(afterEnrol!.enrolledCount).toBe(activeCount);

            // Cancel one enrolment
            if (enrolments.length > 0) {
              await enrolmentService.cancelEnrolment(enrolments[0].id, new Date(), adminUser.id);

              const afterCancel = await prisma.class.findUnique({ where: { id: cls.id } });
              const activeCountAfter = await prisma.enrolment.count({
                where: {
                  classId: cls.id,
                  status: { in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.TRIAL] },
                },
              });
              expect(afterCancel!.enrolledCount).toBe(activeCountAfter);
            }
          }
        ),
        { numRuns: 5 }
      );
    });
  });

  /**
   * Property 37: Concurrent Capacity Enforcement
   * When multiple enrolments are attempted simultaneously for a class at capacity,
   * the total enrolled must never exceed capacity.
   * Validates: Requirements 4.7, 19.5
   */
  describe('Property 37: Concurrent Capacity Enforcement', () => {
    it('should not exceed capacity under concurrent enrolment attempts', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 4 }), // capacity
          async (capacity) => {
            const teacher = await teacherService.createTeacher({
              email: `pbt-conc-teacher-${Date.now()}-${Math.random()}${PBT_DOMAIN}`,
              password: 'SecurePass123!',
              name: `PBT-Conc-Teacher-${Date.now()}`,
            });
            const cls = await createClass(capacity, teacher.id);

            // Create capacity+2 dancers to attempt concurrent enrolment
            const dancers = await Promise.all(
              Array.from({ length: capacity + 2 }, () => createDancer())
            );

            // Attempt all enrolments concurrently
            const results = await Promise.allSettled(
              dancers.map((dancer) =>
                enrolmentService.createEnrolment({
                  dancerId: dancer.id,
                  classId: cls.id,
                  startDate: new Date('2025-01-01'),
                })
              )
            );

            const succeeded = results.filter((r) => r.status === 'fulfilled').length;
            const failed = results.filter((r) => r.status === 'rejected').length;

            // At most `capacity` enrolments should succeed
            expect(succeeded).toBeLessThanOrEqual(capacity);
            // At least 2 should fail (we tried capacity+2)
            expect(failed).toBeGreaterThanOrEqual(2);

            // The actual enrolledCount must not exceed capacity
            const cls2 = await prisma.class.findUnique({ where: { id: cls.id } });
            expect(cls2!.enrolledCount).toBeLessThanOrEqual(capacity);
          }
        ),
        { numRuns: 5 }
      );
    });
  });
});
