import { DancerService } from '../../services/dancer.service';
import { CustomerService } from '../../services/customer.service';
import { AuthService } from '../../services/auth.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const dancerService = new DancerService();
const customerService = new CustomerService();
const authService = new AuthService();

const TEST_DOMAIN = '@dancer-service-test.example.com';

describe('DancerService', () => {
  beforeAll(async () => {
    await prisma.dancer.deleteMany({
      where: { household: { customers: { some: { user: { email: { contains: TEST_DOMAIN } } } } } },
    });
    await prisma.customer.deleteMany({
      where: { user: { email: { contains: TEST_DOMAIN } } },
    });
    await prisma.userAccount.deleteMany({
      where: { email: { contains: TEST_DOMAIN } },
    });
  });

  afterAll(async () => {
    await prisma.dancer.deleteMany({
      where: { household: { customers: { some: { user: { email: { contains: TEST_DOMAIN } } } } } },
    });
    await prisma.customer.deleteMany({
      where: { user: { email: { contains: TEST_DOMAIN } } },
    });
    await prisma.userAccount.deleteMany({
      where: { email: { contains: TEST_DOMAIN } },
    });
    await prisma.$disconnect();
  });

  async function createTestCustomer(suffix: string) {
    const email = `${suffix}${Date.now()}${TEST_DOMAIN}`;
    const { user } = await authService.register({ email, password: 'SecurePass123!' });
    const customer = await customerService.createCustomer({
      userId: user.id,
      name: 'Test Parent',
      mobile: '0400000000',
    });
    return customer;
  }

  const baseInput = {
    firstName: 'Emma',
    lastName: 'Smith',
    dateOfBirth: new Date('2015-06-15'),
    emergencyContact: { name: 'Parent', phone: '0400000000', relationship: 'Parent' },
  };

  describe('addDancer', () => {
    it('should create a dancer with required fields (Req 1.4)', async () => {
      const customer = await createTestCustomer('add');

      const dancer = await dancerService.addDancer(customer.id, baseInput);

      expect(dancer.id).toBeDefined();
      expect(dancer.firstName).toBe('Emma');
      expect(dancer.lastName).toBe('Smith');
      expect(dancer.dateOfBirth).toEqual(new Date('2015-06-15'));
      expect(dancer.emergencyContact).toMatchObject({ name: 'Parent', phone: '0400000000' });
      expect(dancer.photoConsent).toBe(false);
    });

    it('should create a dancer with optional fields (Req 1.5)', async () => {
      const customer = await createTestCustomer('addopt');

      const dancer = await dancerService.addDancer(customer.id, {
        ...baseInput,
        medicalNotes: 'Asthma',
        allergies: 'Peanuts',
        photoConsent: true,
        skillLevel: 'beginner',
      });

      expect(dancer.medicalNotes).toBe('Asthma');
      expect(dancer.allergies).toBe('Peanuts');
      expect(dancer.photoConsent).toBe(true);
      expect(dancer.skillLevel).toBe('beginner');
    });

    it('should default photoConsent to false when not provided', async () => {
      const customer = await createTestCustomer('adddefault');
      const dancer = await dancerService.addDancer(customer.id, baseInput);
      expect(dancer.photoConsent).toBe(false);
    });

    it('should throw if customer not found', async () => {
      await expect(
        dancerService.addDancer('non-existent-id', baseInput)
      ).rejects.toThrow('Customer profile not found');
    });
  });

  describe('getDancer', () => {
    it('should return a dancer by id with ownership check', async () => {
      const customer = await createTestCustomer('getone');
      const created = await dancerService.addDancer(customer.id, baseInput);

      const fetched = await dancerService.getDancer(created.id, customer.id);
      expect(fetched.id).toBe(created.id);
      expect(fetched.firstName).toBe('Emma');
    });

    it('should throw if dancer belongs to a different household', async () => {
      const customer1 = await createTestCustomer('getone-c1');
      const customer2 = await createTestCustomer('getone-c2');
      const dancer = await dancerService.addDancer(customer1.id, baseInput);

      await expect(
        dancerService.getDancer(dancer.id, customer2.id)
      ).rejects.toThrow('Dancer not found');
    });

    it('should throw if dancer does not exist', async () => {
      const customer = await createTestCustomer('getone-missing');
      await expect(
        dancerService.getDancer('non-existent-id', customer.id)
      ).rejects.toThrow('Dancer not found');
    });
  });

  describe('getDancersForCustomer', () => {
    it('should return all dancers in the household', async () => {
      const customer = await createTestCustomer('list');

      await dancerService.addDancer(customer.id, { ...baseInput, firstName: 'Child1' });
      await dancerService.addDancer(customer.id, { ...baseInput, firstName: 'Child2' });

      const dancers = await dancerService.getDancersForCustomer(customer.id);
      expect(dancers.length).toBe(2);
    });

    it('should return empty array when no dancers exist', async () => {
      const customer = await createTestCustomer('listempty');
      const dancers = await dancerService.getDancersForCustomer(customer.id);
      expect(dancers).toEqual([]);
    });

    it('should throw if customer not found', async () => {
      await expect(
        dancerService.getDancersForCustomer('non-existent-id')
      ).rejects.toThrow('Customer profile not found');
    });
  });

  describe('updateDancer', () => {
    it('should update dancer fields and persist immediately (Req 1.6)', async () => {
      const customer = await createTestCustomer('update');
      const dancer = await dancerService.addDancer(customer.id, baseInput);

      const updated = await dancerService.updateDancer(dancer.id, customer.id, {
        firstName: 'Updated',
        skillLevel: 'intermediate',
      });

      expect(updated.firstName).toBe('Updated');
      expect(updated.skillLevel).toBe('intermediate');
      expect(updated.lastName).toBe('Smith'); // unchanged

      // Verify persistence
      const fetched = await dancerService.getDancer(dancer.id, customer.id);
      expect(fetched.firstName).toBe('Updated');
    });

    it('should update optional fields (Req 1.5)', async () => {
      const customer = await createTestCustomer('updateopt');
      const dancer = await dancerService.addDancer(customer.id, baseInput);

      const updated = await dancerService.updateDancer(dancer.id, customer.id, {
        medicalNotes: 'Diabetes',
        allergies: 'Gluten',
        photoConsent: true,
      });

      expect(updated.medicalNotes).toBe('Diabetes');
      expect(updated.allergies).toBe('Gluten');
      expect(updated.photoConsent).toBe(true);
    });

    it('should reject update for dancer not in household', async () => {
      const customer1 = await createTestCustomer('update-c1');
      const customer2 = await createTestCustomer('update-c2');
      const dancer = await dancerService.addDancer(customer1.id, baseInput);

      await expect(
        dancerService.updateDancer(dancer.id, customer2.id, { firstName: 'Hacked' })
      ).rejects.toThrow('Dancer not found');
    });
  });

  describe('deleteDancer', () => {
    it('should delete a dancer', async () => {
      const customer = await createTestCustomer('delete');
      const dancer = await dancerService.addDancer(customer.id, baseInput);

      await dancerService.deleteDancer(dancer.id, customer.id);

      const dancers = await dancerService.getDancersForCustomer(customer.id);
      expect(dancers.find((d) => d.id === dancer.id)).toBeUndefined();
    });

    it('should reject deletion for dancer not in household', async () => {
      const customer1 = await createTestCustomer('delete-c1');
      const customer2 = await createTestCustomer('delete-c2');
      const dancer = await dancerService.addDancer(customer1.id, baseInput);

      await expect(
        dancerService.deleteDancer(dancer.id, customer2.id)
      ).rejects.toThrow('Dancer not found');
    });
  });
});
