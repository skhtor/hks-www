/**
 * Property-Based Tests for WaitlistService
 * Properties 28, 29, 30
 */

import * as fc from 'fast-check';
import { PrismaClient } from '@prisma/client';
import { WaitlistService } from '../../services/waitlist.service';
import { TeacherService } from '../../services/teacher.service';

const prisma = new PrismaClient();
const waitlistService = new WaitlistService();
const teacherService = new TeacherService();

const PBT_DOMAIN = '@pbt-waitlist.test';

// Shared test fixtures
let locationId: string;
let pricingRuleId: string;
let householdId: string;

beforeAll(async () => {
  const location = await prisma.location.create({
    data: {
      name: `PBT-Waitlist-Location-${Date.now()}`,
      address: { street: '1 Waitlist St', suburb: 'Testville', state: 'VIC', postcode: '3000' },
    },
  });
  locationId = location.id;

  const pricingRule = await prisma.pricingRule.create({
    data: {
      name: `PBT-Waitlist-Rule-${Date.now()}`,
      type: 'PER_CLASS',
      classCountMin: 1,
      monthlyFee: 80,
      priority: 1,
    },
  });
  pricingRuleId = pricingRule.id;

  const household = await prisma.household.create({
    data: { name: `PBT-Waitlist-Household-${Date.now()}` },
  });
  householdId = household.id;
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { user: { email: { contains: PBT_DOMAIN } } } });
  await prisma.enrolment.deleteMany({ where: { class: { name: { contains: 'PBT-Waitlist' } } } });
  await prisma.waitlistEntry.deleteMany({ where: { class: { name: { contains: 'PBT-Waitlist' } } } });
  await prisma.class.deleteMany({ where: { name: { contains: 'PBT-Waitlist' } } });
  await prisma.dancer.deleteMany({ where: { householdId } });
  await prisma.household.deleteMany({ where: { id: householdId } });
  await prisma.teacher.deleteMany({ where: { user: { email: { contains: PBT_DOMAIN } } } });
  await prisma.userAccount.deleteMany({ where: { email: { contains: PBT_DOMAIN } } });
  await prisma.location.deleteMany({ where: { id: locationId } });
  await prisma.pricingRule.deleteMany({ where: { id: pricingRuleId } });
  await prisma.$disconnect();
});

async function createFullClass(teacherId: string, capacity = 1) {
  return prisma.class.create({
    data: {
      name: `PBT-Waitlist-Class-${Date.now()}-${Math.random()}`,
      style: 'Ballet',
      level: 'Beginner',
      dayOfWeek: 'MONDAY',
      startTime: '09:00',
      duration: 60,
      locationId,
      teacherId,
      capacity,
      enrolledCount: capacity, // pre-fill to capacity
      pricingRuleId,
    },
  });
}


async function createDancer() {
  return prisma.dancer.create({
    data: {
      householdId,
      firstName: `WL${Date.now()}`,
      lastName: 'Dancer',
      dateOfBirth: new Date('2015-01-01'),
      emergencyContact: { name: 'Parent', phone: '0400000000', relationship: 'Parent' },
    },
  });
}

/**
 * Property 28: Waitlist Ordering
 * Dancers who join the waitlist earlier must have a lower (earlier) position.
 * Positions must be sequential starting from 1 with no gaps.
 * Validates: Requirements 15.2
 */
describe('Property 28: Waitlist Ordering', () => {
  it('should assign sequential positions in join order', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 6 }),
        async (count) => {
          const teacher = await teacherService.createTeacher({
            email: `pbt-wl-order-teacher-${Date.now()}-${Math.random()}${PBT_DOMAIN}`,
            password: 'SecurePass123!',
            name: `PBT-WL-Order-Teacher-${Date.now()}`,
          });
          const cls = await createFullClass(teacher.id, 1);
          const dancers = await Promise.all(Array.from({ length: count }, () => createDancer()));

          // Join waitlist sequentially
          for (const dancer of dancers) {
            await waitlistService.joinWaitlist(dancer.id, cls.id);
          }

          const waitlist = await waitlistService.getWaitlist(cls.id);

          // Positions must be 1..count in order
          expect(waitlist).toHaveLength(count);
          for (let i = 0; i < count; i++) {
            expect(waitlist[i].position).toBe(i + 1);
          }

          // Dancers appear in join order
          for (let i = 0; i < count; i++) {
            expect(waitlist[i].dancerId).toBe(dancers[i].id);
          }
        }
      ),
      { numRuns: 5 }
    );
  });

  it('should maintain ordering after a dancer leaves the waitlist', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 3, max: 6 }),
        fc.integer({ min: 0, max: 5 }),
        async (count, removeIdx) => {
          const idx = removeIdx % count;
          const teacher = await teacherService.createTeacher({
            email: `pbt-wl-leave-teacher-${Date.now()}-${Math.random()}${PBT_DOMAIN}`,
            password: 'SecurePass123!',
            name: `PBT-WL-Leave-Teacher-${Date.now()}`,
          });
          const cls = await createFullClass(teacher.id, 1);
          const dancers = await Promise.all(Array.from({ length: count }, () => createDancer()));

          for (const dancer of dancers) {
            await waitlistService.joinWaitlist(dancer.id, cls.id);
          }

          const before = await waitlistService.getWaitlist(cls.id);
          const entryToRemove = before[idx];

          await waitlistService.leaveWaitlist(entryToRemove.id);

          const after = await waitlistService.getWaitlist(cls.id);

          // Should have count-1 entries
          expect(after).toHaveLength(count - 1);

          // Positions must be sequential 1..count-1
          for (let i = 0; i < after.length; i++) {
            expect(after[i].position).toBe(i + 1);
          }

          // Removed dancer should not appear
          expect(after.map((e) => e.dancerId)).not.toContain(entryToRemove.dancerId);
        }
      ),
      { numRuns: 5 }
    );
  });
});

/**
 * Property 29: Waitlist Queue Processing
 * When a spot opens, the offer must go to position 1 (first in queue).
 * Validates: Requirements 15.3
 */
describe('Property 29: Waitlist Queue Processing', () => {
  it('should offer spot to the first person in the queue', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 5 }),
        async (count) => {
          const teacher = await teacherService.createTeacher({
            email: `pbt-wl-offer-teacher-${Date.now()}-${Math.random()}${PBT_DOMAIN}`,
            password: 'SecurePass123!',
            name: `PBT-WL-Offer-Teacher-${Date.now()}`,
          });
          // Class with capacity 1, currently full
          const cls = await createFullClass(teacher.id, 1);
          const dancers = await Promise.all(Array.from({ length: count }, () => createDancer()));

          for (const dancer of dancers) {
            await waitlistService.joinWaitlist(dancer.id, cls.id);
          }

          // Free up a spot
          await prisma.class.update({
            where: { id: cls.id },
            data: { enrolledCount: 0 },
          });

          const offered = await waitlistService.offerNextSpot(cls.id);

          expect(offered).not.toBeNull();
          // Must be the first dancer (position 1)
          expect(offered!.dancerId).toBe(dancers[0].id);
          expect(offered!.expiresAt).not.toBeNull();
          expect(offered!.expiresAt!.getTime()).toBeGreaterThan(Date.now());
        }
      ),
      { numRuns: 5 }
    );
  });

  it('should not offer a spot when class is still full', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          const teacher = await teacherService.createTeacher({
            email: `pbt-wl-full-teacher-${Date.now()}-${Math.random()}${PBT_DOMAIN}`,
            password: 'SecurePass123!',
            name: `PBT-WL-Full-Teacher-${Date.now()}`,
          });
          const cls = await createFullClass(teacher.id, 1);
          const dancer = await createDancer();
          await waitlistService.joinWaitlist(dancer.id, cls.id);

          await expect(waitlistService.offerNextSpot(cls.id)).rejects.toThrow(
            'Class is still at full capacity'
          );
        }
      ),
      { numRuns: 3 }
    );
  });
});

/**
 * Property 30: Waitlist Progression
 * Accepting an offer removes the dancer from the waitlist and creates an active enrolment.
 * Remaining entries are re-sequenced correctly.
 * Validates: Requirements 15.5
 */
describe('Property 30: Waitlist Progression', () => {
  it('should convert waitlist entry to enrolment on acceptance', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 4 }),
        async (count) => {
          const teacher = await teacherService.createTeacher({
            email: `pbt-wl-accept-teacher-${Date.now()}-${Math.random()}${PBT_DOMAIN}`,
            password: 'SecurePass123!',
            name: `PBT-WL-Accept-Teacher-${Date.now()}`,
          });
          const adminUser = await prisma.userAccount.create({
            data: {
              email: `pbt-wl-accept-admin-${Date.now()}-${Math.random()}${PBT_DOMAIN}`,
              passwordHash: 'hash',
              role: 'ADMIN',
            },
          });

          // Class with capacity 1, currently full
          const cls = await createFullClass(teacher.id, 1);
          const dancers = await Promise.all(Array.from({ length: count }, () => createDancer()));

          for (const dancer of dancers) {
            await waitlistService.joinWaitlist(dancer.id, cls.id);
          }

          // Free up a spot and offer it
          await prisma.class.update({ where: { id: cls.id }, data: { enrolledCount: 0 } });
          const offered = await waitlistService.offerNextSpot(cls.id);
          expect(offered).not.toBeNull();

          // Accept the offer
          const enrolment = await waitlistService.acceptOffer(offered!.id, adminUser.id);

          // Enrolment should be active
          expect(enrolment.status).toBe('ACTIVE');
          expect(enrolment.dancerId).toBe(dancers[0].id);

          // Waitlist should have count-1 entries, re-sequenced from 1
          const remaining = await waitlistService.getWaitlist(cls.id);
          expect(remaining).toHaveLength(count - 1);
          for (let i = 0; i < remaining.length; i++) {
            expect(remaining[i].position).toBe(i + 1);
          }

          // First dancer should no longer be on waitlist
          expect(remaining.map((e) => e.dancerId)).not.toContain(dancers[0].id);
        }
      ),
      { numRuns: 4 }
    );
  });

  it('should reject expired offers', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          const teacher = await teacherService.createTeacher({
            email: `pbt-wl-expire-teacher-${Date.now()}-${Math.random()}${PBT_DOMAIN}`,
            password: 'SecurePass123!',
            name: `PBT-WL-Expire-Teacher-${Date.now()}`,
          });
          const adminUser = await prisma.userAccount.create({
            data: {
              email: `pbt-wl-expire-admin-${Date.now()}-${Math.random()}${PBT_DOMAIN}`,
              passwordHash: 'hash',
              role: 'ADMIN',
            },
          });

          const cls = await createFullClass(teacher.id, 1);
          const dancer = await createDancer();
          await waitlistService.joinWaitlist(dancer.id, cls.id);

          // Free up spot and offer
          await prisma.class.update({ where: { id: cls.id }, data: { enrolledCount: 0 } });
          const offered = await waitlistService.offerNextSpot(cls.id);

          // Manually expire the offer
          await prisma.waitlistEntry.update({
            where: { id: offered!.id },
            data: { expiresAt: new Date(Date.now() - 1000) }, // 1 second in the past
          });

          await expect(
            waitlistService.acceptOffer(offered!.id, adminUser.id)
          ).rejects.toThrow('Offer has expired');
        }
      ),
      { numRuns: 3 }
    );
  });
});
