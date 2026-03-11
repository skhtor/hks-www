import { ClassService } from '../../services/class.service';
import { TeacherService } from '../../services/teacher.service';
import { PrismaClient, DayOfWeek } from '@prisma/client';

const prisma = new PrismaClient();
const classService = new ClassService();
const teacherService = new TeacherService();

const TEST_DOMAIN = '@class-service-test.example.com';

describe('ClassService', () => {
  let teacherId: string;
  let locationId: string;
  let pricingRuleId: string;

  beforeAll(async () => {
    // Clean up any leftover test data
    await prisma.class.deleteMany({
      where: { teacher: { user: { email: { contains: TEST_DOMAIN } } } },
    });
    await prisma.teacher.deleteMany({
      where: { user: { email: { contains: TEST_DOMAIN } } },
    });
    await prisma.userAccount.deleteMany({
      where: { email: { contains: TEST_DOMAIN } },
    });

    // Create a teacher for tests
    const email = `teacher${Date.now()}${TEST_DOMAIN}`;
    const teacher = await teacherService.createTeacher({
      email,
      password: 'SecurePass123!',
      name: 'Test Teacher',
    });
    teacherId = teacher.id;

    // Create a location for tests
    const location = await prisma.location.create({
      data: {
        name: 'Test Studio',
        address: { street: '1 Test St', suburb: 'Testville', state: 'VIC', postcode: '3000' },
      },
    });
    locationId = location.id;

    // Create a pricing rule for tests
    const pricingRule = await prisma.pricingRule.create({
      data: {
        name: 'Standard',
        type: 'PER_CLASS',
        classCountMin: 1,
        monthlyFee: 80,
        priority: 1,
      },
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
    await prisma.userAccount.deleteMany({
      where: { email: { contains: TEST_DOMAIN } },
    });
    await prisma.location.deleteMany({ where: { name: 'Test Studio' } });
    await prisma.pricingRule.deleteMany({ where: { name: 'Standard' } });
    await prisma.$disconnect();
  });

  let classTimeCounter = 0;

  function baseClassInput() {
    // Use unique day+time combos to avoid scheduling conflicts between tests.
    // 7 days × 10 hours (08:00–17:00) = 70 unique slots, more than enough.
    const days: DayOfWeek[] = [
      DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY,
      DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY, DayOfWeek.SUNDAY,
    ];
    const slotIndex = classTimeCounter++;
    const day = days[Math.floor(slotIndex / 10) % days.length];
    const hour = 8 + (slotIndex % 10);
    return {
      name: 'Ballet Beginners',
      style: 'Ballet',
      level: 'Beginner',
      dayOfWeek: day,
      startTime: `${String(hour).padStart(2, '0')}:00`,
      duration: 45, // 45 min so adjacent slots don't overlap
      locationId,
      teacherId,
      capacity: 15,
      pricingRuleId,
    };
  }

  describe('createClass', () => {
    it('should create a class with all required fields (Req 8.1)', async () => {
      const input = baseClassInput();
      const cls = await classService.createClass(input);

      expect(cls.id).toBeDefined();
      expect(cls.name).toBe('Ballet Beginners');
      expect(cls.style).toBe('Ballet');
      expect(cls.level).toBe('Beginner');
      expect(cls.dayOfWeek).toBe(input.dayOfWeek);
      expect(cls.startTime).toBe(input.startTime);
      expect(cls.duration).toBe(input.duration);
      expect(cls.capacity).toBe(15);
      expect(cls.enrolledCount).toBe(0);
      expect(cls.teacherId).toBe(teacherId);
      expect(cls.locationId).toBe(locationId);
    });

    it('should create a class with optional fields (Req 8.2)', async () => {
      const cls = await classService.createClass({
        ...baseClassInput(),
        name: 'Jazz Advanced',
        description: 'Advanced jazz class',
        ageRange: { min: 12, max: 18 },
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
      });

      expect(cls.description).toBe('Advanced jazz class');
      expect(cls.ageRange).toEqual({ min: 12, max: 18 });
      expect(cls.startDate).toBeDefined();
      expect(cls.endDate).toBeDefined();
    });

    it('should include teacher and location in response', async () => {
      const cls = await classService.createClass({ ...baseClassInput(), name: 'Hip Hop Intro' });

      expect(cls.teacher).toBeDefined();
      expect(cls.teacher.id).toBe(teacherId);
      expect(cls.location).toBeDefined();
      expect(cls.location.id).toBe(locationId);
    });

    it('should throw if teacher not found', async () => {
      await expect(
        classService.createClass({ ...baseClassInput(), teacherId: 'non-existent-id' })
      ).rejects.toThrow('Teacher not found');
    });

    it('should throw if location not found', async () => {
      await expect(
        classService.createClass({ ...baseClassInput(), locationId: 'non-existent-id' })
      ).rejects.toThrow('Location not found');
    });

    it('should throw if pricing rule not found', async () => {
      await expect(
        classService.createClass({ ...baseClassInput(), pricingRuleId: 'non-existent-id' })
      ).rejects.toThrow('Pricing rule not found');
    });
  });

  describe('getClassById', () => {
    it('should return a class by id', async () => {
      const created = await classService.createClass({ ...baseClassInput(), name: 'Get Test Class' });
      const fetched = await classService.getClassById(created.id);

      expect(fetched.id).toBe(created.id);
      expect(fetched.name).toBe('Get Test Class');
    });

    it('should throw if class not found', async () => {
      await expect(classService.getClassById('non-existent-id')).rejects.toThrow('Class not found');
    });
  });

  describe('updateClass', () => {
    it('should update class fields and persist immediately (Req 8.3)', async () => {
      const cls = await classService.createClass({ ...baseClassInput(), name: 'Update Test' });

      const updated = await classService.updateClass(cls.id, {
        name: 'Updated Name',
        level: 'Intermediate',
        capacity: 20,
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.level).toBe('Intermediate');
      expect(updated.capacity).toBe(20);

      // Verify persistence
      const fetched = await classService.getClassById(cls.id);
      expect(fetched.name).toBe('Updated Name');
    });

    it('should only update provided fields', async () => {
      const cls = await classService.createClass({
        ...baseClassInput(),
        name: 'Partial Update Test',
        style: 'Contemporary',
      });

      const updated = await classService.updateClass(cls.id, { name: 'New Name Only' });

      expect(updated.name).toBe('New Name Only');
      expect(updated.style).toBe('Contemporary'); // unchanged
    });

    it('should throw if class not found', async () => {
      await expect(
        classService.updateClass('non-existent-id', { name: 'Test' })
      ).rejects.toThrow('Class not found');
    });

    it('should throw if updated teacher not found', async () => {
      const cls = await classService.createClass({ ...baseClassInput(), name: 'Teacher Update Test' });

      await expect(
        classService.updateClass(cls.id, { teacherId: 'non-existent-id' })
      ).rejects.toThrow('Teacher not found');
    });
  });

  describe('deleteClass', () => {
    it('should delete a class with no active enrolments', async () => {
      const cls = await classService.createClass({ ...baseClassInput(), name: 'Delete Test' });

      await classService.deleteClass(cls.id);

      await expect(classService.getClassById(cls.id)).rejects.toThrow('Class not found');
    });

    it('should throw if class not found', async () => {
      await expect(classService.deleteClass('non-existent-id')).rejects.toThrow('Class not found');
    });

    it('should prevent deletion when active enrolments exist (Req 8.4)', async () => {
      const cls = await classService.createClass({ ...baseClassInput(), name: 'Active Enrolment Class' });

      // Create a dancer and household for the enrolment
      const household = await prisma.household.create({ data: { name: 'Test Family' } });
      const dancer = await prisma.dancer.create({
        data: {
          householdId: household.id,
          firstName: 'Test',
          lastName: 'Dancer',
          dateOfBirth: new Date('2015-01-01'),
          emergencyContact: { name: 'Parent', phone: '0400000000', relationship: 'Parent' },
        },
      });

      await prisma.enrolment.create({
        data: {
          dancerId: dancer.id,
          classId: cls.id,
          status: 'ACTIVE',
          startDate: new Date(),
        },
      });

      await expect(classService.deleteClass(cls.id)).rejects.toThrow(
        'Cannot delete class with active enrolments'
      );

      // Cleanup
      await prisma.enrolment.deleteMany({ where: { classId: cls.id } });
      await prisma.dancer.delete({ where: { id: dancer.id } });
      await prisma.household.delete({ where: { id: household.id } });
      await prisma.class.delete({ where: { id: cls.id } });
    });
  });

  describe('getTimetable', () => {
    it('should return all classes when no filters applied', async () => {
      await classService.createClass({ ...baseClassInput(), name: 'Timetable Class A' });
      await classService.createClass({ ...baseClassInput(), name: 'Timetable Class B' });

      const classes = await classService.getTimetable();
      expect(classes.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by level', async () => {
      await classService.createClass({ ...baseClassInput(), name: 'Filter Level Test', level: 'Advanced' });

      const classes = await classService.getTimetable({ level: 'Advanced' });
      expect(classes.every((c) => c.level === 'Advanced')).toBe(true);
    });

    it('should filter by style', async () => {
      await classService.createClass({ ...baseClassInput(), name: 'Filter Style Test', style: 'Tap' });

      const classes = await classService.getTimetable({ style: 'Tap' });
      expect(classes.every((c) => c.style === 'Tap')).toBe(true);
    });

    it('should filter by teacherId', async () => {
      const classes = await classService.getTimetable({ teacherId });
      expect(classes.every((c) => c.teacherId === teacherId)).toBe(true);
    });

    it('should filter by dayOfWeek', async () => {
      // Use 07:00 which is outside the range used by baseClassInput, ensuring no conflict
      await classService.createClass({
        ...baseClassInput(),
        name: 'Friday Class',
        dayOfWeek: DayOfWeek.FRIDAY,
        startTime: '07:00',
      });

      const classes = await classService.getTimetable({ dayOfWeek: DayOfWeek.FRIDAY });
      expect(classes.every((c) => c.dayOfWeek === DayOfWeek.FRIDAY)).toBe(true);
    });

    it('should filter by locationId', async () => {
      const classes = await classService.getTimetable({ locationId });
      expect(classes.every((c) => c.locationId === locationId)).toBe(true);
    });
  });

  describe('getClassesForTeacher', () => {
    it('should return classes assigned to a teacher (Req 2.3)', async () => {
      await classService.createClass({ ...baseClassInput(), name: 'Teacher Classes Test' });

      const classes = await classService.getClassesForTeacher(teacherId);
      expect(classes.length).toBeGreaterThanOrEqual(1);
      expect(classes.every((c) => c.teacherId === teacherId)).toBe(true);
    });

    it('should throw if teacher not found', async () => {
      await expect(classService.getClassesForTeacher('non-existent-id')).rejects.toThrow(
        'Teacher not found'
      );
    });

    it('should return empty array if teacher has no classes', async () => {
      const email = `noteacher${Date.now()}${TEST_DOMAIN}`;
      const newTeacher = await teacherService.createTeacher({
        email,
        password: 'SecurePass123!',
        name: 'No Classes Teacher',
      });

      const classes = await classService.getClassesForTeacher(newTeacher.id);
      expect(classes).toEqual([]);
    });
  });

  describe('checkSchedulingConflicts', () => {
    let conflictTeacherId: string;
    let conflictLocationId: string;
    let conflictPricingRuleId: string;
    let roomId: string;

    beforeAll(async () => {
      // Create a dedicated teacher for conflict tests
      const email = `conflict-teacher${Date.now()}${TEST_DOMAIN}`;
      const teacher = await teacherService.createTeacher({
        email,
        password: 'SecurePass123!',
        name: 'Conflict Test Teacher',
      });
      conflictTeacherId = teacher.id;

      // Create a location
      const location = await prisma.location.create({
        data: {
          name: 'Conflict Test Studio',
          address: { street: '2 Conflict St', suburb: 'Testville', state: 'VIC', postcode: '3000' },
        },
      });
      conflictLocationId = location.id;

      // Create a pricing rule
      const pricingRule = await prisma.pricingRule.create({
        data: {
          name: 'Conflict Standard',
          type: 'PER_CLASS',
          classCountMin: 1,
          monthlyFee: 80,
          priority: 1,
        },
      });
      conflictPricingRuleId = pricingRule.id;

      // Create a room (just a string ID stored on the class)
      roomId = 'room-studio-a';
    });

    afterAll(async () => {
      await prisma.class.deleteMany({
        where: { teacher: { user: { email: { contains: TEST_DOMAIN } } } },
      });
      await prisma.teacher.deleteMany({
        where: { user: { email: { contains: TEST_DOMAIN } } },
      });
      await prisma.userAccount.deleteMany({
        where: { email: { contains: TEST_DOMAIN } },
      });
      await prisma.location.deleteMany({ where: { name: 'Conflict Test Studio' } });
      await prisma.pricingRule.deleteMany({ where: { name: 'Conflict Standard' } });
    });

    function conflictBaseInput() {
      return {
        name: 'Conflict Base Class',
        style: 'Ballet',
        level: 'Beginner',
        dayOfWeek: DayOfWeek.WEDNESDAY,
        startTime: '10:00',
        duration: 60,
        locationId: conflictLocationId,
        teacherId: conflictTeacherId,
        capacity: 15,
        pricingRuleId: conflictPricingRuleId,
      };
    }

    it('should return valid=true when no conflicts exist (Req 24.1, 24.2)', async () => {
      const result = await classService.checkSchedulingConflicts({
        dayOfWeek: DayOfWeek.THURSDAY,
        startTime: '14:00',
        duration: 60,
        teacherId: conflictTeacherId,
      });

      expect(result.valid).toBe(true);
      expect(result.conflicts).toHaveLength(0);
    });

    it('should detect teacher conflict when same teacher has overlapping class (Req 24.2)', async () => {
      // Create an existing class for the teacher on WEDNESDAY 10:00-11:00
      await classService.createClass({
        ...conflictBaseInput(),
        name: 'Teacher Conflict Existing',
        dayOfWeek: DayOfWeek.WEDNESDAY,
        startTime: '10:00',
        duration: 60,
      });

      // Check for a new class that overlaps: 10:30-11:30
      const result = await classService.checkSchedulingConflicts({
        dayOfWeek: DayOfWeek.WEDNESDAY,
        startTime: '10:30',
        duration: 60,
        teacherId: conflictTeacherId,
      });

      expect(result.valid).toBe(false);
      expect(result.conflicts.some((c) => c.type === 'teacher')).toBe(true);
      expect(result.conflicts[0].message).toContain('Teacher is already assigned');
    });

    it('should detect room conflict when same room has overlapping class (Req 24.1)', async () => {
      // Create an existing class using the room on FRIDAY 09:00-10:00
      await classService.createClass({
        ...conflictBaseInput(),
        name: 'Room Conflict Existing',
        dayOfWeek: DayOfWeek.FRIDAY,
        startTime: '09:00',
        duration: 60,
        roomId,
      });

      // Use a different teacher to isolate room conflict
      const email2 = `room-conflict-teacher${Date.now()}${TEST_DOMAIN}`;
      const teacher2 = await teacherService.createTeacher({
        email: email2,
        password: 'SecurePass123!',
        name: 'Room Conflict Teacher 2',
      });

      const result = await classService.checkSchedulingConflicts({
        dayOfWeek: DayOfWeek.FRIDAY,
        startTime: '09:30',
        duration: 60,
        teacherId: teacher2.id,
        roomId,
      });

      expect(result.valid).toBe(false);
      expect(result.conflicts.some((c) => c.type === 'room')).toBe(true);
      expect(result.conflicts[0].message).toContain('Room is already booked');
    });

    it('should not flag conflict when classes are on different days', async () => {
      // Create a class on MONDAY
      await classService.createClass({
        ...conflictBaseInput(),
        name: 'Different Day Class',
        dayOfWeek: DayOfWeek.MONDAY,
        startTime: '10:00',
        duration: 60,
      });

      // Check same time but on TUESDAY — no conflict
      const result = await classService.checkSchedulingConflicts({
        dayOfWeek: DayOfWeek.TUESDAY,
        startTime: '10:00',
        duration: 60,
        teacherId: conflictTeacherId,
      });

      expect(result.valid).toBe(true);
    });

    it('should not flag conflict when classes are adjacent but not overlapping', async () => {
      // Create a class on SATURDAY 08:00-09:00
      await classService.createClass({
        ...conflictBaseInput(),
        name: 'Adjacent Class',
        dayOfWeek: DayOfWeek.SATURDAY,
        startTime: '08:00',
        duration: 60,
      });

      // New class starts exactly when the previous one ends: 09:00 — no overlap
      const result = await classService.checkSchedulingConflicts({
        dayOfWeek: DayOfWeek.SATURDAY,
        startTime: '09:00',
        duration: 60,
        teacherId: conflictTeacherId,
      });

      expect(result.valid).toBe(true);
    });

    it('should throw on createClass when teacher conflict exists (Req 24.2)', async () => {
      // Create an existing class on SUNDAY 11:00-12:00
      await classService.createClass({
        ...conflictBaseInput(),
        name: 'Create Conflict Existing',
        dayOfWeek: DayOfWeek.SUNDAY,
        startTime: '11:00',
        duration: 60,
      });

      // Attempt to create another class for the same teacher at overlapping time
      await expect(
        classService.createClass({
          ...conflictBaseInput(),
          name: 'Create Conflict New',
          dayOfWeek: DayOfWeek.SUNDAY,
          startTime: '11:30',
          duration: 60,
        })
      ).rejects.toThrow('Scheduling conflict detected');
    });

    it('should throw on updateClass when teacher conflict exists (Req 24.2)', async () => {
      // Create two classes on different days
      const classA = await classService.createClass({
        ...conflictBaseInput(),
        name: 'Update Conflict A',
        dayOfWeek: DayOfWeek.TUESDAY,
        startTime: '14:00',
        duration: 60,
      });
      await classService.createClass({
        ...conflictBaseInput(),
        name: 'Update Conflict B',
        dayOfWeek: DayOfWeek.TUESDAY,
        startTime: '15:00',
        duration: 60,
      });

      // Try to move class A to overlap with class B
      await expect(
        classService.updateClass(classA.id, { startTime: '14:30' })
      ).rejects.toThrow('Scheduling conflict detected');
    });

    it('should exclude the class itself when checking conflicts on update (Req 24.5)', async () => {
      // Create a class
      const cls = await classService.createClass({
        ...conflictBaseInput(),
        name: 'Self Exclude Test',
        dayOfWeek: DayOfWeek.WEDNESDAY,
        startTime: '16:00',
        duration: 60,
      });

      // Updating only the name should not trigger a self-conflict
      const updated = await classService.updateClass(cls.id, { name: 'Self Exclude Test Updated' });
      expect(updated.name).toBe('Self Exclude Test Updated');
    });

    it('should not flag room conflict when roomId is not provided', async () => {
      // Create a class with a room
      await classService.createClass({
        ...conflictBaseInput(),
        name: 'No Room Conflict Existing',
        dayOfWeek: DayOfWeek.THURSDAY,
        startTime: '10:00',
        duration: 60,
        roomId: 'room-b',
      });

      // Use a different teacher and no roomId — should not conflict on room
      const email3 = `no-room-teacher${Date.now()}${TEST_DOMAIN}`;
      const teacher3 = await teacherService.createTeacher({
        email: email3,
        password: 'SecurePass123!',
        name: 'No Room Teacher',
      });

      const result = await classService.checkSchedulingConflicts({
        dayOfWeek: DayOfWeek.THURSDAY,
        startTime: '10:00',
        duration: 60,
        teacherId: teacher3.id,
        // no roomId
      });

      expect(result.valid).toBe(true);
    });
  });
});
