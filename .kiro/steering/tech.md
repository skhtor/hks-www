# Tech Stack

## Backend
- **Runtime**: Node.js 18+ with TypeScript
- **Framework**: Express 4
- **ORM**: Prisma 5 with PostgreSQL 16
- **Cache**: Redis 7 (via `redis` v4 client)
- **Auth**: JWT (`jsonwebtoken`), bcrypt, MFA via `otplib`/`speakeasy`
- **Payments**: Stripe (`stripe` v20)
- **Accounting**: Xero (`xero-node` v14)
- **Validation**: Zod
- **Security**: helmet, cors, express-rate-limit, input sanitization middleware

## Frontend
- **Framework**: React 18 with TypeScript
- **Build tool**: Vite 5
- **Routing**: React Router v6
- **Styling**: Tailwind CSS 3
- **HTTP client**: Axios

## Testing
- **Runner**: Jest 29 with ts-jest, `--runInBand` (serial execution required for DB tests)
- **Property-based testing**: fast-check 3
- **Integration tests**: supertest
- Tests live in `src/__tests__/` and use a real PostgreSQL test database
- PBT tests are in `*.pbt.test.ts` files alongside regular `*.test.ts` files
- Test emails use `@test.example.com` or `@pbt.test.com` domains for cleanup

## Common Commands

### Backend
```bash
npm run dev          # Start dev server with hot reload (tsx watch)
npm run build        # Compile TypeScript to dist/
npm start            # Run compiled production build
npm test             # Run all tests (serial)
npm run test:coverage # Run tests with coverage report
npm run lint         # ESLint check
npm run lint:fix     # ESLint auto-fix
npm run format       # Prettier format src/**/*.ts
```

### Database
```bash
npm run db:generate  # Regenerate Prisma client after schema changes
npm run db:push      # Push schema changes to DB (dev)
npm run db:migrate   # Create and run a migration
npm run db:studio    # Open Prisma Studio GUI
npm run test:setup   # Set up test database (runs scripts/setup-test-db.sh)
```

### Frontend
```bash
# Run from frontend/ directory
npm run dev          # Vite dev server
npm run build        # tsc + vite build
npm run preview      # Preview production build
```

### Infrastructure
```bash
docker-compose up -d  # Start PostgreSQL and Redis locally
```

## Environment
- Copy `.env.example` to `.env` for local setup
- `DATABASE_URL` points to PostgreSQL
- Redis connection configured separately in `src/config/redis.ts`
