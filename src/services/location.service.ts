import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface CreateLocationInput {
  name: string;
  address: {
    street?: string;
    suburb?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
  contactPhone?: string;
}

export interface UpdateLocationInput {
  name?: string;
  address?: {
    street?: string;
    suburb?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
  contactPhone?: string;
}

export class LocationService {
  /**
   * Creates a new location.
   * Requirements: 28.1
   */
  async createLocation(input: CreateLocationInput) {
    return prisma.location.create({
      data: {
        name: input.name,
        address: input.address,
        contactPhone: input.contactPhone,
      },
    });
  }

  /**
   * Returns all locations.
   * Requirements: 28.1
   */
  async getAllLocations() {
    return prisma.location.findMany({
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Returns a single location by ID.
   * Requirements: 28.1
   */
  async getLocationById(id: string) {
    const location = await prisma.location.findUnique({ where: { id } });
    if (!location) {
      throw new Error('Location not found');
    }
    return location;
  }

  /**
   * Updates a location.
   * Requirements: 28.1
   */
  async updateLocation(id: string, input: UpdateLocationInput) {
    const location = await prisma.location.findUnique({ where: { id } });
    if (!location) {
      throw new Error('Location not found');
    }

    return prisma.location.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.address !== undefined && { address: input.address }),
        ...(input.contactPhone !== undefined && { contactPhone: input.contactPhone }),
      },
    });
  }

  /**
   * Deletes a location.
   * Requirements: 28.1
   */
  async deleteLocation(id: string) {
    const location = await prisma.location.findUnique({ where: { id } });
    if (!location) {
      throw new Error('Location not found');
    }

    const classCount = await prisma.class.count({ where: { locationId: id } });
    if (classCount > 0) {
      throw new Error('Cannot delete location with associated classes');
    }

    await prisma.location.delete({ where: { id } });
  }
}

export const locationService = new LocationService();
