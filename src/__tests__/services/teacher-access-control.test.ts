import { AuthorizationService } from '../../services/authorization.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const authorizationService = new AuthorizationService();

describe('Teacher Access Control - Unit Tests', () => {
  let testTeacher: any;
  let testClass: any;
  let testLocation: any;
  let testPricingRule: any;
  let testDancer: any;
  let testEnrolment: any;

  beforeAll(async () => {
    await cleanupTestData();

    // Create test location
    testLocation = await prisma.location.create({
      data: {
        name: 'Test-Location-TAC',
        address: {
          street: '123 Test St',
          city: 'Test City',
          state: 'NSW',
          postcode: '2000',
        },
      },
    });

    // Create pricing rule
    testPricingRule = await prisma.pricingRule.create({
      data: {
        name: 'Test-Pricing-TAC',
        type: 'PER_CLASS',
        classCountMin: 1,
        monthlyFee: 50,
        priority: 1,
      },
    });

    // Create teacher user
    const teacherUser = await prisma.userAccount.create({
      data: {
        email: 'teacher-tac@test.com',
        passwordHash: 'hashed_password',
        role: 'TEACHER',
      },
    });

    testTeacher = await prisma.teacher.create({
      data: {
        userId: teacherUser.id,
        name: 'Test Teacher TAC',
        email: 'teacher-tac@test.com',
        specialties: ['Ballet'],
      },
    });

    // Create test class assigned to teacher
    testClass = await prisma.class.create({
      data: {
        name: 'Test-Class-TAC',
        style: 'Ballet',
        level: 'Beginner',
        dayOfWeek: 'MONDAY',
        startTime: '10:00',
        duration: 60,
        locationId: testLocation.id,
        teacherId: testTeacher.id,
        capacity: 20,
        pricingRuleId: testPricingRule.id,
      },
    });

    // Create test dancer and enrolment
    const household = await prisma.household.create({
      data: { name: 'Test-Household-TAC' },
    });

    testDancer = await prisma.dancer.create({
      data: {
        householdId: household.id,
        firstName: 'Test',
        lastName: 'Dancer-TAC',
        dateOfBirth: new Date('2010-01-01'),
        emergencyContact: {
          name: 'Emergency Contact',
          phone: '+61400000000',
        },
        medicalNotes: 'Test medical notes',
        allergies: 'Test allergies',
      },
    });

    testEnrolment = await prisma.enrolment.create({
      data: {
        dancerId: testDancer.id,
        classId: testClass.id,
        status: 'ACTIVE',
        startDate: new Date(),
      },
    });

    // Use testEnrolment to avoid unused variable warning
    expect(testEnrolment).toBeDefined();
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  describe('Teacher Class Access', () => {
    it('should allow teacher to access their assigned class', async () => {
      const hasAccess = await authorizationService.canTeacherAccessClass(
        testTeacher.id,
        testClass.id
      );
      expect(hasAccess).toBe(true);
    });

    it('should deny teacher access to unassigned class', async () => {
      // Create another teacher and class
      const otherTeacherUser = await prisma.userAccount.create({
        data: {
          email: 'other-teacher-tac@test.com',
          passwordHash: 'hashed_password',
          role: 'TEACHER',
        },
      });

      const otherTeacher = await prisma.teacher.create({
        data: {
          userId: otherTeacherUser.id,
          name: 'Other Teacher TAC',
          email: 'other-teacher-tac@test.com',
          specialties: ['Jazz'],
        },
      });

      const otherClass = await prisma.class.create({
        data: {
          name: 'Other-Class-TAC',
          style: 'Jazz',
          level: 'Intermediate',
          dayOfWeek: 'TUESDAY',
          startTime: '14:00',
          duration: 60,
          locationId: testLocation.id,
          teacherId: otherTeacher.id,
          capacity: 15,
          pricingRuleId: testPricingRule.id,
        },
      });

      const hasAccess = await authorizationService.canTeacherAccessClass(
        testTeacher.id,
        otherClass.id
      );
      expect(hasAccess).toBe(false);
    });

    it('should return only assigned classes for teacher', async () => {
      const classIds = await authorizationService.getTeacherClasses(testTeacher.id);
      expect(classIds).toContain(testClass.id);
      expect(classIds.length).toBeGreaterThanOrEqual(1);
    });

    it('should get detailed class information for teacher', async () => {
      const classes = await authorizationService.getTeacherClassDetails(testTeacher.id);
      expect(classes.length).toBeGreaterThanOrEqual(1);
      
      const assignedClass = classes.find((c: any) => c.id === testClass.id);
      expect(assignedClass).toBeDefined();
      expect(assignedClass?.name).toBe('Test-Class-TAC');
      expect(assignedClass?.location).toBeDefined();
      expect(assignedClass?.enrolments).toBeDefined();
    });
  });

  describe('Student Information Filtering', () => {
    it('should filter dancer information based on access policy', async () => {
      const policy = {
        showMedicalNotes: true,
        showAllergies: true,
        showEmergencyContact: true,
        showDateOfBirth: false,
      };

      const filtered = authorizationService.filterDancerInfo(testDancer, policy);

      expect(filtered.firstName).toBe('Test');
      expect(filtered.lastName).toBe('Dancer-TAC');
      expect(filtered.medicalNotes).toBe('Test medical notes');
      expect(filtered.allergies).toBe('Test allergies');
      expect(filtered.emergencyContact).toBeDefined();
      expect(filtered.dateOfBirth).toBeUndefined();
    });

    it('should hide sensitive information when policy disallows', async () => {
      const policy = {
        showMedicalNotes: false,
        showAllergies: false,
        showEmergencyContact: false,
        showDateOfBirth: false,
      };

      const filtered = authorizationService.filterDancerInfo(testDancer, policy);

      expect(filtered.firstName).toBe('Test');
      expect(filtered.lastName).toBe('Dancer-TAC');
      expect(filtered.medicalNotes).toBeUndefined();
      expect(filtered.allergies).toBeUndefined();
      expect(filtered.emergencyContact).toBeUndefined();
      expect(filtered.dateOfBirth).toBeUndefined();
    });

    it('should get class roll with filtered student information', async () => {
      const classRoll = await authorizationService.getClassRollForTeacher(
        testTeacher.id,
        testClass.id
      );

      expect(classRoll.length).toBeGreaterThanOrEqual(1);
      
      const student = classRoll.find((s: any) => s.dancer.id === testDancer.id);
      expect(student).toBeDefined();
      expect(student?.dancer.firstName).toBe('Test');
      expect(student?.dancer.lastName).toBe('Dancer-TAC');
      // Default policy shows medical notes and allergies
      expect(student?.dancer.medicalNotes).toBeDefined();
      expect(student?.dancer.allergies).toBeDefined();
      // Default policy hides date of birth
      expect(student?.dancer.dateOfBirth).toBeUndefined();
    });

    it('should throw error when teacher tries to access unassigned class roll', async () => {
      // Create another teacher and class
      const timestamp = Date.now();
      const otherTeacherUser = await prisma.userAccount.create({
        data: {
          email: `other-teacher-tac2-${timestamp}@test.com`,
          passwordHash: 'hashed_password',
          role: 'TEACHER',
        },
      });

      const otherTeacher = await prisma.teacher.create({
        data: {
          userId: otherTeacherUser.id,
          name: `Other Teacher TAC 2 ${timestamp}`,
          email: `other-teacher-tac2-${timestamp}@test.com`,
          specialties: ['Jazz'],
        },
      });

      const otherClass = await prisma.class.create({
        data: {
          name: 'Other-Class-TAC-2',
          style: 'Jazz',
          level: 'Advanced',
          dayOfWeek: 'WEDNESDAY',
          startTime: '16:00',
          duration: 60,
          locationId: testLocation.id,
          teacherId: otherTeacher.id,
          capacity: 15,
          pricingRuleId: testPricingRule.id,
        },
      });

      await expect(
        authorizationService.getClassRollForTeacher(testTeacher.id, otherClass.id)
      ).rejects.toThrow('Teacher does not have access to this class');
    });
  });

  describe('Access Policy Configuration', () => {
    it('should get default teacher access policy', async () => {
      const policy = await authorizationService.getTeacherAccessPolicy(testTeacher.id);

      expect(policy).toBeDefined();
      expect(policy.showMedicalNotes).toBe(true);
      expect(policy.showAllergies).toBe(true);
      expect(policy.showEmergencyContact).toBe(true);
      expect(policy.showDateOfBirth).toBe(false);
    });

    it('should update teacher access policy', async () => {
      const updatedPolicy = await authorizationService.updateTeacherAccessPolicy(
        null,
        {
          showMedicalNotes: false,
          showDateOfBirth: true,
        }
      );

      expect(updatedPolicy.showMedicalNotes).toBe(false);
      expect(updatedPolicy.showDateOfBirth).toBe(true);
      // Other fields should retain default values
      expect(updatedPolicy.showAllergies).toBe(true);
      expect(updatedPolicy.showEmergencyContact).toBe(true);
    });
  });

  describe('Teacher Permission Validation', () => {
    it('should allow teacher read access to assigned class', async () => {
      const teacherUser = await prisma.userAccount.findUnique({
        where: { id: testTeacher.userId },
      });

      const hasPermission = await authorizationService.validatePermission(
        teacherUser!.id,
        'TEACHER',
        'class',
        testClass.id,
        'read'
      );

      expect(hasPermission).toBe(true);
    });

    it('should deny teacher write access to any resource', async () => {
      const teacherUser = await prisma.userAccount.findUnique({
        where: { id: testTeacher.userId },
      });

      const hasPermission = await authorizationService.validatePermission(
        teacherUser!.id,
        'TEACHER',
        'class',
        testClass.id,
        'write'
      );

      expect(hasPermission).toBe(false);
    });

    it('should deny teacher delete access to any resource', async () => {
      const teacherUser = await prisma.userAccount.findUnique({
        where: { id: testTeacher.userId },
      });

      const hasPermission = await authorizationService.validatePermission(
        teacherUser!.id,
        'TEACHER',
        'class',
        testClass.id,
        'delete'
      );

      expect(hasPermission).toBe(false);
    });

    it('should deny teacher access to admin features', async () => {
      const teacherUser = await prisma.userAccount.findUnique({
        where: { id: testTeacher.userId },
      });

      const canAccess = await authorizationService.canAccessAdminFeatures(
        teacherUser!.id,
        'TEACHER'
      );

      expect(canAccess).toBe(false);
    });

    it('should deny teacher access to other teachers classes', async () => {
      // Create another teacher and class
      const timestamp = Date.now();
      const otherTeacherUser = await prisma.userAccount.create({
        data: {
          email: `other-teacher-tac3-${timestamp}@test.com`,
          passwordHash: 'hashed_password',
          role: 'TEACHER',
        },
      });

      const otherTeacher = await prisma.teacher.create({
        data: {
          userId: otherTeacherUser.id,
          name: `Other Teacher TAC 3 ${timestamp}`,
          email: `other-teacher-tac3-${timestamp}@test.com`,
          specialties: ['Contemporary'],
        },
      });

      const otherClass = await prisma.class.create({
        data: {
          name: 'Other-Class-TAC-3',
          style: 'Contemporary',
          level: 'Beginner',
          dayOfWeek: 'THURSDAY',
          startTime: '18:00',
          duration: 60,
          locationId: testLocation.id,
          teacherId: otherTeacher.id,
          capacity: 12,
          pricingRuleId: testPricingRule.id,
        },
      });

      const canAccess = await authorizationService.canAccessOtherTeacherClasses(
        testTeacher.id,
        otherClass.id
      );

      expect(canAccess).toBe(false);
    });
  });
});

async function cleanupTestData() {
  await prisma.enrolment.deleteMany({
    where: {
      OR: [
        { dancer: { lastName: { contains: 'Dancer-TAC' } } },
        { class: { name: { contains: 'TAC' } } },
      ],
    },
  });
  await prisma.dancer.deleteMany({
    where: { lastName: { contains: 'Dancer-TAC' } },
  });
  await prisma.class.deleteMany({
    where: { name: { contains: 'TAC' } },
  });
  await prisma.teacher.deleteMany({
    where: { name: { contains: 'TAC' } },
  });
  await prisma.household.deleteMany({
    where: { name: { contains: 'TAC' } },
  });
  await prisma.location.deleteMany({
    where: { name: { contains: 'TAC' } },
  });
  await prisma.pricingRule.deleteMany({
    where: { name: { contains: 'TAC' } },
  });
  await prisma.userAccount.deleteMany({
    where: { email: { contains: 'tac@test.com' } },
  });
}
