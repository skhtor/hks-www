import { TeacherService } from '../../services/teacher.service';
import { AuthService } from '../../services/auth.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const teacherService = new TeacherService();
const authService = new AuthService();

const TEST_DOMAIN = '@teacher-service-test.example.com';

describe('TeacherService', () => {
  beforeAll(async () => {
    await prisma.teacher.deleteMany({
      where: { user: { email: { contains: TEST_DOMAIN } } },
    });
    await prisma.userAccount.deleteMany({
      where: { email: { contains: TEST_DOMAIN } },
    });
  });

  afterAll(async () => {
    await prisma.teacher.deleteMany({
      where: { user: { email: { contains: TEST_DOMAIN } } },
    });
    await prisma.userAccount.deleteMany({
      where: { email: { contains: TEST_DOMAIN } },
    });
    await prisma.$disconnect();
  });

  function makeEmail(suffix: string) {
    return `${suffix}${Date.now()}${TEST_DOMAIN}`;
  }

  const baseInput = {
    password: 'SecurePass123!',
    name: 'Jane Doe',
  };

  describe('createTeacher', () => {
    it('should create a teacher account with required fields (Req 2.5)', async () => {
      const email = makeEmail('create');
      const teacher = await teacherService.createTeacher({ ...baseInput, email });

      expect(teacher.id).toBeDefined();
      expect(teacher.name).toBe('Jane Doe');
      expect(teacher.email).toBe(email);
      expect(teacher.specialties).toEqual([]);
      expect(teacher.user.role).toBe('TEACHER');
    });

    it('should create a teacher with optional fields', async () => {
      const email = makeEmail('createopt');
      const teacher = await teacherService.createTeacher({
        ...baseInput,
        email,
        bio: 'Experienced ballet teacher',
        specialties: ['Ballet', 'Contemporary'],
        photoUrl: 'https://example.com/photo.jpg',
      });

      expect(teacher.bio).toBe('Experienced ballet teacher');
      expect(teacher.specialties).toEqual(['Ballet', 'Contemporary']);
      expect(teacher.photoUrl).toBe('https://example.com/photo.jpg');
    });

    it('should default specialties to empty array when not provided', async () => {
      const email = makeEmail('createdefault');
      const teacher = await teacherService.createTeacher({ ...baseInput, email });
      expect(teacher.specialties).toEqual([]);
    });

    it('should reject duplicate email (Req 2.5 - prevents self-registration)', async () => {
      const email = makeEmail('createdup');
      await teacherService.createTeacher({ ...baseInput, email });

      await expect(
        teacherService.createTeacher({ ...baseInput, email })
      ).rejects.toThrow('Email already registered');
    });

    it('should create user account with TEACHER role', async () => {
      const email = makeEmail('createrole');
      const teacher = await teacherService.createTeacher({ ...baseInput, email });

      const user = await prisma.userAccount.findUnique({ where: { id: teacher.userId } });
      expect(user?.role).toBe('TEACHER');
    });
  });

  describe('getTeacherById', () => {
    it('should return a teacher by id', async () => {
      const email = makeEmail('getbyid');
      const created = await teacherService.createTeacher({ ...baseInput, email });

      const fetched = await teacherService.getTeacherById(created.id);
      expect(fetched.id).toBe(created.id);
      expect(fetched.name).toBe('Jane Doe');
    });

    it('should throw if teacher not found', async () => {
      await expect(
        teacherService.getTeacherById('non-existent-id')
      ).rejects.toThrow('Teacher profile not found');
    });
  });

  describe('getTeacherByUserId', () => {
    it('should return a teacher by userId (Req 7.1)', async () => {
      const email = makeEmail('getbyuserid');
      const created = await teacherService.createTeacher({ ...baseInput, email });

      const fetched = await teacherService.getTeacherByUserId(created.userId);
      expect(fetched.id).toBe(created.id);
      expect(fetched.email).toBe(email);
    });

    it('should throw if teacher not found for userId', async () => {
      await expect(
        teacherService.getTeacherByUserId('non-existent-user-id')
      ).rejects.toThrow('Teacher profile not found');
    });
  });

  describe('listTeachers', () => {
    it('should return all teachers', async () => {
      const email1 = makeEmail('list1');
      const email2 = makeEmail('list2');
      await teacherService.createTeacher({ ...baseInput, email: email1, name: 'Teacher A' });
      await teacherService.createTeacher({ ...baseInput, email: email2, name: 'Teacher B' });

      const teachers = await teacherService.listTeachers();
      const testTeachers = teachers.filter((t) => t.email.includes(TEST_DOMAIN));
      expect(testTeachers.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('updateTeacher', () => {
    it('should update teacher fields and persist immediately', async () => {
      const email = makeEmail('update');
      const teacher = await teacherService.createTeacher({ ...baseInput, email });

      const updated = await teacherService.updateTeacher(teacher.id, {
        name: 'Updated Name',
        bio: 'New bio',
        specialties: ['Jazz', 'Hip Hop'],
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.bio).toBe('New bio');
      expect(updated.specialties).toEqual(['Jazz', 'Hip Hop']);

      // Verify persistence
      const fetched = await teacherService.getTeacherById(teacher.id);
      expect(fetched.name).toBe('Updated Name');
    });

    it('should only update provided fields', async () => {
      const email = makeEmail('updatepartial');
      const teacher = await teacherService.createTeacher({
        ...baseInput,
        email,
        bio: 'Original bio',
        specialties: ['Ballet'],
      });

      const updated = await teacherService.updateTeacher(teacher.id, { name: 'New Name' });

      expect(updated.name).toBe('New Name');
      expect(updated.bio).toBe('Original bio'); // unchanged
      expect(updated.specialties).toEqual(['Ballet']); // unchanged
    });

    it('should throw if teacher not found', async () => {
      await expect(
        teacherService.updateTeacher('non-existent-id', { name: 'Test' })
      ).rejects.toThrow('Teacher profile not found');
    });
  });

  describe('deleteTeacher', () => {
    it('should delete a teacher with no assigned classes', async () => {
      const email = makeEmail('delete');
      const teacher = await teacherService.createTeacher({ ...baseInput, email });

      await teacherService.deleteTeacher(teacher.id);

      await expect(
        teacherService.getTeacherById(teacher.id)
      ).rejects.toThrow('Teacher profile not found');
    });

    it('should throw if teacher not found', async () => {
      await expect(
        teacherService.deleteTeacher('non-existent-id')
      ).rejects.toThrow('Teacher profile not found');
    });

    it('should also delete the associated user account', async () => {
      const email = makeEmail('deleteuser');
      const teacher = await teacherService.createTeacher({ ...baseInput, email });
      const userId = teacher.userId;

      await teacherService.deleteTeacher(teacher.id);

      const user = await prisma.userAccount.findUnique({ where: { id: userId } });
      expect(user).toBeNull();
    });
  });

  describe('role enforcement', () => {
    it('should create teacher with TEACHER role, not CUSTOMER (Req 2.5)', async () => {
      const email = makeEmail('rolecheck');
      const teacher = await teacherService.createTeacher({ ...baseInput, email });

      expect(teacher.user.role).toBe('TEACHER');

      // Verify teacher cannot login as customer
      const user = await prisma.userAccount.findUnique({ where: { id: teacher.userId } });
      expect(user?.role).not.toBe('CUSTOMER');
      expect(user?.role).not.toBe('ADMIN');
    });

    it('should allow teacher to authenticate with their credentials', async () => {
      const email = makeEmail('authcheck');
      await teacherService.createTeacher({ ...baseInput, email });

      const authResult = await authService.login({ email, password: baseInput.password });
      expect(authResult.user.role).toBe('TEACHER');
      expect(authResult.accessToken).toBeDefined();
    });
  });
});
