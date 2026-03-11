# Database Testing Setup

This document explains how to set up and run database tests for the Dance School Management Platform.

## Prerequisites

- Docker and Docker Compose installed
- PostgreSQL container running (via `docker-compose up -d`)

## Quick Setup

To set up the test database, run:

```bash
npm run test:setup
```

This script will:
1. Check if Docker and PostgreSQL container are running
2. Create (or recreate) the `dance_school_test_db` database
3. Apply the Prisma schema to the test database

## Running Tests

After setup, you can run all tests:

```bash
npm test
```

Or run specific test files:

```bash
npm test -- src/__tests__/database/schema-integrity.test.ts
```

## Property-Based Tests

The project includes property-based tests using `fast-check` to validate correctness properties across many random inputs. These tests are particularly important for:

- Schema integrity and referential constraints
- Fee calculations and pricing rules
- Capacity enforcement and concurrency
- Business logic invariants

Property-based tests run with 20-100 iterations by default to balance thoroughness with execution time.

## Test Database

- **Database Name**: `dance_school_test_db`
- **Host**: `localhost:5432`
- **User**: `postgres`
- **Password**: `postgres`

The test database is separate from the development database (`dance_school_db`) to prevent test data from interfering with development work.

## Troubleshooting

### Database Connection Errors

If you see errors like "Database does not exist", run:

```bash
npm run test:setup
```

### Docker Not Running

Ensure Docker is running and the PostgreSQL container is up:

```bash
docker-compose up -d
docker ps
```

You should see `dance_school_postgres` in the list of running containers.

### Schema Out of Sync

If the schema changes, regenerate the Prisma client and update the test database:

```bash
npm run db:generate
npm run test:setup
```

## Continuous Integration

For CI environments, ensure the test database is set up before running tests:

```bash
# In CI pipeline
docker-compose up -d
npm run test:setup
npm test
```
