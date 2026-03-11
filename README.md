# Dance School Management Platform

A comprehensive web-based system for managing dance school operations including student registration, class enrolment, fee calculation, payment processing, and Xero integration.

## Features

- User authentication and role-based access control
- Customer and dancer profile management
- Class scheduling and timetable management
- Flexible fee calculation engine with discounts
- Payment processing integration
- Xero accounting integration
- Teacher portal for attendance tracking
- Admin portal for comprehensive management
- Automated notifications
- Reporting and analytics

## Tech Stack

- **Backend**: Node.js with Express and TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis
- **Testing**: Jest with fast-check for property-based testing
- **Code Quality**: ESLint and Prettier

## Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose (for local development)
- PostgreSQL 16+
- Redis 7+

## Getting Started

### 1. Clone and Install

```bash
npm install
```

### 2. Environment Setup

Copy the example environment file and configure:

```bash
cp .env.example .env
```

Edit `.env` with your configuration values.

### 3. Start Infrastructure

Start PostgreSQL and Redis using Docker Compose:

```bash
docker-compose up -d
```

### 4. Database Setup

Generate Prisma client and push schema:

```bash
npm run db:generate
npm run db:push
```

### 5. Run Development Server

```bash
npm run dev
```

The API will be available at `http://localhost:3000`

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Generate test coverage report
- `npm run lint` - Lint code
- `npm run lint:fix` - Fix linting issues
- `npm run format` - Format code with Prettier
- `npm run db:generate` - Generate Prisma client
- `npm run db:push` - Push schema to database
- `npm run db:migrate` - Run database migrations
- `npm run db:studio` - Open Prisma Studio

## Project Structure

```
.
├── src/
│   ├── config/          # Configuration files
│   ├── services/        # Business logic services
│   ├── routes/          # API routes
│   ├── middleware/      # Express middleware
│   ├── types/           # TypeScript type definitions
│   ├── utils/           # Utility functions
│   ├── app.ts           # Express app setup
│   └── index.ts         # Application entry point
├── prisma/
│   └── schema.prisma    # Database schema
├── tests/               # Test files
└── docker-compose.yml   # Local development infrastructure

```

## Testing

The project uses Jest for unit testing and fast-check for property-based testing.

Run all tests:
```bash
npm test
```

Run tests with coverage:
```bash
npm run test:coverage
```

## License

MIT
