import { CustomerService } from '../../services/customer.service';
import { AuthService } from '../../services/auth.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const customerService = new CustomerService();
const authService = new AuthService();

const TEST_DOMAIN = '@customer-test.example.com';

describe('CustomerService', () => {
  beforeAll(async () => {
    // Clean up any leftover test data
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

  async function createTestUser(suffix: string) {
    const email = `${suffix}${Date.now()}${TEST_DOMAIN}`;
    const result = await authService.register({ email, password: 'SecurePass123!' });
    return result.user;
  }

  describe('createCustomer', () => {
    it('should create a customer profile with a household', async () => {
      const user = await createTestUser('create');

      const customer = await customerService.createCustomer({
        userId: user.id,
        name: 'Jane Smith',
        mobile: '0412345678',
      });

      expect(customer.id).toBeDefined();
      expect(customer.name).toBe('Jane Smith');
      expect(customer.mobile).toBe('0412345678');
      expect(customer.userId).toBe(user.id);
      expect(customer.household).toBeDefined();
      expect(customer.household.name).toBe('Jane Smith');
    });

    it('should create a customer with an address', async () => {
      const user = await createTestUser('addr');

      const customer = await customerService.createCustomer({
        userId: user.id,
        name: 'Bob Jones',
        mobile: '0498765432',
        address: { street: '1 Main St', suburb: 'Sydney', state: 'NSW', postcode: '2000' },
      });

      expect(customer.address).toMatchObject({ street: '1 Main St', suburb: 'Sydney' });
    });

    it('should reject duplicate customer profile for same user', async () => {
      const user = await createTestUser('dup');

      await customerService.createCustomer({ userId: user.id, name: 'Test', mobile: '0400000000' });

      await expect(
        customerService.createCustomer({ userId: user.id, name: 'Test2', mobile: '0400000001' })
      ).rejects.toThrow('Customer profile already exists for this user');
    });
  });

  describe('getCustomerByUserId', () => {
    it('should return customer with household and dancers', async () => {
      const user = await createTestUser('get');
      await customerService.createCustomer({ userId: user.id, name: 'Alice', mobile: '0411111111' });

      const customer = await customerService.getCustomerByUserId(user.id);

      expect(customer.name).toBe('Alice');
      expect(customer.household).toBeDefined();
      expect(Array.isArray(customer.household.dancers)).toBe(true);
    });

    it('should throw if customer not found', async () => {
      await expect(customerService.getCustomerByUserId('non-existent-id')).rejects.toThrow(
        'Customer profile not found'
      );
    });
  });

  describe('updateCustomer', () => {
    it('should update customer profile and persist immediately', async () => {
      const user = await createTestUser('update');
      const created = await customerService.createCustomer({
        userId: user.id,
        name: 'Old Name',
        mobile: '0400000000',
      });

      const updated = await customerService.updateCustomer(created.id, {
        name: 'New Name',
        mobile: '0499999999',
      });

      expect(updated.name).toBe('New Name');
      expect(updated.mobile).toBe('0499999999');

      // Verify persistence - read back
      const fetched = await customerService.getCustomerById(created.id);
      expect(fetched.name).toBe('New Name');
    });

    it('should throw if customer not found', async () => {
      await expect(
        customerService.updateCustomer('non-existent-id', { name: 'Test' })
      ).rejects.toThrow('Customer profile not found');
    });
  });

  describe('addDancer', () => {
    let customerId: string;

    beforeAll(async () => {
      const user = await createTestUser('dancer');
      const customer = await customerService.createCustomer({
        userId: user.id,
        name: 'Parent',
        mobile: '0400000000',
      });
      customerId = customer.id;
    });

    it('should add a dancer with required fields', async () => {
      const dancer = await customerService.addDancer(customerId, {
        firstName: 'Emma',
        lastName: 'Smith',
        dateOfBirth: new Date('2015-06-15'),
        emergencyContact: { name: 'Parent', phone: '0400000000', relationship: 'Parent' },
      });

      expect(dancer.id).toBeDefined();
      expect(dancer.firstName).toBe('Emma');
      expect(dancer.lastName).toBe('Smith');
      expect(dancer.photoConsent).toBe(false);
    });

    it('should add a dancer with optional fields', async () => {
      const dancer = await customerService.addDancer(customerId, {
        firstName: 'Lily',
        lastName: 'Jones',
        dateOfBirth: new Date('2013-03-20'),
        emergencyContact: { name: 'Parent', phone: '0400000001', relationship: 'Parent' },
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

    it('should throw if customer not found', async () => {
      await expect(
        customerService.addDancer('non-existent-id', {
          firstName: 'Test',
          lastName: 'Test',
          dateOfBirth: new Date('2015-01-01'),
          emergencyContact: { name: 'P', phone: '0400000000', relationship: 'Parent' },
        })
      ).rejects.toThrow('Customer profile not found');
    });
  });

  describe('updateDancer', () => {
    let customerId: string;
    let dancerId: string;

    beforeAll(async () => {
      const user = await createTestUser('updatedancer');
      const customer = await customerService.createCustomer({
        userId: user.id,
        name: 'Parent2',
        mobile: '0400000002',
      });
      customerId = customer.id;

      const dancer = await customerService.addDancer(customerId, {
        firstName: 'Original',
        lastName: 'Name',
        dateOfBirth: new Date('2014-01-01'),
        emergencyContact: { name: 'P', phone: '0400000000', relationship: 'Parent' },
      });
      dancerId = dancer.id;
    });

    it('should update dancer fields', async () => {
      const updated = await customerService.updateDancer(customerId, dancerId, {
        firstName: 'Updated',
        skillLevel: 'intermediate',
      });

      expect(updated.firstName).toBe('Updated');
      expect(updated.skillLevel).toBe('intermediate');
      expect(updated.lastName).toBe('Name'); // unchanged
    });

    it('should reject update for dancer not in household', async () => {
      await expect(
        customerService.updateDancer(customerId, 'non-existent-dancer-id', { firstName: 'X' })
      ).rejects.toThrow('Dancer not found');
    });
  });

  describe('getDancers', () => {
    it('should return all dancers in household', async () => {
      const user = await createTestUser('getdancers');
      const customer = await customerService.createCustomer({
        userId: user.id,
        name: 'Family',
        mobile: '0400000003',
      });

      await customerService.addDancer(customer.id, {
        firstName: 'Child1',
        lastName: 'Family',
        dateOfBirth: new Date('2012-01-01'),
        emergencyContact: { name: 'P', phone: '0400000000', relationship: 'Parent' },
      });
      await customerService.addDancer(customer.id, {
        firstName: 'Child2',
        lastName: 'Family',
        dateOfBirth: new Date('2014-01-01'),
        emergencyContact: { name: 'P', phone: '0400000000', relationship: 'Parent' },
      });

      const dancers = await customerService.getDancers(customer.id);
      expect(dancers.length).toBe(2);
    });
  });
});
