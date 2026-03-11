import fc from 'fast-check';
import { CustomerService } from '../../services/customer.service';
import { AuthService } from '../../services/auth.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const customerService = new CustomerService();
const authService = new AuthService();

const PBT_DOMAIN = '@customer-pbt.test';

describe('CustomerService Property-Based Tests', () => {
  beforeAll(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  /**
   * Property 3: Profile Update Persistence
   * Feature: dance-school-management-platform
   * For any customer or dancer profile update, immediately reading back the
   * profile should return the updated values (round-trip property).
   * **Validates: Requirements 1.6**
   */
  describe('Property 3: Profile Update Persistence', () => {
    it('should persist customer profile updates immediately (round-trip)', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random customer name updates
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
          // Generate random mobile numbers (Australian format)
          fc.stringMatching(/^04\d{8}$/),
          async (newName, newMobile) => {
            // Create a user and customer to update
            const { customerId } = await createTestCustomer();

            // Perform the update
            const updated = await customerService.updateCustomer(customerId, {
              name: newName,
              mobile: newMobile,
            });

            // Verify the returned value reflects the update
            expect(updated.name).toBe(newName);
            expect(updated.mobile).toBe(newMobile);

            // Immediately read back and verify persistence
            const fetched = await customerService.getCustomerById(customerId);
            expect(fetched.name).toBe(newName);
            expect(fetched.mobile).toBe(newMobile);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should persist customer address updates immediately (round-trip)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            street: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
            suburb: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
            state: fc.constantFrom('NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'),
            postcode: fc.stringMatching(/^\d{4}$/),
          }),
          async (address) => {
            const { customerId } = await createTestCustomer();

            const updated = await customerService.updateCustomer(customerId, { address });

            // Verify returned value
            expect(updated.address).toMatchObject(address);

            // Immediately read back and verify persistence
            const fetched = await customerService.getCustomerById(customerId);
            expect(fetched.address).toMatchObject(address);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should persist dancer profile updates immediately (round-trip)', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random dancer first name updates
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
          // Generate random dancer last name updates
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
          // Generate random skill level
          fc.constantFrom('beginner', 'intermediate', 'advanced', undefined),
          async (firstName, lastName, skillLevel) => {
            const { customerId, dancerId } = await createTestCustomerWithDancer();

            const updateInput: Record<string, unknown> = { firstName, lastName };
            if (skillLevel !== undefined) {
              updateInput.skillLevel = skillLevel;
            }

            const updated = await customerService.updateDancer(
              customerId,
              dancerId,
              updateInput
            );

            // Verify returned value
            expect(updated.firstName).toBe(firstName);
            expect(updated.lastName).toBe(lastName);
            if (skillLevel !== undefined) {
              expect(updated.skillLevel).toBe(skillLevel);
            }

            // Immediately read back and verify persistence
            const dancers = await customerService.getDancers(customerId);
            const fetchedDancer = dancers.find((d) => d.id === dancerId);
            expect(fetchedDancer).toBeDefined();
            expect(fetchedDancer!.firstName).toBe(firstName);
            expect(fetchedDancer!.lastName).toBe(lastName);
            if (skillLevel !== undefined) {
              expect(fetchedDancer!.skillLevel).toBe(skillLevel);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should persist dancer optional fields updates immediately (round-trip)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            medicalNotes: fc.option(
              fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0),
              { nil: undefined }
            ),
            allergies: fc.option(
              fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0),
              { nil: undefined }
            ),
            photoConsent: fc.boolean(),
          }),
          async ({ medicalNotes, allergies, photoConsent }) => {
            const { customerId, dancerId } = await createTestCustomerWithDancer();

            const updateInput: Record<string, unknown> = { photoConsent };
            if (medicalNotes !== undefined) updateInput.medicalNotes = medicalNotes;
            if (allergies !== undefined) updateInput.allergies = allergies;

            const updated = await customerService.updateDancer(
              customerId,
              dancerId,
              updateInput
            );

            // Verify returned value
            expect(updated.photoConsent).toBe(photoConsent);
            if (medicalNotes !== undefined) {
              expect(updated.medicalNotes).toBe(medicalNotes);
            }
            if (allergies !== undefined) {
              expect(updated.allergies).toBe(allergies);
            }

            // Immediately read back and verify persistence
            const dancers = await customerService.getDancers(customerId);
            const fetchedDancer = dancers.find((d) => d.id === dancerId);
            expect(fetchedDancer).toBeDefined();
            expect(fetchedDancer!.photoConsent).toBe(photoConsent);
            if (medicalNotes !== undefined) {
              expect(fetchedDancer!.medicalNotes).toBe(medicalNotes);
            }
            if (allergies !== undefined) {
              expect(fetchedDancer!.allergies).toBe(allergies);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should persist dancer emergency contact updates immediately (round-trip)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
            phone: fc.stringMatching(/^04\d{8}$/),
            relationship: fc.constantFrom('Parent', 'Guardian', 'Grandparent', 'Sibling'),
          }),
          async (emergencyContact) => {
            const { customerId, dancerId } = await createTestCustomerWithDancer();

            const updated = await customerService.updateDancer(customerId, dancerId, {
              emergencyContact,
            });

            // Verify returned value
            expect(updated.emergencyContact).toMatchObject(emergencyContact);

            // Immediately read back and verify persistence
            const dancers = await customerService.getDancers(customerId);
            const fetchedDancer = dancers.find((d) => d.id === dancerId);
            expect(fetchedDancer).toBeDefined();
            expect(fetchedDancer!.emergencyContact).toMatchObject(emergencyContact);
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});

// Helper functions

async function cleanupTestData() {
  await prisma.dancer.deleteMany({
    where: {
      household: {
        customers: {
          some: { user: { email: { contains: PBT_DOMAIN } } },
        },
      },
    },
  });
  await prisma.customer.deleteMany({
    where: { user: { email: { contains: PBT_DOMAIN } } },
  });
  await prisma.userAccount.deleteMany({
    where: { email: { contains: PBT_DOMAIN } },
  });
}

async function createTestCustomer() {
  const timestamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const email = `customer-${timestamp}-${rand}${PBT_DOMAIN}`;

  const { user } = await authService.register({ email, password: 'SecurePass123!' });

  const customer = await customerService.createCustomer({
    userId: user.id,
    name: `PBT-Customer-${timestamp}`,
    mobile: '0400000000',
  });

  return { customerId: customer.id, userId: user.id };
}

async function createTestCustomerWithDancer() {
  const { customerId, userId } = await createTestCustomer();

  const dancer = await customerService.addDancer(customerId, {
    firstName: 'PBT-Dancer',
    lastName: 'Test',
    dateOfBirth: new Date('2012-06-15'),
    emergencyContact: {
      name: 'Test Parent',
      phone: '0400000001',
      relationship: 'Parent',
    },
  });

  return { customerId, userId, dancerId: dancer.id };
}
