import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface CreateCustomerInput {
  userId: string;
  name: string;
  mobile: string;
  address?: {
    street?: string;
    suburb?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
}

export interface UpdateCustomerInput {
  name?: string;
  mobile?: string;
  address?: {
    street?: string;
    suburb?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
}

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

export class CustomerService {
  /**
   * Creates a customer profile with a new household
   * Requirements: 1.3 - Allow customers to add dancer profiles to their household
   */
  async createCustomer(input: CreateCustomerInput) {
    const { userId, name, mobile, address } = input;

    // Check if customer already exists for this user
    const existing = await prisma.customer.findUnique({ where: { userId } });
    if (existing) {
      throw new Error('Customer profile already exists for this user');
    }

    // Create household and customer in a transaction
    return prisma.$transaction(async (tx) => {
      const household = await tx.household.create({
        data: { name },
      });

      const customer = await tx.customer.create({
        data: {
          userId,
          householdId: household.id,
          name,
          mobile,
          address: address ?? undefined,
        },
        include: { household: true },
      });

      return customer;
    });
  }

  /**
   * Gets a customer profile by userId
   * Requirements: 1.6 - Persist profile changes immediately
   */
  async getCustomerByUserId(userId: string) {
    const customer = await prisma.customer.findUnique({
      where: { userId },
      include: { household: { include: { dancers: true } } },
    });

    if (!customer) {
      throw new Error('Customer profile not found');
    }

    return customer;
  }

  /**
   * Gets a customer profile by customerId
   */
  async getCustomerById(customerId: string) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: { household: { include: { dancers: true } } },
    });

    if (!customer) {
      throw new Error('Customer profile not found');
    }

    return customer;
  }

  /**
   * Updates a customer profile
   * Requirements: 1.6 - Persist profile changes immediately
   */
  async updateCustomer(customerId: string, input: UpdateCustomerInput) {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      throw new Error('Customer profile not found');
    }

    return prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.mobile !== undefined && { mobile: input.mobile }),
        ...(input.address !== undefined && { address: input.address }),
      },
      include: { household: true },
    });
  }

  /**
   * Adds a dancer to the customer's household
   * Requirements: 1.3, 1.4 - Allow adding dancer profiles with required fields
   */
  async addDancer(customerId: string, input: CreateDancerInput) {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      throw new Error('Customer profile not found');
    }

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
   * Gets all dancers in a customer's household
   * Requirements: 1.3 - Customers can manage dancer profiles in their household
   */
  async getDancers(customerId: string) {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      throw new Error('Customer profile not found');
    }

    return prisma.dancer.findMany({
      where: { householdId: customer.householdId },
    });
  }

  /**
   * Updates a dancer profile
   * Requirements: 1.5, 1.6 - Optional fields and immediate persistence
   */
  async updateDancer(customerId: string, dancerId: string, input: UpdateDancerInput) {
    // Verify dancer belongs to customer's household
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      throw new Error('Customer profile not found');
    }

    const dancer = await prisma.dancer.findUnique({ where: { id: dancerId } });
    if (!dancer || dancer.householdId !== customer.householdId) {
      throw new Error('Dancer not found');
    }

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
   * Removes a dancer from the household
   */
  async removeDancer(customerId: string, dancerId: string) {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      throw new Error('Customer profile not found');
    }

    const dancer = await prisma.dancer.findUnique({ where: { id: dancerId } });
    if (!dancer || dancer.householdId !== customer.householdId) {
      throw new Error('Dancer not found');
    }

    // Check for active enrolments
    const activeEnrolments = await prisma.enrolment.count({
      where: { dancerId, status: 'ACTIVE' },
    });

    if (activeEnrolments > 0) {
      throw new Error('Cannot remove dancer with active enrolments');
    }

    await prisma.dancer.delete({ where: { id: dancerId } });
  }
}

export const customerService = new CustomerService();
