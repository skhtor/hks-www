# Project Structure

## Root Layout
```
/
├── src/                  # Backend source (Node.js/Express/TypeScript)
├── frontend/             # Frontend source (React/Vite/TypeScript)
├── prisma/               # Database schema and migrations
├── scripts/              # Shell scripts (e.g. test DB setup)
├── dist/                 # Compiled backend output (gitignored)
├── coverage/             # Test coverage reports (gitignored)
├── docker-compose.yml    # Local PostgreSQL + Redis
├── jest.config.js        # Jest configuration
└── .env / .env.example   # Environment variables
```

## Backend: `src/`
```
src/
├── config/               # env, database (Prisma client), redis
├── middleware/           # auth, cache, security (sanitization, requestId)
├── routes/               # One file per resource (e.g. auth.routes.ts)
├── services/             # Business logic — one class per domain
├── types/                # Shared TypeScript types/interfaces
├── utils/                # Pure utility functions
├── app.ts                # Express app factory (createApp)
├── index.ts              # Entry point — starts server
└── __tests__/
    ├── setup.ts           # Global Jest setup
    ├── config/            # Config unit tests
    ├── database/          # Schema integrity tests
    ├── examples/          # PBT examples/reference
    └── services/          # Service tests (*.test.ts + *.pbt.test.ts)
```

## Frontend: `frontend/src/`
```
frontend/src/
├── api/                  # Axios client + typed API wrappers (index.ts)
├── components/           # Shared components (Layout, ProtectedRoute)
├── context/              # React context (AuthContext)
├── pages/
│   ├── admin/            # Admin-only pages
│   ├── customer/         # Customer portal pages
│   └── teacher/          # Teacher portal pages
├── App.tsx               # Route definitions
└── main.tsx              # React entry point
```

## Key Conventions

### Backend
- Services are classes exported as both the class and a singleton instance (e.g. `export const reportService = new ReportService()`)
- Routes import the singleton service instance
- All routes are prefixed with `/api/`
- Prisma client is instantiated per-service via `new PrismaClient()`
- Zod is used for request validation in routes
- Errors are thrown as plain `Error` objects with descriptive messages; the global error handler in `app.ts` catches them
- Monetary values use `Decimal` (Prisma `@db.Decimal(10,2)`) — convert to `Number` only at the boundary
- All IDs are UUIDs (`@default(uuid())`)
- Prisma model names use PascalCase; table names use `snake_case` via `@@map`

### Testing
- Unit/integration tests hit a real test database — never mock Prisma
- Test data cleanup uses `deleteMany` in `beforeAll`/`afterAll` with scoped email domains
- PBT tests use `fc.assert` + `fc.asyncProperty` with `numRuns: 20` for DB-backed tests
- Tests run serially (`--runInBand`) to avoid DB conflicts
- Each PBT property includes a comment documenting which requirement it validates

### Frontend
- Pages are organized by role under `pages/admin/`, `pages/customer/`, `pages/teacher/`
- `ProtectedRoute` handles role-based route guarding
- API calls go through `frontend/src/api/` — not called directly from pages
- Tailwind utility classes used directly in JSX (no CSS modules)
