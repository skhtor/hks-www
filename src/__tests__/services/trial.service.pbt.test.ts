/**
 * Property-Based Tests for TrialService
 * Properties 31, 32
 */

import * as fc from 'fast-check';
import { PrismaClient } from '@prisma/client';
import { TrialService } from '../../services/trial.service';
import { TeacherService } from '../../services/teacher.service';

const prisma = new PrismaClient();
const trialService = new TrialService();
const teacherService = new TeacherService();

const PBT_DOMAIN = '@pbt-trial.test';

let locationId: string;
let pricingRuleId: string;
let householdId: string;

beforeAll(async () => {
  const location = await prisma.location.create({
    data: {
      name: `PBT-Trial-Location-${Date.now()}`,
      address: { street: '1 Trial St', suburb: 'Testville', state: 'VIC', postcode: '3000' },
    },
  });
  locationId = location.id;

  const pricingRule = await prisma.pricingRule.create({
    data: {
      name: `PBT-Trial-Rule-${Date.now()}`,
      type: 'PER_CLASS',
      classCountMin: 1,
      monthlyFee: 80,
      priority: 1,
    },
  });
  pricingRuleId = pricingRule.id;

  const household = await prisma.household.create({
    data: { name: `PBT-Trial-Household-${Date.now()}` },
  });
  householdId = household.id;
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { user: { email: { contains: PBT_DOMAIN } } } });
  await prisma.enrolment.deleteMany({ where: { class: { name: { contains: 'PBT-Trial' } } } });
  await prisma.class.deleteMany({ where: { name: { contains: 'PBT-Trial' } } });
  await prisma.dancer.deleteMany({ where: { householdId } });
  await prisma.household.deleteMany({ where: { id: householdId } });
  await prisma.teacher.deleteMany({ where: { user: { email: { contains: PBT_DOMAIN } } } });
  await prisma.userAccount.deleteMany({ where: { email: { contains: PBT_DOMAIN } } });
  await prisma.location.deleteMany({ where: { id: locationId } });
  await prisma.pricingRule.deleteMany({ where: { id: pricingRuleId } });
  await prisma.$disconnect();
});

async function createTrialClass(teacherId: string, capacity = 10) {
  return prisma.class.create({
    data: {
      name: `PBT-Trial-Class-${Date.now()}-${Math.random()}`,
      style: 'Hip Hop',
      level: 'Beginner',
      dayOfWeek: 'FRIDAY',
      startTime: '16:00',
      duration: 45,
      locationId,
      teacherId,
      capacity,
      enrolledCount: 0,
      pricingRuleId,
    },
  });
}

async function createDancer() {
  return prisma.dancer.create({
    data: {
      householdId,
      firstName: `Trial${Date.now()}`,
      lastName: 'Dancer',
      dateOfBirth: new Date('2015-01-01'),
      emergencyContact: { name: 'Parent', phone: '0400000000', relationship: 'Parent' },
    },
  });
}

/**
 * Property 31: Trial Enrolment Creation
 * A trial booking must create an enrolment with isTrial=true and status=TRIAL.
 * The class enrolledCount must increment by 1.
 * Validates: Requirements 16.1, 16.2
 */
describe('Property 31: Trial Enrolment Creation', () => {
  it('should create a TRIAL enrolment and increment enrolledCount', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          const teacher = await teacherService.createTeacher({
            email: `pbt-trial-create-teacher-${Date.now()}-${Math.random()}${PBT_DOMAIN}`,
            password: 'SecurePass123!',
            name: `PBT-Trial-Create-Teacher-${Date.now()}`,
          });
          const cls = await createTrialClass(teacher.id);
          const dancer = await createDancer();

          const before = await prisma.class.findUnique({ where: { id: cls.id } });
          const enrolment = await trialService.createTrialBooking(
            dancer.id,
            cls.id,
            new Date('2025-03-01')
          );

          expect(enrolment.isTrial).toBe(true);
          expect(enrolment.status).toBe('TRIAL');
          expect(enrolment.dancerId).toBe(dancer.id);
          expect(enrolment.classId).toBe(cls.id);

          const after = await prisma.class.findUnique({ where: { id: cls.id } });
          expect(after!.enrolledCount).toBe(before!.enrolledCount + 1);
        }
      ),
      { numRuns: 5 }
    );
  });

  it('should reject trial booking when class is at capacity', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          const teacher = await teacherService.createTeacher({
            email: `pbt-trial-full-teacher-${Date.now()}-${Math.random()}${PBT_DOMAIN}`,
            password: 'SecurePass123!',
            name: `PBT-Trial-Full-Teacher-${Date.now()}`,
          });
          // Class with capacity 1, already full
          const cls = await prisma.class.create({
            data: {
              name: `PBT-Trial-Class-Full-${Date.now()}-${Math.random()}`,
              style: 'Ballet',
              level: 'Beginner',
              dayOfWeek: 'MONDAY',
              startTime: '09:00',
              duration: 60,
              locationId,
              teacherId: teacher.id,
              capacity: 1,
              enrolledCount: 1,
              pricingRuleId,
            },
          });
          const dancer = await createDancer();

          await expect(
            trialService.createTrialBooking(dancer.id, cls.id, new Date('2025-03-01'))
          ).rejects.toThrow('Class is at full capacity');
        }
      ),
      { numRuns: 3 }
    );
  });
});

/**
 * Property 32: Trial Booking Limits
 * A dancer cannot have more than 1 trial per class.
 * Attempting a second trial for the same class must be rejected.
 * Validates: Requirements 16.5
 */
describe('Property 32: Trial Booking Limits', () => {
  it('should reject a second trial booking for the same class', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          const teacher = await teacherService.createTeacher({
            email: `pbt-trial-limit-teacher-${Date.now()}-${Math.random()}${PBT_DOMAIN}`,
            password: 'SecurePass123!',
            name: `PBT-Trial-Limit-Teacher-${Date.now()}`,
          });
          const cls = await createTrialClass(teacher.id, 10);
          const dancer = await createDancer();

          // First trial — should succeed
          await trialService.createTrialBooking(dancer.id, cls.id, new Date('2025-03-01'));

          // Cancel the first trial so dancer is no longer "enrolled"
          const firstTrial = await prisma.enrolment.findFirst({
            where: { dancerId: dancer.id, classId: cls.id, isTrial: true },
          });
          await prisma.enrolment.update({
            where: { id: firstTrial!.id },
            data: { status: 'CANCELLED' },
          });
          await prisma.class.update({
            where: { id: cls.id },
            data: { enrolledCount: { decrement: 1 } },
          });

          // Second trial — should be rejected (trial limit enforced regardless of status)
          await expect(
            trialService.createTrialBooking(dancer.id, cls.id, new Date('2025-04-01'))
          ).rejects.toThrow('already used their trial');
        }
      ),
      { numRuns: 5 }
    );
  });

  it('should allow different dancers to each have one trial per class', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 5 }),
        async (count) => {
          const teacher = await teacherService.createTeacher({
            email: `pbt-trial-multi-teacher-${Date.now()}-${Math.random()}${PBT_DOMAIN}`,
            password: 'SecurePass123!',
            name: `PBT-Trial-Multi-Teacher-${Date.now()}`,
          });
          const cls = await createTrialClass(teacher.id, count + 5);
          const dancers = await Promise.all(Array.from({ length: count }, () => createDancer()));

          // Each dancer gets one trial — all should succeed
          for (const dancer of dancers) {
            const enrolment = await trialService.createTrialBooking(
              dancer.id,
              cls.id,
              new Date('2025-03-01')
            );
            expect(enrolment.isTrial).toBe(true);
            expect(enrolment.status).toBe('TRIAL');
          }

          const trials = await trialService.getTrialsByClass(cls.id);
          expect(trials.length).toBeGreaterThanOrEqual(count);
        }
      ),
      { numRuns: 4 }
    );
  });
});
