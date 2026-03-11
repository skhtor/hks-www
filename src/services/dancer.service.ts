import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface CreateDancerInput {
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  emergencyContact: {
    name: string;
    phone: string;
    relationship: string;
  };
  medicalNotes?: string;
  allergies?: string;
  photoConsent?: boolean;
  skillLevel?: string;
}

export interface UpdateDancerInput {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: Date;
  emergencyContact?: {
    name: string;
    phone: string;
    relationship: string;
  };
  medicalNotes?: string;
  allergies?: string;
  photoConsent?: boolean;
  skillLevel?: string;
}

export class DancerService {
  /**
   * Resolves the customer record for a given userId, throwing if not found.
   */
  private async getCustomerForUser(customerId: string) {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      throw new Error('Customer profile not found');
    }
    return customer;
  }

  /**
   * Resolves a dancer and verifies it belongs to the customer's household.
   */
  private async getDancerWithOwnershipCheck(dancerId: string, customerId: string) {
    const customer = await this.getCustomerForUser(customerId);
    const dancer = await prisma.dancer.findUnique({ where: { id: dancerId } });
    if (!dancer || dancer.householdId !== customer.householdId) {
      throw new Error('Dancer not found');
    }
    return dancer;
  }

  /**
   * Adds a dancer to the customer's household.
   * Requirements: 1.4 - Require first name, last name, DOB, emergency contact
   * Requirements: 1.5 - Optionally collect medical notes, allergies, photo consent, skill level
   */
  async addDancer(customerId: string, input: CreateDancerInput) {
    const customer = await this.getCustomerForUser(customerId);

    return prisma.dancer.create({
      data: {
        householdId: customer.householdId,
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth: input.dateOfBirth,
        emergencyContact: input.emergencyContact,
        medicalNotes: input.medicalNotes,
        allergies: input.allergies,
        photoConsent: input.photoConsent ?? false,
        skillLevel: input.skillLevel,
      },
    });
  }

  /**
   * Gets a specific dancer, verifying ownership.
   * Requirements: 1.6 - Persist changes immediately (read-back)
   */
  async getDancer(dancerId: string, customerId: string) {
    return this.getDancerWithOwnershipCheck(dancerId, customerId);
  }

  /**
   * Lists all dancers in the customer's household.
   * Requirements: 1.3 - Customers can manage dancer profiles in their household
   */
  async getDancersForCustomer(customerId: string) {
    const customer = await this.getCustomerForUser(customerId);
    return prisma.dancer.findMany({
      where: { householdId: customer.householdId },
    });
  }

  /**
   * Updates a dancer profile, verifying ownership.
   * Requirements: 1.5, 1.6 - Optional fields and immediate persistence
   */
  async updateDancer(dancerId: string, customerId: string, input: UpdateDancerInput) {
    await this.getDancerWithOwnershipCheck(dancerId, customerId);

    return prisma.dancer.update({
      where: { id: dancerId },
      data: {
        ...(input.firstName !== undefined && { firstName: input.firstName }),
        ...(input.lastName !== undefined && { lastName: input.lastName }),
        ...(input.dateOfBirth !== undefined && { dateOfBirth: input.dateOfBirth }),
        ...(input.emergencyContact !== undefined && { emergencyContact: input.emergencyContact }),
        ...(input.medicalNotes !== undefined && { medicalNotes: input.medicalNotes }),
        ...(input.allergies !== undefined && { allergies: input.allergies }),
        ...(input.photoConsent !== undefined && { photoConsent: input.photoConsent }),
        ...(input.skillLevel !== undefined && { skillLevel: input.skillLevel }),
      },
    });
  }

  /**
   * Deletes a dancer, verifying ownership and no active enrolments.
   */
  async deleteDancer(dancerId: string, customerId: string) {
    await this.getDancerWithOwnershipCheck(dancerId, customerId);

    const activeEnrolments = await prisma.enrolment.count({
      where: { dancerId, status: 'ACTIVE' },
    });

    if (activeEnrolments > 0) {
      throw new Error('Cannot delete dancer with active enrolments');
    }

    await prisma.dancer.delete({ where: { id: dancerId } });
  }
}

export const dancerService = new DancerService();
