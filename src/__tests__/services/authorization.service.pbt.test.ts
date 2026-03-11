import fc from 'fast-check';
import { AuthorizationService } from '../../services/authorization.service';
import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();
const authorizationService = new AuthorizationService();

describe('AuthorizationService Property-Based Tests', () => {
  // Test data cleanup
  beforeAll(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  /**
   * Property 5: Role-Based Access Control
   * Feature: dance-school-management-platform
   * For any user and resource, access should be granted if and only if
   * the user's role has permission for that resource type.
   * **Validates: Requirements 2.2**
   */
  describe('Property 5: Role-Based Access Control', () => {
    it('should grant admin access to all resource types', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('customer', 'dancer', 'enrolment', 'invoice', 'payment', 'class', 'attendance'),
          fc.uuid(),
          fc.constantFrom('read', 'write', 'delete'),
          async (resourceType, resourceId, action) => {
            // Create admin user
            const adminUser = await createTestUser(UserRole.ADMIN);

            // Admin should have access to all resources
            const hasAccess = await authorizationService.validatePermission(
              adminUser.id,
              UserRole.ADMIN,
              resourceType,
              resourceId,
              action as 'read' | 'write' | 'delete'
            );

            expect(hasAccess).toBe(true);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should restrict customer access to only their own resources', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('customer', 'dancer', 'enrolment', 'invoice', 'payment'),
          fc.constantFrom('read', 'write', 'delete'),
          async (resourceType, action) => {
            // Create customer with household and dancer
            const { customer, household, dancer } = await createTestCustomerWithDancer();

            // Create resources owned by this customer
            let ownedResourceId: string;
            let unownedResourceId: string;

            switch (resourceType) {
              case 'customer':
                ownedResourceId = customer.id;
                unownedResourceId = fc.sample(fc.uuid(), 1)[0];
                break;
              case 'dancer':
                ownedResourceId = dancer.id;
                // Create another household with dancer
                const otherSetup = await createTestCustomerWithDancer();
                unownedResourceId = otherSetup.dancer.id;
                break;
              case 'enrolment':
                const classData = await createTestClass();
                const enrolment = await prisma.enrolment.create({
                  data: {
                    dancerId: dancer.id,
                    classId: classData.id,
                    status: 'ACTIVE',
                    startDate: new Date(),
                  },
                });
                ownedResourceId = enrolment.id;
                // Create enrolment for another dancer
                const otherSetup2 = await createTestCustomerWithDancer();
                const otherEnrolment = await prisma.enrolment.create({
                  data: {
                    dancerId: otherSetup2.dancer.id,
                    classId: classData.id,
                    status: 'ACTIVE',
                    startDate: new Date(),
                  },
                });
                unownedResourceId = otherEnrolment.id;
                break;
              case 'invoice':
                const invoice = await prisma.invoice.create({
                  data: {
                    customerId: customer.id,
                    householdId: household.id,
                    invoiceNumber: `INV-${Date.now()}`,
                    subtotal: 100,
                    discountAmount: 0,
                    gstAmount: 10,
                    total: 110,
                    status: 'DUE',
                    dueDate: new Date(),
                    lineItems: {},
                  },
                });
                ownedResourceId = invoice.id;
                // Create invoice for another customer
                const otherSetup3 = await createTestCustomerWithDancer();
                const otherInvoice = await prisma.invoice.create({
                  data: {
                    customerId: otherSetup3.customer.id,
                    householdId: otherSetup3.household.id,
                    invoiceNumber: `INV-${Date.now()}-2`,
                    subtotal: 100,
                    discountAmount: 0,
                    gstAmount: 10,
                    total: 110,
                    status: 'DUE',
                    dueDate: new Date(),
                    lineItems: {},
                  },
                });
                unownedResourceId = otherInvoice.id;
                break;
              case 'payment':
                const invoice2 = await prisma.invoice.create({
                  data: {
                    customerId: customer.id,
                    householdId: household.id,
                    invoiceNumber: `INV-${Date.now()}-3`,
                    subtotal: 100,
                    discountAmount: 0,
                    gstAmount: 10,
                    total: 110,
                    status: 'DUE',
                    dueDate: new Date(),
                    lineItems: {},
                  },
                });
                const payment = await prisma.payment.create({
                  data: {
                    invoiceId: invoice2.id,
                    customerId: customer.id,
                    amount: 110,
                    status: 'PAID',
                  },
                });
                ownedResourceId = payment.id;
                // Create payment for another customer
                const otherSetup4 = await createTestCustomerWithDancer();
                const otherInvoice2 = await prisma.invoice.create({
                  data: {
                    customerId: otherSetup4.customer.id,
                    householdId: otherSetup4.household.id,
                    invoiceNumber: `INV-${Date.now()}-4`,
                    subtotal: 100,
                    discountAmount: 0,
                    gstAmount: 10,
                    total: 110,
                    status: 'DUE',
                    dueDate: new Date(),
                    lineItems: {},
                  },
                });
                const otherPayment = await prisma.payment.create({
                  data: {
                    invoiceId: otherInvoice2.id,
                    customerId: otherSetup4.customer.id,
                    amount: 110,
                    status: 'PAID',
                  },
                });
                unownedResourceId = otherPayment.id;
                break;
              default:
                throw new Error(`Unsupported resource type: ${resourceType}`);
            }

            // Customer should have access to their own resources
            const hasAccessToOwned = await authorizationService.validatePermission(
              customer.userId,
              UserRole.CUSTOMER,
              resourceType,
              ownedResourceId,
              action as 'read' | 'write' | 'delete'
            );
            expect(hasAccessToOwned).toBe(true);

            // Customer should NOT have access to other customers' resources
            const hasAccessToUnowned = await authorizationService.validatePermission(
              customer.userId,
              UserRole.CUSTOMER,
              resourceType,
              unownedResourceId,
              action as 'read' | 'write' | 'delete'
            );
            expect(hasAccessToUnowned).toBe(false);
          }
        ),
        { numRuns: 10 } // Reduced for database operations
      );
    });

    it('should restrict teacher access to read-only on assigned classes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('class', 'enrolment', 'attendance'),
          fc.constantFrom('read', 'write', 'delete'),
          async (resourceType, action) => {
            // Create teacher
            const teacher = await createTestTeacher();

            // Create class assigned to this teacher
            const assignedClass = await createTestClass(teacher.id);

            // Create class assigned to another teacher
            const otherTeacher = await createTestTeacher();
            const unassignedClass = await createTestClass(otherTeacher.id);

            let assignedResourceId: string;
            let unassignedResourceId: string;

            switch (resourceType) {
              case 'class':
                assignedResourceId = assignedClass.id;
                unassignedResourceId = unassignedClass.id;
                break;
              case 'enrolment':
                const dancer1 = (await createTestCustomerWithDancer()).dancer;
                const dancer2 = (await createTestCustomerWithDancer()).dancer;
                const assignedEnrolment = await prisma.enrolment.create({
                  data: {
                    dancerId: dancer1.id,
                    classId: assignedClass.id,
                    status: 'ACTIVE',
                    startDate: new Date(),
                  },
                });
                const unassignedEnrolment = await prisma.enrolment.create({
                  data: {
                    dancerId: dancer2.id,
                    classId: unassignedClass.id,
                    status: 'ACTIVE',
                    startDate: new Date(),
                  },
                });
                assignedResourceId = assignedEnrolment.id;
                unassignedResourceId = unassignedEnrolment.id;
                break;
              case 'attendance':
                const dancer3 = (await createTestCustomerWithDancer()).dancer;
                const dancer4 = (await createTestCustomerWithDancer()).dancer;
                const enrolment1 = await prisma.enrolment.create({
                  data: {
                    dancerId: dancer3.id,
                    classId: assignedClass.id,
                    status: 'ACTIVE',
                    startDate: new Date(),
                  },
                });
                const enrolment2 = await prisma.enrolment.create({
                  data: {
                    dancerId: dancer4.id,
                    classId: unassignedClass.id,
                    status: 'ACTIVE',
                    startDate: new Date(),
                  },
                });
                const assignedAttendance = await prisma.attendanceRecord.create({
                  data: {
                    enrolmentId: enrolment1.id,
                    classId: assignedClass.id,
                    dancerId: dancer3.id,
                    classDate: new Date(),
                    status: 'PRESENT',
                    markedAt: new Date(),
                    markedBy: teacher.id,
                  },
                });
                const unassignedAttendance = await prisma.attendanceRecord.create({
                  data: {
                    enrolmentId: enrolment2.id,
                    classId: unassignedClass.id,
                    dancerId: dancer4.id,
                    classDate: new Date(),
                    status: 'PRESENT',
                    markedAt: new Date(),
                    markedBy: otherTeacher.id,
                  },
                });
                assignedResourceId = assignedAttendance.id;
                unassignedResourceId = unassignedAttendance.id;
                break;
              default:
                throw new Error(`Unsupported resource type: ${resourceType}`);
            }

            // Teacher should have READ access to assigned resources
            const hasReadAccessToAssigned = await authorizationService.validatePermission(
              teacher.userId,
              UserRole.TEACHER,
              resourceType,
              assignedResourceId,
              'read'
            );
            expect(hasReadAccessToAssigned).toBe(true);

            // Teacher should NOT have access to unassigned resources
            const hasAccessToUnassigned = await authorizationService.validatePermission(
              teacher.userId,
              UserRole.TEACHER,
              resourceType,
              unassignedResourceId,
              'read'
            );
            expect(hasAccessToUnassigned).toBe(false);

            // Teacher should NOT have write/delete access even to assigned resources
            if (action !== 'read') {
              const hasWriteAccess = await authorizationService.validatePermission(
                teacher.userId,
                UserRole.TEACHER,
                resourceType,
                assignedResourceId,
                action as 'write' | 'delete'
              );
              expect(hasWriteAccess).toBe(false);
            }
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  /**
   * Property 6: Teacher Class Visibility
   * Feature: dance-school-management-platform
   * For any teacher, the set of visible classes should equal exactly
   * the set of classes assigned to that teacher.
   * **Validates: Requirements 2.3**
   */
  describe('Property 6: Teacher Class Visibility', () => {
    it('should return exactly the set of classes assigned to the teacher', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 5 }), // number of assigned classes
          fc.integer({ min: 0, max: 3 }), // number of unassigned classes
          async (numAssignedClasses, numUnassignedClasses) => {
            // Create teacher
            const teacher = await createTestTeacher();

            // Create classes assigned to this teacher
            const assignedClasses = await Promise.all(
              Array.from({ length: numAssignedClasses }, () => createTestClass(teacher.id))
            );

            // Create classes assigned to other teachers
            const otherTeachers = await Promise.all(
              Array.from({ length: numUnassignedClasses }, () => createTestTeacher())
            );
            const unassignedClasses = await Promise.all(
              otherTeachers.map((otherTeacher) => createTestClass(otherTeacher.id))
            );

            // Get visible classes for the teacher
            const visibleClassIds = await authorizationService.getTeacherClasses(teacher.id);

            // The set of visible classes should equal exactly the set of assigned classes
            const assignedClassIds = assignedClasses.map((c) => c.id);
            const unassignedClassIds = unassignedClasses.map((c) => c.id);

            // Check that all assigned classes are visible
            for (const assignedClassId of assignedClassIds) {
              expect(visibleClassIds).toContain(assignedClassId);
            }

            // Check that no unassigned classes are visible
            for (const unassignedClassId of unassignedClassIds) {
              expect(visibleClassIds).not.toContain(unassignedClassId);
            }

            // Check that the count matches exactly
            expect(visibleClassIds.length).toBe(numAssignedClasses);

            // Check that the sets are equal (no extra classes)
            expect(new Set(visibleClassIds)).toEqual(new Set(assignedClassIds));
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should return empty set when teacher has no assigned classes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null),
          async (_) => {
            // Create teacher with no assigned classes
            const teacher = await createTestTeacher();

            // Get visible classes for the teacher
            const visibleClassIds = await authorizationService.getTeacherClasses(teacher.id);

            // Should return empty array
            expect(visibleClassIds).toEqual([]);
            expect(visibleClassIds.length).toBe(0);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should maintain visibility invariant when classes are added or removed', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 3 }), // initial classes
          fc.integer({ min: 0, max: 2 }), // classes to add
          fc.integer({ min: 0, max: 2 }), // classes to remove
          async (initialCount, addCount, removeCount) => {
            // Create teacher with initial classes
            const teacher = await createTestTeacher();
            const initialClasses = await Promise.all(
              Array.from({ length: initialCount }, () => createTestClass(teacher.id))
            );

            // Verify initial state
            let visibleClassIds = await authorizationService.getTeacherClasses(teacher.id);
            expect(visibleClassIds.length).toBe(initialCount);

            // Add new classes
            const newClasses = await Promise.all(
              Array.from({ length: addCount }, () => createTestClass(teacher.id))
            );

            // Verify after addition
            visibleClassIds = await authorizationService.getTeacherClasses(teacher.id);
            expect(visibleClassIds.length).toBe(initialCount + addCount);

            // All initial and new classes should be visible
            for (const classData of [...initialClasses, ...newClasses]) {
              expect(visibleClassIds).toContain(classData.id);
            }

            // Remove some classes (reassign to another teacher)
            const classesToRemove = initialClasses.slice(0, Math.min(removeCount, initialClasses.length));
            if (classesToRemove.length > 0) {
              const otherTeacher = await createTestTeacher();
              for (const classData of classesToRemove) {
                await prisma.class.update({
                  where: { id: classData.id },
                  data: { teacherId: otherTeacher.id },
                });
              }

              // Verify after removal
              visibleClassIds = await authorizationService.getTeacherClasses(teacher.id);
              const expectedCount = initialCount + addCount - classesToRemove.length;
              expect(visibleClassIds.length).toBe(expectedCount);

              // Removed classes should not be visible
              for (const removedClass of classesToRemove) {
                expect(visibleClassIds).not.toContain(removedClass.id);
              }

              // Remaining classes should still be visible
              const remainingClasses = [
                ...initialClasses.filter((c) => !classesToRemove.includes(c)),
                ...newClasses,
              ];
              for (const classData of remainingClasses) {
                expect(visibleClassIds).toContain(classData.id);
              }
            }
          }
        ),
        { numRuns: 15 }
      );
    });

    it('should verify visibility through canTeacherAccessClass matches getTeacherClasses', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 4 }),
          async (numClasses) => {
            // Create teacher with classes
            const teacher = await createTestTeacher();
            const assignedClasses = await Promise.all(
              Array.from({ length: numClasses }, () => createTestClass(teacher.id))
            );

            // Get visible classes
            const visibleClassIds = await authorizationService.getTeacherClasses(teacher.id);

            // For each visible class, canTeacherAccessClass should return true
            for (const classId of visibleClassIds) {
              const canAccess = await authorizationService.canTeacherAccessClass(
                teacher.id,
                classId
              );
              expect(canAccess).toBe(true);
            }

            // For each assigned class, it should be in the visible set
            for (const classData of assignedClasses) {
              expect(visibleClassIds).toContain(classData.id);
              const canAccess = await authorizationService.canTeacherAccessClass(
                teacher.id,
                classData.id
              );
              expect(canAccess).toBe(true);
            }

            // Create a class for another teacher
            const otherTeacher = await createTestTeacher();
            const otherClass = await createTestClass(otherTeacher.id);

            // Should not be visible
            expect(visibleClassIds).not.toContain(otherClass.id);
            const canAccessOther = await authorizationService.canTeacherAccessClass(
              teacher.id,
              otherClass.id
            );
            expect(canAccessOther).toBe(false);
          }
        ),
        { numRuns: 15 }
      );
    });
  });

  /**
   * Property 7: Teacher Access Restrictions
   * Feature: dance-school-management-platform
   * For any teacher and any admin feature or unassigned class,
   * access attempts should be denied.
   * **Validates: Requirements 2.7**
   */
  describe('Property 7: Teacher Access Restrictions', () => {
    it('should deny teacher access to admin features', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          async (_userId) => {
            // Create teacher user
            const teacher = await createTestTeacher();

            // Teachers should never have admin access
            const canAccessAdmin = await authorizationService.canAccessAdminFeatures(
              teacher.userId,
              UserRole.TEACHER
            );

            expect(canAccessAdmin).toBe(false);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should deny teacher access to other teachers classes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          async (numOtherClasses) => {
            // Create teacher
            const teacher = await createTestTeacher();

            // Create another teacher with multiple classes
            const otherTeacher = await createTestTeacher();
            const otherClasses = await Promise.all(
              Array.from({ length: numOtherClasses }, () => createTestClass(otherTeacher.id))
            );

            // Teacher should not be able to access any of the other teacher's classes
            for (const otherClass of otherClasses) {
              const canAccess = await authorizationService.canAccessOtherTeacherClasses(
                teacher.id,
                otherClass.id
              );
              expect(canAccess).toBe(false);

              // Also verify through canTeacherAccessClass
              const canAccessClass = await authorizationService.canTeacherAccessClass(
                teacher.id,
                otherClass.id
              );
              expect(canAccessClass).toBe(false);
            }
          }
        ),
        { numRuns: 15 }
      );
    });

    it('should allow teacher access only to their own assigned classes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          async (numAssignedClasses) => {
            // Create teacher with multiple assigned classes
            const teacher = await createTestTeacher();
            const assignedClasses = await Promise.all(
              Array.from({ length: numAssignedClasses }, () => createTestClass(teacher.id))
            );

            // Get teacher's classes
            const teacherClassIds = await authorizationService.getTeacherClasses(teacher.id);

            // Should return exactly the assigned classes
            expect(teacherClassIds).toHaveLength(numAssignedClasses);
            expect(new Set(teacherClassIds)).toEqual(new Set(assignedClasses.map(c => c.id)));

            // Teacher should be able to access each assigned class
            for (const assignedClass of assignedClasses) {
              const canAccess = await authorizationService.canTeacherAccessClass(
                teacher.id,
                assignedClass.id
              );
              expect(canAccess).toBe(true);

              const canAccessOther = await authorizationService.canAccessOtherTeacherClasses(
                teacher.id,
                assignedClass.id
              );
              expect(canAccessOther).toBe(true);
            }
          }
        ),
        { numRuns: 15 }
      );
    });

    it('should deny teacher write and delete permissions on all resources', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('class', 'enrolment', 'attendance', 'customer', 'dancer'),
          fc.constantFrom('write', 'delete'),
          async (resourceType, action) => {
            // Create teacher
            const teacher = await createTestTeacher();

            // Create a resource (doesn't matter which, teacher should have no write/delete access)
            const resourceId = fc.sample(fc.uuid(), 1)[0];

            // Teacher should NOT have write or delete access to any resource
            const hasAccess = await authorizationService.validatePermission(
              teacher.userId,
              UserRole.TEACHER,
              resourceType,
              resourceId,
              action as 'write' | 'delete'
            );

            expect(hasAccess).toBe(false);
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});

// Helper functions
async function cleanupTestData() {
  await prisma.attendanceRecord.deleteMany({
    where: {
      dancer: {
        firstName: { contains: 'PBT-Test' },
      },
    },
  });
  await prisma.enrolment.deleteMany({
    where: {
      dancer: {
        firstName: { contains: 'PBT-Test' },
      },
    },
  });
  await prisma.payment.deleteMany({
    where: {
      customer: {
        name: { contains: 'PBT-Test' },
      },
    },
  });
  await prisma.invoice.deleteMany({
    where: {
      customer: {
        name: { contains: 'PBT-Test' },
      },
    },
  });
  await prisma.class.deleteMany({
    where: {
      name: { contains: 'PBT-Test' },
    },
  });
  await prisma.dancer.deleteMany({
    where: {
      firstName: { contains: 'PBT-Test' },
    },
  });
  await prisma.customer.deleteMany({
    where: {
      name: { contains: 'PBT-Test' },
    },
  });
  await prisma.teacher.deleteMany({
    where: {
      name: { contains: 'PBT-Test' },
    },
  });
  await prisma.household.deleteMany({
    where: {
      name: { contains: 'PBT-Test' },
    },
  });
  await prisma.location.deleteMany({
    where: {
      name: { contains: 'PBT-Test' },
    },
  });
  await prisma.pricingRule.deleteMany({
    where: {
      name: { contains: 'PBT-Test' },
    },
  });
  await prisma.userAccount.deleteMany({
    where: {
      email: { contains: '@pbt-auth.test' },
    },
  });
}

async function createTestUser(role: UserRole) {
  const timestamp = Date.now();
  return await prisma.userAccount.create({
    data: {
      email: `user-${timestamp}-${Math.random()}@pbt-auth.test`,
      passwordHash: 'hashed_password',
      role,
    },
  });
}

async function createTestCustomerWithDancer() {
  const timestamp = Date.now();
  const rand = Math.random();

  const household = await prisma.household.create({
    data: {
      name: `PBT-Test-Household-${timestamp}-${rand}`,
    },
  });

  const userAccount = await createTestUser(UserRole.CUSTOMER);

  const customer = await prisma.customer.create({
    data: {
      userId: userAccount.id,
      householdId: household.id,
      name: `PBT-Test-Customer-${timestamp}-${rand}`,
      mobile: '+61400000000',
    },
  });

  const dancer = await prisma.dancer.create({
    data: {
      householdId: household.id,
      firstName: `PBT-Test-Dancer-${timestamp}`,
      lastName: `Test-${rand}`,
      dateOfBirth: new Date('2010-01-01'),
      emergencyContact: {
        name: 'Emergency Contact',
        phone: '+61400000000',
      },
    },
  });

  return { customer, household, dancer, userAccount };
}

async function createTestTeacher() {
  const timestamp = Date.now();
  const rand = Math.random();

  const userAccount = await createTestUser(UserRole.TEACHER);

  const teacher = await prisma.teacher.create({
    data: {
      userId: userAccount.id,
      name: `PBT-Test-Teacher-${timestamp}-${rand}`,
      email: `teacher-${timestamp}-${rand}@pbt-auth.test`,
      specialties: ['Ballet', 'Jazz'],
    },
  });

  return teacher;
}

async function createTestClass(teacherId?: string) {
  const timestamp = Date.now();
  const rand = Math.random();

  // Create location if needed
  const location = await prisma.location.create({
    data: {
      name: `PBT-Test-Location-${timestamp}-${rand}`,
      address: {
        street: '123 Test St',
        city: 'Test City',
        state: 'NSW',
        postcode: '2000',
      },
    },
  });

  // Create pricing rule
  const pricingRule = await prisma.pricingRule.create({
    data: {
      name: `PBT-Test-Pricing-${timestamp}-${rand}`,
      type: 'PER_CLASS',
      classCountMin: 1,
      monthlyFee: 50,
      priority: 1,
    },
  });

  // Create teacher if not provided
  let finalTeacherId = teacherId;
  if (!finalTeacherId) {
    const teacher = await createTestTeacher();
    finalTeacherId = teacher.id;
  }

  const classData = await prisma.class.create({
    data: {
      name: `PBT-Test-Class-${timestamp}-${rand}`,
      style: 'Ballet',
      level: 'Beginner',
      dayOfWeek: 'MONDAY',
      startTime: '10:00',
      duration: 60,
      locationId: location.id,
      teacherId: finalTeacherId,
      capacity: 20,
      pricingRuleId: pricingRule.id,
    },
  });

  return classData;
}
