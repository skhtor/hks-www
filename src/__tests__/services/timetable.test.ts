import request from 'supertest';
import { PrismaClient, DayOfWeek } from '@prisma/client';
import { createApp } from '../../app';
import { ClassService } from '../../services/class.service';
import { TeacherService } from '../../services/teacher.service';

const prisma = new PrismaClient();
const classService = new ClassService();
const teacherService = new TeacherService();
const app = createApp();

const TEST_DOMAIN = '@timetable-test.example.com';

describe('Timetable Endpoints', () => {
  let teacherId: string;
  let locationId: string;
  let pricingRuleId: string;
  let slotCounter = 0;

  function nextSlot(): { dayOfWeek: DayOfWeek; startTime: string } {
    const days: DayOfWeek[] = [
      DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY,
      DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY, DayOfWeek.SUNDAY,
    ];
    const idx = slotCounter++;
    const day = days[Math.floor(idx / 10) % days.length];
    const hour = 8 + (idx % 10);
    return { dayOfWeek: day, startTime: `${String(hour).padStart(2, '0')}:00` };
  }

  async function createClass(overrides: Record<string, unknown> = {}) {
    const slot = nextSlot();
    return classService.createClass({
      name: 'Test Class',
      style: 'Ballet',
      level: 'Beginner',
      duration: 45,
      locationId,
      teacherId,
      capacity: 10,
      pricingRuleId,
      ...slot,
      ...overrides,
    } as Parameters<typeof classService.createClass>[0]);
  }

  beforeAll(async () => {
    await prisma.class.deleteMany({
      where: { teacher: { user: { email: { contains: TEST_DOMAIN } } } },
    });
    await prisma.teacher.deleteMany({
      where: { user: { email: { contains: TEST_DOMAIN } } },
    });
    await prisma.userAccount.deleteMany({ where: { email: { contains: TEST_DOMAIN } } });

    const teacher = await teacherService.createTeacher({
      email: `teacher${Date.now()}${TEST_DOMAIN}`,
      password: 'SecurePass123!',
      name: 'Timetable Teacher',
    });
    teacherId = teacher.id;

    const location = await prisma.location.create({
      data: {
        name: 'Timetable Studio',
        address: { street: '1 Test St', suburb: 'Testville', state: 'VIC', postcode: '3000' },
      },
    });
    locationId = location.id;

    const pricingRule = await prisma.pricingRule.create({
      data: { name: 'Timetable Standard', type: 'PER_CLASS', classCountMin: 1, monthlyFee: 80, priority: 1 },
    });
    pricingRuleId = pricingRule.id;
  });

  afterAll(async () => {
    await prisma.class.deleteMany({
      where: { teacher: { user: { email: { contains: TEST_DOMAIN } } } },
    });
    await prisma.teacher.deleteMany({
      where: { user: { email: { contains: TEST_DOMAIN } } },
    });
    await prisma.userAccount.deleteMany({ where: { email: { contains: TEST_DOMAIN } } });
    await prisma.location.deleteMany({ where: { name: 'Timetable Studio' } });
    await prisma.pricingRule.deleteMany({ where: { name: 'Timetable Standard' } });
    await prisma.$disconnect();
  });

  describe('GET /api/timetable', () => {
    it('should return 200 with list view by default (Req 3.1)', async () => {
      await createClass({ name: 'List View Class' });

      const res = await request(app).get('/api/timetable');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should return week view grouped by day when view=week (Req 3.1)', async () => {
      await createClass({ name: 'Week View Class' });

      const res = await request(app).get('/api/timetable?view=week');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Week view returns an object keyed by day
      expect(typeof res.body.data).toBe('object');
      expect(Array.isArray(res.body.data)).toBe(false);
    });

    it('should only return active classes (endDate null or future) (Req 3.1)', async () => {
      const past = new Date();
      past.setDate(past.getDate() - 1);

      const active = await createClass({ name: 'Active Class TT', endDate: undefined });
      const expired = await createClass({ name: 'Expired Class TT', endDate: past });

      const res = await request(app).get('/api/timetable');
      expect(res.status).toBe(200);

      const ids = (res.body.data as Array<{ id: string }>).map((c) => c.id);
      expect(ids).toContain(active.id);
      expect(ids).not.toContain(expired.id);
    });

    it('should filter by style query param (Req 3.2)', async () => {
      await createClass({ name: 'Tap Filter Class', style: 'Tap' });

      const res = await request(app).get('/api/timetable?style=Tap');
      expect(res.status).toBe(200);
      const classes = res.body.data as Array<{ style: string }>;
      expect(classes.every((c) => c.style === 'Tap')).toBe(true);
    });

    it('should filter by level query param (Req 3.2)', async () => {
      await createClass({ name: 'Advanced Filter Class', level: 'Advanced' });

      const res = await request(app).get('/api/timetable?level=Advanced');
      expect(res.status).toBe(200);
      const classes = res.body.data as Array<{ level: string }>;
      expect(classes.every((c) => c.level === 'Advanced')).toBe(true);
    });

    it('should filter by locationId query param (Req 3.2)', async () => {
      const otherLocation = await prisma.location.create({
        data: {
          name: 'Other Studio TT',
          address: { street: '2 Other St', suburb: 'Otherville', state: 'VIC', postcode: '3001' },
        },
      });

      await createClass({ name: 'Location Filter Class', locationId: otherLocation.id });

      const res = await request(app).get(`/api/timetable?locationId=${otherLocation.id}`);
      expect(res.status).toBe(200);
      const classes = res.body.data as Array<{ locationId: string }>;
      expect(classes.length).toBeGreaterThan(0);
      expect(classes.every((c) => c.locationId === otherLocation.id)).toBe(true);

      await prisma.class.deleteMany({ where: { locationId: otherLocation.id } });
      await prisma.location.delete({ where: { id: otherLocation.id } });
    });

    it('should filter by teacherId query param (Req 3.2)', async () => {
      const otherTeacher = await teacherService.createTeacher({
        email: `other-teacher${Date.now()}${TEST_DOMAIN}`,
        password: 'SecurePass123!',
        name: 'Other Teacher TT',
      });

      await createClass({ name: 'Teacher Filter Class', teacherId: otherTeacher.id });

      const res = await request(app).get(`/api/timetable?teacherId=${otherTeacher.id}`);
      expect(res.status).toBe(200);
      const classes = res.body.data as Array<{ teacherId: string }>;
      expect(classes.length).toBeGreaterThan(0);
      expect(classes.every((c) => c.teacherId === otherTeacher.id)).toBe(true);
    });

    it('should filter by dayOfWeek query param (Req 3.2)', async () => {
      await createClass({ name: 'Wednesday Filter Class', dayOfWeek: DayOfWeek.WEDNESDAY, startTime: '14:00' });

      const res = await request(app).get('/api/timetable?dayOfWeek=WEDNESDAY');
      expect(res.status).toBe(200);
      const classes = res.body.data as Array<{ dayOfWeek: string }>;
      expect(classes.length).toBeGreaterThan(0);
      expect(classes.every((c) => c.dayOfWeek === 'WEDNESDAY')).toBe(true);
    });

    it('should filter by ageGroup — include classes where ageRange covers the age (Req 3.2)', async () => {
      await createClass({ name: 'Age 8-12 Class', ageRange: { min: 8, max: 12 } });
      await createClass({ name: 'Age 14-18 Class', ageRange: { min: 14, max: 18 } });
      await createClass({ name: 'No Age Range Class', ageRange: undefined });

      const res = await request(app).get('/api/timetable?ageGroup=10');
      expect(res.status).toBe(200);
      const classes = res.body.data as Array<{ name: string; ageRange: { min: number; max: number } | null }>;

      const names = classes.map((c) => c.name);
      // Should include the 8-12 class and the no-age-range class
      expect(names).toContain('Age 8-12 Class');
      expect(names).toContain('No Age Range Class');
      // Should NOT include the 14-18 class
      expect(names).not.toContain('Age 14-18 Class');
    });

    it('should filter by ageGroup — exclude classes where age is outside ageRange (Req 3.2)', async () => {
      await createClass({ name: 'Age 5-7 Exclusive Class', ageRange: { min: 5, max: 7 } });

      const res = await request(app).get('/api/timetable?ageGroup=10');
      expect(res.status).toBe(200);
      const classes = res.body.data as Array<{ name: string }>;
      const names = classes.map((c) => c.name);
      expect(names).not.toContain('Age 5-7 Exclusive Class');
    });

    it('should return 400 for invalid view param', async () => {
      const res = await request(app).get('/api/timetable?view=invalid');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should include teacher, location, and pricingRule in response (Req 3.3)', async () => {
      await createClass({ name: 'Full Data Class' });

      const res = await request(app).get('/api/timetable');
      expect(res.status).toBe(200);
      const classes = res.body.data as Array<Record<string, unknown>>;
      expect(classes.length).toBeGreaterThan(0);
      const cls = classes[0];
      expect(cls.teacher).toBeDefined();
      expect(cls.location).toBeDefined();
      expect(cls.pricingRule).toBeDefined();
    });
  });

  describe('GET /api/timetable/capacity/:classId', () => {
    it('should return capacity info for a class (Req 3.3, 3.4)', async () => {
      const cls = await createClass({ name: 'Capacity Test Class', capacity: 15 });

      const res = await request(app).get(`/api/timetable/capacity/${cls.id}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.classId).toBe(cls.id);
      expect(res.body.data.capacity).toBe(15);
      expect(res.body.data.enrolled).toBe(0);
      expect(res.body.data.available).toBe(15);
      expect(res.body.data.isFull).toBe(false);
      expect(typeof res.body.data.waitlistCount).toBe('number');
    });

    it('should return 404 for non-existent class', async () => {
      const res = await request(app).get('/api/timetable/capacity/non-existent-id');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should show isFull=true when enrolled equals capacity (Req 3.4)', async () => {
      const cls = await createClass({ name: 'Full Class Test', capacity: 1 });

      // Manually set enrolledCount to capacity
      await prisma.class.update({ where: { id: cls.id }, data: { enrolledCount: 1 } });

      const res = await request(app).get(`/api/timetable/capacity/${cls.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.isFull).toBe(true);
      expect(res.body.data.available).toBe(0);
    });
  });

  describe('ClassService.getTimetable active filter', () => {
    it('should exclude classes with past endDate', async () => {
      const past = new Date();
      past.setDate(past.getDate() - 1);
      const expired = await createClass({ name: 'Expired Service Class', endDate: past });

      const classes = await classService.getTimetable();
      const ids = classes.map((c) => c.id);
      expect(ids).not.toContain(expired.id);
    });

    it('should include classes with null endDate', async () => {
      const active = await createClass({ name: 'No EndDate Class' });

      const classes = await classService.getTimetable();
      const ids = classes.map((c) => c.id);
      expect(ids).toContain(active.id);
    });

    it('should include classes with future endDate', async () => {
      const future = new Date();
      future.setFullYear(future.getFullYear() + 1);
      const active = await createClass({ name: 'Future EndDate Class', endDate: future });

      const classes = await classService.getTimetable();
      const ids = classes.map((c) => c.id);
      expect(ids).toContain(active.id);
    });
  });
});
