import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface CreateMerchandiseInput {
  name: string;
  description?: string;
  price: number;
  stockQuantity?: number;
  sku: string;
  isActive?: boolean;
}

export interface UpdateMerchandiseInput {
  name?: string;
  description?: string;
  price?: number;
  stockQuantity?: number;
  sku?: string;
  isActive?: boolean;
}

export class MerchandiseService {
  /**
   * Creates a new merchandise item.
   * Requirements: 27.1
   */
  async createItem(input: CreateMerchandiseInput) {
    const existing = await prisma.merchandiseItem.findUnique({ where: { sku: input.sku } });
    if (existing) {
      throw new Error('SKU already exists');
    }

    return prisma.merchandiseItem.create({
      data: {
        name: input.name,
        description: input.description,
        price: input.price,
        stockQuantity: input.stockQuantity ?? 0,
        sku: input.sku,
        isActive: input.isActive ?? true,
      },
    });
  }

  /**
   * Returns all merchandise items.
   * Requirements: 27.1
   */
  async getAllItems(activeOnly = false) {
    return prisma.merchandiseItem.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Returns a single merchandise item by ID.
   * Requirements: 27.1
   */
  async getItemById(id: string) {
    const item = await prisma.merchandiseItem.findUnique({ where: { id } });
    if (!item) {
      throw new Error('Merchandise item not found');
    }
    return item;
  }

  /**
   * Updates a merchandise item.
   * Requirements: 27.1
   */
  async updateItem(id: string, input: UpdateMerchandiseInput) {
    const item = await prisma.merchandiseItem.findUnique({ where: { id } });
    if (!item) {
      throw new Error('Merchandise item not found');
    }

    if (input.sku && input.sku !== item.sku) {
      const existing = await prisma.merchandiseItem.findUnique({ where: { sku: input.sku } });
      if (existing) {
        throw new Error('SKU already exists');
      }
    }

    return prisma.merchandiseItem.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.price !== undefined && { price: input.price }),
        ...(input.stockQuantity !== undefined && { stockQuantity: input.stockQuantity }),
        ...(input.sku !== undefined && { sku: input.sku }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });
  }

  /**
   * Deletes a merchandise item.
   * Requirements: 27.1
   */
  async deleteItem(id: string) {
    const item = await prisma.merchandiseItem.findUnique({ where: { id } });
    if (!item) {
      throw new Error('Merchandise item not found');
    }
    await prisma.merchandiseItem.delete({ where: { id } });
  }

  /**
   * Decrements stock quantity for a merchandise item.
   * Requirements: 27.5
   */
  async decrementStock(id: string, quantity: number) {
    const item = await prisma.merchandiseItem.findUnique({ where: { id } });
    if (!item) {
      throw new Error('Merchandise item not found');
    }
    if (item.stockQuantity < quantity) {
      throw new Error('Insufficient stock');
    }
    return prisma.merchandiseItem.update({
      where: { id },
      data: { stockQuantity: { decrement: quantity } },
    });
  }

  /**
   * Increments stock quantity for a merchandise item.
   * Requirements: 27.5
   */
  async incrementStock(id: string, quantity: number) {
    const item = await prisma.merchandiseItem.findUnique({ where: { id } });
    if (!item) {
      throw new Error('Merchandise item not found');
    }
    return prisma.merchandiseItem.update({
      where: { id },
      data: { stockQuantity: { increment: quantity } },
    });
  }
}

export const merchandiseService = new MerchandiseService();
