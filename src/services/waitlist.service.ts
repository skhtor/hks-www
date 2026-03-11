import { PrismaClient } from '@prisma/client';
import { EnrolmentService } from './enrolment.service';

const prisma = new PrismaClient();
const enrolmentService = new EnrolmentService();

// Offer expiry window in hours (configurable)
const OFFER_EXPIRY_HOURS = 24;

export class WaitlistService {
  /**
   * Joins the waitlist for a class.
   * Assigns the next sequential position for the class.
   * Requirements: 15.1, 15.2
   */
  async joinWaitlist(dancerId: string, classId: string) {
    // Validate dancer and class exist
    const dancer = await prisma.dancer.findUnique({ where: { id: dancerId } });
    if (!dancer) throw new Error('Dancer not found');

    const cls = await prisma.class.findUnique({ where: { id: classId } });
    if (!cls) throw new Error('Class not found');

    // Check dancer is not already on the waitlist for this class
    const existing = await prisma.waitlistEntry.findFirst({
      where: { dancerId, classId },
    });
    if (existing) throw new Error('Dancer is already on the waitlist for this class');

    // Check dancer is not already actively enrolled
    const activeEnrolment = await prisma.enrolment.findFirst({
      where: { dancerId, classId, status: 'ACTIVE' },
    });
    if (activeEnrolment) throw new Error('Dancer is already enrolled in this class');

    return prisma.$transaction(async (tx) => {
      // Get the next position atomically
      const lastEntry = await tx.waitlistEntry.findFirst({
        where: { classId },
        orderBy: { position: 'desc' },
      });
      const nextPosition = (lastEntry?.position ?? 0) + 1;

      return tx.waitlistEntry.create({
        data: {
          dancerId,
          classId,
          position: nextPosition,
        },
        include: {
          dancer: true,
          class: true,
        },
      });
    });
  }

  /**
   * Gets the waitlist for a class, ordered by position.
   * Requirements: 15.2
   */
  async getWaitlist(classId: string) {
    return prisma.waitlistEntry.findMany({
      where: { classId },
      orderBy: { position: 'asc' },
      include: {
        dancer: true,
        class: true,
      },
    });
  }

  /**
   * Gets a dancer's position on the waitlist for a class.
   */
  async getWaitlistPosition(dancerId: string, classId: string) {
    return prisma.waitlistEntry.findFirst({
      where: { dancerId, classId },
      include: { dancer: true, class: true },
    });
  }

  /**
   * Removes a dancer from the waitlist and re-sequences positions.
   */
  async leaveWaitlist(entryId: string) {
    const entry = await prisma.waitlistEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new Error('Waitlist entry not found');

    return prisma.$transaction(async (tx) => {
      await tx.waitlistEntry.delete({ where: { id: entryId } });

      // Re-sequence positions for entries after the removed one
      const remaining = await tx.waitlistEntry.findMany({
        where: { classId: entry.classId, position: { gt: entry.position } },
        orderBy: { position: 'asc' },
      });

      for (let i = 0; i < remaining.length; i++) {
        await tx.waitlistEntry.update({
          where: { id: remaining[i].id },
          data: { position: entry.position + i },
        });
      }
    });
  }

  /**
   * Offers the next spot to the first person on the waitlist.
   * Sets an expiry time for the offer.
   * Requirements: 15.3, 15.4
   */
  async offerNextSpot(classId: string) {
    const cls = await prisma.class.findUnique({ where: { id: classId } });
    if (!cls) throw new Error('Class not found');

    // Only offer if there is capacity
    if (cls.enrolledCount >= cls.capacity) {
      throw new Error('Class is still at full capacity');
    }

    const nextEntry = await prisma.waitlistEntry.findFirst({
      where: { classId },
      orderBy: { position: 'asc' },
      include: { dancer: true },
    });

    if (!nextEntry) return null; // No one on waitlist

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + OFFER_EXPIRY_HOURS);

    return prisma.waitlistEntry.update({
      where: { id: nextEntry.id },
      data: { expiresAt },
      include: { dancer: true, class: true },
    });
  }

  /**
   * Accepts a waitlist offer — converts the waitlist entry into an active enrolment.
   * Requirements: 15.3, 15.5
   */
  async acceptOffer(entryId: string, adminUserId: string) {
    const entry = await prisma.waitlistEntry.findUnique({
      where: { id: entryId },
      include: { dancer: true, class: true },
    });
    if (!entry) throw new Error('Waitlist entry not found');

    if (!entry.expiresAt) throw new Error('No offer has been made for this entry');

    if (new Date() > entry.expiresAt) {
      throw new Error('Offer has expired');
    }

    return prisma.$transaction(async (tx) => {
      // Create the enrolment (capacity check inside)
      const enrolment = await enrolmentService.createEnrolment({
        dancerId: entry.dancerId,
        classId: entry.classId,
        startDate: new Date(),
      });

      // Remove from waitlist
      await tx.waitlistEntry.delete({ where: { id: entryId } });

      // Re-sequence remaining entries
      const remaining = await tx.waitlistEntry.findMany({
        where: { classId: entry.classId },
        orderBy: { position: 'asc' },
      });
      for (let i = 0; i < remaining.length; i++) {
        await tx.waitlistEntry.update({
          where: { id: remaining[i].id },
          data: { position: i + 1 },
        });
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          userId: adminUserId,
          action: 'WAITLIST_OFFER_ACCEPTED',
          entityType: 'WaitlistEntry',
          entityId: entryId,
          changes: {
            dancerId: entry.dancerId,
            classId: entry.classId,
            enrolmentId: enrolment.id,
          },
        },
      });

      return enrolment;
    });
  }

  /**
   * Expires stale offers and progresses the queue.
   * Requirements: 15.5
   */
  async processExpiredOffers() {
    const expired = await prisma.waitlistEntry.findMany({
      where: {
        expiresAt: { lt: new Date(), not: null },
      },
    });

    for (const entry of expired) {
      // Clear the expiry — they stay on the waitlist but lose their offer
      await prisma.waitlistEntry.update({
        where: { id: entry.id },
        data: { expiresAt: null },
      });
    }

    return expired.length;
  }
}

export const waitlistService = new WaitlistService();
