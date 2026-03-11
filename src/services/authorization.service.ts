import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

export interface AccessPolicy {
  showMedicalNotes: boolean;
  showAllergies: boolean;
  showEmergencyContact: boolean;
  showDateOfBirth: boolean;
}

// Default access policy configuration
// In production, this would be stored in database and configurable per school/location
const DEFAULT_TEACHER_ACCESS_POLICY: AccessPolicy = {
  showMedicalNotes: true,
  showAllergies: true,
  showEmergencyContact: true,
  showDateOfBirth: false, // Privacy: don't show exact DOB
};

export class AuthorizationService {
  /**
   * Gets the access policy for teacher viewing student information
   * This can be configured per school/location
   * 
   * Requirements: 2.4 - Teachers should display student names and admin-configured
   * sensitive information based on access policy
   */
  async getTeacherAccessPolicy(_teacherId: string): Promise<AccessPolicy> {
    // TODO: In production, fetch from database based on teacher's location/school
    // For now, return the default policy
    return { ...DEFAULT_TEACHER_ACCESS_POLICY };
  }

  /**
   * Updates the teacher access policy (admin only)
   * This would typically be stored in a configuration table
   */
  async updateTeacherAccessPolicy(
    _locationId: string | null,
    policy: Partial<AccessPolicy>
  ): Promise<AccessPolicy> {
    // TODO: In production, store in database
    // For now, return merged policy
    return {
      ...DEFAULT_TEACHER_ACCESS_POLICY,
      ...policy,
    };
  }

  /**
   * Checks if a teacher can access a specific class
   * 
   * Requirements: 2.3, 7.7 - Teachers should only see classes assigned to them
   */
  async canTeacherAccessClass(teacherId: string, classId: string): Promise<boolean> {
    const classRecord = await prisma.class.findUnique({
      where: { id: classId },
    });

    return classRecord ? classRecord.teacherId === teacherId : false;
  }

  /**
   * Gets all classes assigned to a teacher
   * 
   * Requirements: 2.3 - Teachers should only see classes assigned to them
   */
  async getTeacherClasses(teacherId: string): Promise<string[]> {
    const classes = await prisma.class.findMany({
      where: { teacherId },
      select: { id: true },
    });

    return classes.map((c) => c.id);
  }

  /**
   * Gets detailed class information for a teacher
   * Only returns classes assigned to the teacher
   * 
   * Requirements: 2.3, 7.7 - Restrict teacher views to assigned classes only
   */
  async getTeacherClassDetails(teacherId: string) {
    return await prisma.class.findMany({
      where: { teacherId },
      include: {
        location: true,
        enrolments: {
          where: { status: 'ACTIVE' },
          include: {
            dancer: true,
          },
        },
      },
    });
  }

  /**
   * Gets enrolled dancers for a specific class
   * Only returns data if teacher is assigned to the class
   * 
   * Requirements: 2.3, 2.4, 7.7 - Teachers can only view assigned classes
   * and student information is filtered based on access policy
   */
  async getClassRollForTeacher(teacherId: string, classId: string) {
    // First verify teacher has access to this class
    const hasAccess = await this.canTeacherAccessClass(teacherId, classId);
    if (!hasAccess) {
      throw new Error('Teacher does not have access to this class');
    }

    // Get enrolments with dancer information
    const enrolments = await prisma.enrolment.findMany({
      where: {
        classId,
        status: 'ACTIVE',
      },
      include: {
        dancer: true,
      },
    });

    // Get access policy for this teacher
    const policy = await this.getTeacherAccessPolicy(teacherId);

    // Filter dancer information based on policy
    return enrolments.map((enrolment) => ({
      enrolmentId: enrolment.id,
      dancer: this.filterDancerInfo(enrolment.dancer, policy),
    }));
  }

  /**
   * Filters dancer information based on teacher access policy
   * This is a synchronous version that doesn't fetch the policy
   * 
   * Requirements: 2.4 - Display student information based on access policy
   */
  filterDancerInfo(dancerInfo: any, policy: AccessPolicy): any {
    return {
      id: dancerInfo.id,
      firstName: dancerInfo.firstName,
      lastName: dancerInfo.lastName,
      dateOfBirth: policy.showDateOfBirth ? dancerInfo.dateOfBirth : undefined,
      medicalNotes: policy.showMedicalNotes ? dancerInfo.medicalNotes : undefined,
      allergies: policy.showAllergies ? dancerInfo.allergies : undefined,
      emergencyContact: policy.showEmergencyContact
        ? dancerInfo.emergencyContact
        : undefined,
      skillLevel: dancerInfo.skillLevel,
    };
  }

  /**
   * Filters dancer information based on teacher access policy
   * This is the async version that fetches the policy
   * 
   * Requirements: 2.4 - Display student information based on access policy
   */
  async filterDancerInfoForTeacher(
    teacherId: string,
    dancerInfo: any
  ): Promise<any> {
    const policy = await this.getTeacherAccessPolicy(teacherId);
    return this.filterDancerInfo(dancerInfo, policy);
  }

  /**
   * Validates if a user has permission to perform an action on a resource
   */
  async validatePermission(
    userId: string,
    role: UserRole,
    resourceType: string,
    resourceId: string,
    action: 'read' | 'write' | 'delete'
  ): Promise<boolean> {
    // Admin has all permissions
    if (role === UserRole.ADMIN) {
      return true;
    }

    // Customer permissions
    if (role === UserRole.CUSTOMER) {
      return this.validateCustomerPermission(userId, resourceType, resourceId, action);
    }

    // Teacher permissions
    if (role === UserRole.TEACHER) {
      return this.validateTeacherPermission(userId, resourceType, resourceId, action);
    }

    return false;
  }

  /**
   * Validates customer permissions
   */
  private async validateCustomerPermission(
    userId: string,
    resourceType: string,
    resourceId: string,
    _action: string
  ): Promise<boolean> {
    const customer = await prisma.customer.findUnique({
      where: { userId },
      include: { household: { include: { dancers: true } } },
    });

    if (!customer) {
      return false;
    }

    switch (resourceType) {
      case 'customer':
        return customer.id === resourceId;

      case 'dancer':
        return customer.household.dancers.some((d) => d.id === resourceId);

      case 'enrolment':
        const enrolment = await prisma.enrolment.findUnique({
          where: { id: resourceId },
          include: { dancer: true },
        });
        return enrolment
          ? customer.household.dancers.some((d) => d.id === enrolment.dancerId)
          : false;

      case 'invoice':
        return (
          (await prisma.invoice.count({
            where: { id: resourceId, customerId: customer.id },
          })) > 0
        );

      case 'payment':
        return (
          (await prisma.payment.count({
            where: { id: resourceId, customerId: customer.id },
          })) > 0
        );

      default:
        return false;
    }
  }

  /**
   * Validates teacher permissions
   */
  private async validateTeacherPermission(
    userId: string,
    resourceType: string,
    resourceId: string,
    action: string
  ): Promise<boolean> {
    const teacher = await prisma.teacher.findUnique({
      where: { userId },
    });

    if (!teacher) {
      return false;
    }

    // Teachers can only read, not write or delete
    if (action !== 'read') {
      return false;
    }

    switch (resourceType) {
      case 'class':
        return (
          (await prisma.class.count({
            where: { id: resourceId, teacherId: teacher.id },
          })) > 0
        );

      case 'enrolment':
        const enrolment = await prisma.enrolment.findUnique({
          where: { id: resourceId },
          include: { class: true },
        });
        return enrolment ? enrolment.class.teacherId === teacher.id : false;

      case 'attendance':
        const attendance = await prisma.attendanceRecord.findUnique({
          where: { id: resourceId },
          include: { class: true },
        });
        return attendance ? attendance.class.teacherId === teacher.id : false;

      default:
        return false;
    }
  }

  /**
   * Checks if a teacher can access admin features
   * Teachers should never have admin access
   */
  async canAccessAdminFeatures(_userId: string, role: UserRole): Promise<boolean> {
    return role === UserRole.ADMIN;
  }

  /**
   * Checks if a teacher can access other teachers' classes
   * Teachers should only see their own classes
   */
  async canAccessOtherTeacherClasses(
    teacherId: string,
    targetClassId: string
  ): Promise<boolean> {
    const classRecord = await prisma.class.findUnique({
      where: { id: targetClassId },
    });

    if (!classRecord) {
      return false;
    }

    return classRecord.teacherId === teacherId;
  }
}

export const authorizationService = new AuthorizationService();
