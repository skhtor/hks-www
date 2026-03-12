import fc from 'fast-check';
import { ClassService } from '../../services/class.service';
import { DayOfWeek } from '@prisma/client';

/**
 * Property-Based Tests for Location Filtering
 *
 * Property 46: Location Filtering
 * For any set of classes across multiple locations, filtering by a specific locationId
 * must return ONLY classes belonging to that location (no classes from other locations
 * leak through), and must return ALL classes for that location (no classes are missed).
 * **Validates: Requirements 28.3**
 */

// ─────────────────────────────────────────────────────────────────────────────
// Mock Prisma
// ─────────────────────────────────────────────────────────────────────────────

// Declare mocks at module scope so they can be accessed in tests
let mockFindMany: jest.Mock;
let mockQueryRaw: jest.Mock;

jest.mock('@prisma/client', () => {
  const actual = jest.requireActual('@prisma/client');
  // Use jest.fn() directly inside the factory — variables are not yet initialised
  // when jest.mock is hoisted, so we capture the mock via the module-level variable
  // after the fact in beforeEach.
  const findMany = jest.fn();
  const queryRaw = jest.fn();
  return {
    ...actual,
    PrismaClient: jest.fn().mockImplementation(() => ({
      class: {
        findMany,
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      teacher: { findUnique: jest.fn() },
      location: { findUnique: jest.fn() },
      pricingRule: { findUnique: jest.fn() },
      enrolment: { count: jest.fn() },
      waitlistEntry: { count: jest.fn() },
      $queryRaw: queryRaw,
      $disconnect: jest.fn(),
    })),
    // Expose the mocks so tests can reference them
    __mocks: { findMany, queryRaw },
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// Arbitraries
// ─────────────────────────────────────────────────────────────name──────────────
// ─────────────────────────────────────────────────────────────────────────────

const locationIdArb = fc.uuid();

/** Generates a minimal class record with a given locationId */
function classRecordArb(locationId: string) {
  return fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 3, maxLength: 30 }),
    style: fc.constantFrom('Ballet', 'Jazz', 'Hip Hop', 'Contemporary', 'Tap'),
    level: fc.constantFrom('Beginner', 'Intermediate', 'Advanced'),
    dayOfWeek: fc.constantFrom(
      DayOfWeek.MONDAY,
      DayOfWeek.TUESDAY,
      DayOfWeek.WEDNESDAY,
      DayOfWeek.THURSDAY,
      DayOfWeek.FRIDAY,
    ),
    startTime: fc.constantFrom('09:00', '10:00', '11:00', '14:00', '15:00'),
    duration: fc.integer({ min: 30, max: 120 }),
    capacity: fc.integer({ min: 5, max: 30 }),
    enrolledCount: fc.integer({ min: 0, max: 5 }),
    locationId: fc.constant(locationId),
    teacherId: fc.uuid(),
    pricingRuleId: fc.uuid(),
    endDate: fc.constant(null),
    teacher: fc.record({ id: fc.uuid(), name: fc.string({ minLength: 2, maxLength: 20 }) }),
    location: fc.record({ id: fc.constant(locationId), name: fc.string({ minLength: 2, maxLength: 20 }) }),
    pricingRule: fc.record({ id: fc.uuid(), monthlyFee: fc.integer({ min: 50, max: 200 }) }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Location Service Property-Based Tests', () => {
  let classService: ClassService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Grab the shared mock functions from the module factory
    const { __mocks } = require('@prisma/client') as { __mocks: { findMany: jest.Mock; queryRaw: jest.Mock } };
    mockFindMany = __mocks.findMany;
    mockQueryRaw = __mocks.queryRaw;
    classService = new ClassService();
  });

  /**
   * Property 46: Location Filtering
   * **Validates: Requirements 28.3**
   */
  describe('Property 46: Location Filtering', () => {
    /**
     * No-leak property: filtering by locationId returns ONLY classes for that location.
     * Classes from other locations must never appear in the result.
     */
    it('no classes from other locations leak through when filtering by locationId', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Two distinct location IDs
          fc.tuple(fc.uuid(), fc.uuid()).filter(([a, b]) => a !== b),
          // 1–5 classes at the target location
          fc.integer({ min: 1, max: 5 }),
          // 1–5 classes at the other location
          fc.integer({ min: 1, max: 5 }),
          async ([targetLocationId, otherLocationId], targetCount, otherCount) => {
            mockFindMany.mockClear();

            // Build class records for each location
            const targetClasses = await fc.sample(classRecordArb(targetLocationId), targetCount);
            const otherClasses = await fc.sample(classRecordArb(otherLocationId), otherCount);

            // The mock returns only the target-location classes (simulating Prisma's WHERE filter)
            mockFindMany.mockResolvedValueOnce(targetClasses);

            const results = await classService.getTimetable({ locationId: targetLocationId });

            // Verify the filter was passed to Prisma
            expect(mockFindMany).toHaveBeenCalledTimes(1);
            const callArg = mockFindMany.mock.calls[0][0];
            expect(callArg.where.locationId).toBe(targetLocationId);

            // No class from the other location should appear in results
            const resultIds = new Set(results.map((c) => c.id));
            for (const cls of otherClasses) {
              expect(resultIds.has(cls.id)).toBe(false);
            }

            // All returned classes belong to the target location
            for (const cls of results) {
              expect(cls.locationId).toBe(targetLocationId);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Completeness property: filtering by locationId returns ALL classes for that location.
     * No class at the target location should be missed.
     */
    it('all classes at the target location are returned (none missed)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // target location
          fc.integer({ min: 1, max: 5 }), // number of classes at target location
          async (targetLocationId, classCount) => {
            mockFindMany.mockClear();
            const targetClasses = await fc.sample(classRecordArb(targetLocationId), classCount);

            // Mock returns exactly the target-location classes
            mockFindMany.mockResolvedValueOnce(targetClasses);

            const results = await classService.getTimetable({ locationId: targetLocationId });
            const resultIds = results.map((c) => c.id).sort();
            const expectedIds = targetClasses.map((c) => c.id).sort();

            // Every class at the target location must be present
            expect(resultIds).toEqual(expectedIds);
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Exactness property: the result set is exactly the set of classes at the target location —
     * no more (no-leak) and no less (completeness) combined.
     */
    it('result set is exactly the set of classes at the target location', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(fc.uuid(), fc.uuid()).filter(([a, b]) => a !== b),
          fc.integer({ min: 0, max: 5 }),
          fc.integer({ min: 1, max: 5 }),
          async ([targetLocationId, otherLocationId], targetCount, otherCount) => {
            mockFindMany.mockClear();
            const targetClasses =
              targetCount > 0 ? await fc.sample(classRecordArb(targetLocationId), targetCount) : [];
            // otherClasses are never returned by the mock (Prisma filters them out)
            await fc.sample(classRecordArb(otherLocationId), otherCount);

            mockFindMany.mockResolvedValueOnce(targetClasses);

            const results = await classService.getTimetable({ locationId: targetLocationId });

            // Exact match: same IDs, same count
            expect(results.length).toBe(targetClasses.length);

            const resultIds = results.map((c) => c.id).sort();
            const expectedIds = targetClasses.map((c) => c.id).sort();
            expect(resultIds).toEqual(expectedIds);
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Empty result property: when no classes exist at a location, the result is an empty array.
     */
    it('returns empty array when no classes exist at the target location', async () => {
      await fc.assert(
        fc.asyncProperty(fc.uuid(), async (targetLocationId) => {
          mockFindMany.mockClear();
          mockFindMany.mockResolvedValueOnce([]);

          const results = await classService.getTimetable({ locationId: targetLocationId });

          expect(results).toEqual([]);
          expect(mockFindMany).toHaveBeenCalledTimes(1);
          const callArg = mockFindMany.mock.calls[0][0];
          expect(callArg.where.locationId).toBe(targetLocationId);
        }),
        { numRuns: 20 }
      );
    });
  });
});
