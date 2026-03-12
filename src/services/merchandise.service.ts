import { PrismaClient, InvoiceStatus } from '@prisma/client';
import { xeroService } from './xero.service';

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

  /**
   * Purchases merchandise items for a customer.
   * - Validates stock availability for all items
   * - Decrements stock for each item
   * - Creates an invoice with merchandise line items
   * - Triggers Xero sync
   * Requirements: 27.1, 27.2, 27.3, 27.4
   */
  async purchaseMerchandise(
    customerId: string,
    items: Array<{ merchandiseItemId: string; quantity: number }>
  ) {
    if (!items || items.length === 0) {
      throw new Error('At least one item is required');
    }

    // Validate customer exists
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      throw new Error('Customer not found');
    }

    // Fetch all merchandise items and validate stock
    const resolvedItems = await Promise.all(
      items.map(async ({ merchandiseItemId, quantity }) => {
        const item = await prisma.merchandiseItem.findUnique({ where: { id: merchandiseItemId } });
        if (!item) {
          throw new Error(`Merchandise item not found: ${merchandiseItemId}`);
        }
        if (!item.isActive) {
          throw new Error(`Merchandise item is not available: ${item.name}`);
        }
        if (item.stockQuantity < quantity) {
          throw new Error(`Insufficient stock for item: ${item.name}`);
        }
        return { item, quantity };
      })
    );

    // Decrement stock for each item
    for (const { item, quantity } of resolvedItems) {
      await prisma.merchandiseItem.update({
        where: { id: item.id },
        data: { stockQuantity: { decrement: quantity } },
      });
    }

    // Build invoice line items
    const lineItems = resolvedItems.map(({ item, quantity }) => ({
      description: `${item.name} (x${quantity})`,
      quantity,
      unitAmount: Number(item.price),
      amount: Number(item.price) * quantity,
      type: 'MERCHANDISE',
      merchandiseItemId: item.id,
      sku: item.sku,
    }));

    const subtotal = lineItems.reduce((sum, li) => sum + li.amount, 0);
    const gstAmount = Math.round(subtotal * 0.1 * 100) / 100;
    const total = Math.round((subtotal + gstAmount) * 100) / 100;

    const idempotencyKey = `merch-${customerId}-${Date.now()}`;
    const dueDate = new Date();

    const invoice = await prisma.invoice.create({
      data: {
        customerId,
        householdId: customer.householdId,
        invoiceNumber: idempotencyKey,
        subtotal,
        discountAmount: 0,
        gstAmount,
        total,
        status: InvoiceStatus.DUE,
        dueDate,
        lineItems: lineItems as unknown as object,
      },
    });

    // Trigger Xero sync (non-blocking — errors are logged internally)
    xeroService.syncInvoice(invoice.id).catch(() => {
      // Sync errors are logged by xeroService; don't fail the purchase
    });

    return { invoice, lineItems };
  }
}

export const merchandiseService = new MerchandiseService();
