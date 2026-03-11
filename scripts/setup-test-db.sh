#!/bin/bash

# Setup test database for Dance School Management Platform
# This script creates the test database and applies the Prisma schema

set -e

echo "🔧 Setting up test database..."

# Check if Docker is running
if ! docker ps > /dev/null 2>&1; then
  echo "❌ Error: Docker is not running. Please start Docker and try again."
  exit 1
fi

# Check if postgres container is running
if ! docker ps --filter "name=dance_school_postgres" --format "{{.Names}}" | grep -q "dance_school_postgres"; then
  echo "❌ Error: PostgreSQL container is not running. Please run 'docker-compose up -d' first."
  exit 1
fi

# Create test database if it doesn't exist
echo "📦 Creating test database..."
docker exec dance_school_postgres psql -U postgres -c "DROP DATABASE IF EXISTS dance_school_test_db;" > /dev/null 2>&1 || true
docker exec dance_school_postgres psql -U postgres -c "CREATE DATABASE dance_school_test_db;" > /dev/null 2>&1

# Push schema to test database
echo "🔄 Applying Prisma schema to test database..."
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/dance_school_test_db" npx prisma db push --skip-generate > /dev/null 2>&1

echo "✅ Test database setup complete!"
echo ""
echo "You can now run tests with: npm test"
