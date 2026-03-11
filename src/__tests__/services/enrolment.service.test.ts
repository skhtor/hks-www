import { PrismaClient, EnrolmentStatus } from '@prisma/client';
import { EnrolmentService } from '../../services/enrolment.service';
import { TeacherService } from '../../services/teacher.service';

const prisma = new PrismaClient();
const enrolmentService = new EnrolmentService();
const teacherService = new TeacherService();

const TEST_DOMAIN = '@enrolment-service-test.example.com';

describe('EnrolmentService', () => {
  let dancerId: string;
  let classId: string;
  let classId2: string;
  let adminUserId: string;
  let householdId: string;

  beforeAll(async () => {
    // Clean up any leftover test data
    await prisma.auditLog.deleteMany({
      where: { user: { email: { contains: TEST_DOMAIN } } },
    });
    await prisma.enrolment.deleteMany({
      where: { class: { teacher: { user: { email: { contains: TEST_DOMAIN } } } } },
    });
    await prisma.class.deleteMany({
      where: { teacher: { user: { email: { contains: TEST_DOMAIN } } } },
    });
    await prisma.dancer.deleteMany({
      where: { household: { name: { contains: 'EnrolmentTest' } } },
    });
    await prisma.household.deleteMany({ where: { name: { contains: 'EnrolmentTest' } } });
    await prisma.teacher.deleteMany({
      where: { user: { email: { contains: TEST_DOMAIN } } },
    });
    await prisma.userAccount.deleteMany({ where: { email: { contains: TEST_DOMAIN } } });

    // Create admin user for audit logs
    const adminUser = await prisma.userAccount.create({
      data: {
        email: `admin${Date.now()}${TEST_DOMAIN}`,
        passwordHash: 'hash',
        role: 'ADMIN',
      },
    });
    adminUserId = adminUser.id;

    // Create teacher
    const teacher = await teacherService.createTeacher({
      email: `teacher${Date.now()}${TEST_DOMAIN}`,
      password: 'SecurePass123!',
      name: 'Enrolment Test Teacher',
    });

    // Create location and pricing rule
    const location = await prisma.location.create({
      data: {
        name: `EnrolmentTestStudio${Date.now()}`,
        address: { street: '1 Test St', suburb: 'Testville', state: 'VIC', postcode: '3000' },
      },
    });
    const pricingRule = await prisma.pricingRule.create({
      data: {
        name: `EnrolmentTestRule${Date.now()}`,
        type: 'PER_CLASS',
        classCountMin: 1,
        monthlyFee: 80,
        priority: 1,
      },
    });

    // Create two classes
    const cls1 = await prisma.class.create({
      data: {
        name: 'Enrolment Test Class 1',
        style: 'Ballet',
        level: 'Beginner',
        dayOfWeek: 'MONDAY',
        startTime: '09:00',
        duration: 60,
        locationId: location.id,
        teacherId: teacher.id,
        capacity: 3,
        enrolledCount: 0,
        pricingRuleId: pricingRule.id,
      },
    });
    classId = cls1.id;

    const cls2 = await prisma.class.create({
      data: {
        name: 'Enrolment Test Class 2',
        style: 'Jazz',
        level: 'Intermediate',
        dayOfWeek: 'TUESDAY',
        startTime: '10:00',
        duration: 60,
        locationId: location.id,
        teacherId: teacher.id,
        capacity: 5,
        enrolledCount: 0,
        pricingRuleId: pricingRule.id,
      },
    });
    classId2 = cls2.id;

    // Create household and dancer
    const household = await prisma.household.create({
      data: { name: 'EnrolmentTest Family' },
    });
    householdId = household.id;

    const dancer = await prisma.dancer.create({
      data: {
        householdId: household.id,
        firstName: 'Test',
        lastName: 'Dancer',
        dateOfBirth: new Date('2015-01-01'),
        emergencyContact: { name: 'Parent', phone: '0400000000', relationship: 'Parent' },
      },
    });
    dancerId = dancer.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { user: { email: { contains: TEST_DOMAIN } } },
    });
    await prisma.enrolment.deleteMany({
      where: { class: { name: { startsWith: 'Enrolment Test Class' } } },
    });
    await prisma.class.deleteMany({ where: { name: { startsWith: 'Enrolment Test Class' } } });
    await prisma.dancer.deleteMany({ where: { householdId } });
    await prisma.household.deleteMany({ where: { id: householdId } });
    await prisma.teacher.deleteMany({
      where: { user: { email: { contains: TEST_DOMAIN } } },
    });
    await prisma.userAccount.deleteMany({ where: { email: { contains: TEST_DOMAIN } } });
    await prisma.location.deleteMany({ where: { name: { startsWith: 'EnrolmentTestStudio' } } });
    await prisma.pricingRule.deleteMany({ where: { name: { startsWith: 'EnrolmentTestRule' } } });
    await prisma.$disconnect();
  });

  // Helper to clean up enrolments and reset class counts between tests
  async function cleanEnrolments() {
    await prisma.enrolment.deleteMany({
      where: { classId: { in: [classId, classId2] } },
    });
    await prisma.class.updateMany({
      where: { id: { in: [classId, classId2] } },
      data: { enrolledCount: 0 },
    });
  }

  describe('createEnrolment', () => {
    beforeEach(async () => {
      await cleanEnrolments();
    });

    it('should create an enrolment successfully', async () => {
      const enrolment = await enrolmentService.createEnrolment({
        dancerId,
        classId,
        startDate: new Date('2025-01-01'),
      });

      expect(enrolment.id).toBeDefined();
      expect(enrolment.dancerId).toBe(dancerId);
      expect(enrolment.classId).toBe(classId);
      expect(enrolment.status).toBe(EnrolmentStatus.ACTIVE);
      expect(enrolment.isTrial).toBe(false);
      expect(enrolment.dancer).toBeDefined();
      expect(enrolment.class).toBeDefined();
    });

    it('should increment class enrolledCount after enrolment', async () => {
      await enrolmentService.createEnrolment({
        dancerId,
        classId,
        startDate: new Date('2025-01-01'),
      });

      const cls = await prisma.class.findUnique({ where: { id: classId } });
      expect(cls!.enrolledCount).toBe(1);
    });

    it('should create a TRIAL enrolment when isTrial is true', async () => {
      const enrolment = await enrolmentService.createEnrolment({
        dancerId,
        classId,
        startDate: new Date('2025-01-01'),
        isTrial: true,
      });

      expect(enrolment.status).toBe(EnrolmentStatus.TRIAL);
      expect(enrolment.isTrial).toBe(true);
    });

    it('should throw when dancer not found', async () => {
      await expect(
        enrolmentService.createEnrolment({
          dancerId: 'non-existent-dancer',
          classId,
          startDate: new Date('2025-01-01'),
        })
      ).rejects.toThrow('Dancer not found');
    });

    it('should throw when class not found', async () => {
      await expect(
        enrolmentService.createEnrolment({
          dancerId,
          classId: 'non-existent-class',
          startDate: new Date('2025-01-01'),
        })
      ).rejects.toThrow('Class not found');
    });

    it('should throw when class is at full capacity', async () => {
      // Class 1 has capacity 3 — fill it up
      const household2 = await prisma.household.create({ data: { name: 'EnrolmentTest Capacity Family' } });
      const dancers = await Promise.all(
        [1, 2, 3].map((i) =>
          prisma.dancer.create({
            data: {
              householdId: household2.id,
              firstName: `Cap${i}`,
              lastName: 'Dancer',
              dateOfBirth: new Date('2015-01-01'),
              emergencyContact: { name: 'Parent', phone: '0400000000', relationship: 'Parent' },
            },
          })
        )
      );

      // Fill the class to capacity
      for (const d of dancers) {
        await enrolmentService.createEnrolment({
          dancerId: d.id,
          classId,
          startDate: new Date('2025-01-01'),
        });
      }

      // Now try to enrol the original dancer — should fail
      await expect(
        enrolmentService.createEnrolment({
          dancerId,
          classId,
          startDate: new Date('2025-01-01'),
        })
      ).rejects.toThrow('Class is at full capacity');

      // Cleanup
      await prisma.enrolment.deleteMany({ where: { classId } });
      await prisma.class.update({ where: { id: classId }, data: { enrolledCount: 0 } });
      await prisma.dancer.deleteMany({ where: { householdId: household2.id } });
      await prisma.household.delete({ where: { id: household2.id } });
    });

    it('should throw when dancer is already actively enrolled in the class', async () => {
      await enrolmentService.createEnrolment({
        dancerId,
        classId,
        startDate: new Date('2025-01-01'),
      });

      await expect(
        enrolmentService.createEnrolment({
          dancerId,
          classId,
          startDate: new Date('2025-02-01'),
        })
      ).rejects.toThrow('Dancer is already actively enrolled in this class');
    });
  });

  describe('getEnrolment', () => {
    beforeEach(async () => {
      await cleanEnrolments();
    });

    it('should return an enrolment by ID with dancer and class', async () => {
      const created = await enrolmentService.createEnrolment({
        dancerId,
        classId,
        startDate: new Date('2025-01-01'),
      });

      const fetched = await enrolmentService.getEnrolment(created.id);
      expect(fetched.id).toBe(created.id);
      expect(fetched.dancer).toBeDefined();
      expect(fetched.class).toBeDefined();
    });

    it('should throw when enrolment not found', async () => {
      await expect(enrolmentService.getEnrolment('non-existent-id')).rejects.toThrow(
        'Enrolment not found'
      );
    });
  });

  describe('listEnrolments', () => {
    beforeEach(async () => {
      await cleanEnrolments();
      await enrolmentService.createEnrolment({
        dancerId,
        classId,
        startDate: new Date('2025-01-01'),
      });
    });

    it('should list all enrolments without filters', async () => {
      const enrolments = await enrolmentService.listEnrolments();
      expect(enrolments.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter by classId', async () => {
      const enrolments = await enrolmentService.listEnrolments({ classId });
      expect(enrolments.every((e) => e.classId === classId)).toBe(true);
      expect(enrolments.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter by dancerId', async () => {
      const enrolments = await enrolmentService.listEnrolments({ dancerId });
      expect(enrolments.every((e) => e.dancerId === dancerId)).toBe(true);
    });

    it('should filter by status', async () => {
      const enrolments = await enrolmentService.listEnrolments({ status: EnrolmentStatus.ACTIVE });
      expect(enrolments.every((e) => e.status === EnrolmentStatus.ACTIVE)).toBe(true);
    });

    it('should return empty array when no enrolments match filter', async () => {
      const enrolments = await enrolmentService.listEnrolments({
        status: EnrolmentStatus.CANCELLED,
        classId,
      });
      expect(enrolments).toEqual([]);
    });
  });

  describe('cancelEnrolment', () => {
    let enrolmentId: string;

    beforeEach(async () => {
      await cleanEnrolments();
      const e = await enrolmentService.createEnrolment({
        dancerId,
        classId,
        startDate: new Date('2025-01-01'),
      });
      enrolmentId = e.id;
    });

    it('should cancel an enrolment successfully', async () => {
      const effectiveDate = new Date('2025-06-01');
      const cancelled = await enrolmentService.cancelEnrolment(enrolmentId, effectiveDate, adminUserId);

      expect(cancelled.status).toBe(EnrolmentStatus.CANCELLED);
      expect(cancelled.endDate).toEqual(effectiveDate);
    });

    it('should decrement class enrolledCount on cancellation', async () => {
      const before = await prisma.class.findUnique({ where: { id: classId } });
      expect(before!.enrolledCount).toBe(1);

      await enrolmentService.cancelEnrolment(enrolmentId, new Date(), adminUserId);

      const after = await prisma.class.findUnique({ where: { id: classId } });
      expect(after!.enrolledCount).toBe(0);
    });

    it('should create an audit log entry on cancellation', async () => {
      await enrolmentService.cancelEnrolment(enrolmentId, new Date('2025-06-01'), adminUserId);

      const auditLog = await prisma.auditLog.findFirst({
        where: {
          entityId: enrolmentId,
          action: 'ENROLMENT_CANCELLED',
        },
      });

      expect(auditLog).not.toBeNull();
      expect(auditLog!.userId).toBe(adminUserId);
      expect(auditLog!.entityType).toBe('Enrolment');
      const changes = auditLog!.changes as Record<string, unknown>;
      expect(changes.previousStatus).toBe(EnrolmentStatus.ACTIVE);
    });

    it('should throw when enrolment not found', async () => {
      await expect(
        enrolmentService.cancelEnrolment('non-existent-id', new Date(), adminUserId)
      ).rejects.toThrow('Enrolment not found');
    });
  });

  describe('moveEnrolment', () => {
    let enrolmentId: string;

    beforeEach(async () => {
      await cleanEnrolments();
      const e = await enrolmentService.createEnrolment({
        dancerId,
        classId,
        startDate: new Date('2025-01-01'),
      });
      enrolmentId = e.id;
    });

    it('should move an enrolment to a new class', async () => {
      const moved = await enrolmentService.moveEnrolment(enrolmentId, classId2, adminUserId);

      expect(moved.classId).toBe(classId2);
    });

    it('should decrement old class count and increment new class count', async () => {
      const oldBefore = await prisma.class.findUnique({ where: { id: classId } });
      const newBefore = await prisma.class.findUnique({ where: { id: classId2 } });
      expect(oldBefore!.enrolledCount).toBe(1);
      expect(newBefore!.enrolledCount).toBe(0);

      await enrolmentService.moveEnrolment(enrolmentId, classId2, adminUserId);

      const oldAfter = await prisma.class.findUnique({ where: { id: classId } });
      const newAfter = await prisma.class.findUnique({ where: { id: classId2 } });
      expect(oldAfter!.enrolledCount).toBe(0);
      expect(newAfter!.enrolledCount).toBe(1);
    });

    it('should create an audit log entry on move', async () => {
      await enrolmentService.moveEnrolment(enrolmentId, classId2, adminUserId);

      const auditLog = await prisma.auditLog.findFirst({
        where: {
          entityId: enrolmentId,
          action: 'ENROLMENT_MOVED',
        },
      });

      expect(auditLog).not.toBeNull();
      expect(auditLog!.userId).toBe(adminUserId);
      const changes = auditLog!.changes as Record<string, unknown>;
      expect(changes.fromClassId).toBe(classId);
      expect(changes.toClassId).toBe(classId2);
    });

    it('should throw when enrolment not found', async () => {
      await expect(
        enrolmentService.moveEnrolment('non-existent-id', classId2, adminUserId)
      ).rejects.toThrow('Enrolment not found');
    });

    it('should throw when target class not found', async () => {
      await expect(
        enrolmentService.moveEnrolment(enrolmentId, 'non-existent-class', adminUserId)
      ).rejects.toThrow('Target class not found');
    });

    it('should throw when target class is at full capacity', async () => {
      // Fill class 2 to capacity (5)
      const household3 = await prisma.household.create({ data: { name: 'EnrolmentTest Move Family' } });
      const dancers = await Promise.all(
        [1, 2, 3, 4, 5].map((i) =>
          prisma.dancer.create({
            data: {
              householdId: household3.id,
              firstName: `Move${i}`,
              lastName: 'Dancer',
              dateOfBirth: new Date('2015-01-01'),
              emergencyContact: { name: 'Parent', phone: '0400000000', relationship: 'Parent' },
            },
          })
        )
      );

      for (const d of dancers) {
        await enrolmentService.createEnrolment({
          dancerId: d.id,
          classId: classId2,
          startDate: new Date('2025-01-01'),
        });
      }

      await expect(
        enrolmentService.moveEnrolment(enrolmentId, classId2, adminUserId)
      ).rejects.toThrow('Target class is at full capacity');

      // Cleanup
      await prisma.enrolment.deleteMany({ where: { classId: classId2 } });
      await prisma.class.update({ where: { id: classId2 }, data: { enrolledCount: 0 } });
      await prisma.dancer.deleteMany({ where: { householdId: household3.id } });
      await prisma.household.delete({ where: { id: household3.id } });
    });
  });
});
