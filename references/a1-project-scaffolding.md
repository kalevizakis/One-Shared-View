---
file: a1-project-scaffolding.md
persona: A1 Project Scaffolding
version: 2.8.0
last_updated: 2026-05-31
changelog: 2.4.2
---

# A1 — Project Scaffolding & Architecture

> Load this file when A1 is scaffolding a new project, choosing folder structure, setting up architecture for a greenfield build, or advising on project organization. For day-to-day code generation and conventions, use `a1-development.md` instead.

## When to Load This File

- User says "scaffold", "new project", "set up", "greenfield", "initialize", "create a new app"
- User asks about folder structure, project organization, or architecture patterns
- A6 has completed analysis and hands off to A1 for implementation setup
- A9 pre-check finds no matching scaffold in the registry

---

## §1 Feature-Based Folder Structure

### Principle

Organize code by **business domain/feature**, not by technical role. This is the industry consensus from both Bulletproof React (35k stars) and Node.js Best Practices (105k stars).

**Why feature-based wins:**

- Each feature is a self-contained unit — changes are scoped to one folder
- New developers find code by asking "where is the orders feature?" not "which controller handles orders?"
- Features can be extracted to separate services later without reorganizing
- Reduces merge conflicts — teams work in different feature folders

### Frontend (React / Next.js / Vue)

```
src/
├── app/               # Application shell — routes, providers, router config
│   ├── routes/        # Route definitions (or pages/ in Next.js)
│   ├── app.tsx        # Root application component
│   └── provider.tsx   # Global providers wrapper (auth, theme, query client)
├── assets/            # Static files — images, fonts, icons
├── components/        # Shared UI components used across features
├── config/            # Global config — env vars, feature flags, constants
├── features/          # Feature-based modules (THE CORE)
│   ├── auth/
│   ├── orders/
│   ├── users/
│   └── dashboard/
├── hooks/             # Shared hooks (useDebounce, useMediaQuery, etc.)
├── lib/               # Pre-configured library instances (API client, logger)
├── stores/            # Global state stores (theme, notifications)
├── testing/           # Test utilities, mocks, fixtures
├── types/             # Shared TypeScript types
└── utils/             # Pure utility functions (formatDate, slugify, etc.)
```

### Feature Internal Structure

Each feature folder mirrors the top-level structure — only include folders the feature actually needs:

```
src/features/orders/
├── api/               # API declarations — fetchers + hooks for this feature
├── components/        # UI components scoped to this feature
├── hooks/             # Hooks scoped to this feature
├── stores/            # Feature-specific state
├── types/             # Types scoped to this feature
└── utils/             # Utilities scoped to this feature
```

### Backend (Node.js / FastAPI / .NET)

```
src/
├── apps/                  # Business components (bounded contexts)
│   ├── orders/
│   │   ├── entry-points/  # Controllers, route handlers, queue consumers
│   │   │   ├── api/       # REST/GraphQL endpoints
│   │   │   └── jobs/      # Background jobs, scheduled tasks
│   │   ├── domain/        # Business logic, DTOs, services, validation
│   │   └── data-access/   # Repository layer — DB queries, no ORM leaking up
│   ├── users/
│   └── payments/
├── libraries/             # Cross-cutting shared packages
│   ├── logger/
│   ├── auth/
│   └── config/
├── infrastructure/        # Framework setup, middleware, DB connections
└── tests/                 # Integration/E2E tests (unit tests colocate with features)
```

### FastAPI Variant

```
app/
├── features/
│   ├── orders/
│   │   ├── router.py      # FastAPI router (entry-point)
│   │   ├── service.py     # Business logic (domain)
│   │   ├── repository.py  # DB queries (data-access)
│   │   ├── schemas.py     # Pydantic models (DTOs)
│   │   └── dependencies.py # FastAPI Depends() for this feature
│   └── users/
├── core/                  # Cross-cutting — config, security, middleware
│   ├── config.py
│   ├── security.py
│   └── database.py
├── lib/                   # Shared utilities
└── main.py                # Single entry point — [FROM_DOCS] FastAPI best practice
```

### Key Rules

1. **No cross-feature imports** — features compose at the app level, not inside each other
2. **Unidirectional flow**: shared → features → app (never reverse)
3. **No barrel files** in Vite/webpack projects — breaks tree-shaking (import directly)
4. **Enforce via linting** — use ESLint `import/no-restricted-paths` (frontend) or module boundaries (backend)

```javascript
// ESLint config to prevent cross-feature imports
'import/no-restricted-paths': ['error', {
  zones: [
    // features/auth cannot import from features/orders
    { target: './src/features/auth', from: './src/features', except: ['./auth'] },
    { target: './src/features/orders', from: './src/features', except: ['./orders'] },
    // Enforce unidirectional: features cannot import from app
    { target: './src/features', from: './src/app' },
    // Shared cannot import from features or app
    { target: ['./src/components', './src/hooks', './src/lib', './src/utils'],
      from: ['./src/features', './src/app'] },
  ],
}],
```

---

## §2 Layer Architecture Within Features

### The 3-Tier Pattern

Every feature/component should separate these concerns. The naming may vary by stack but the principle is universal.

```toon
layerMapping[3]{Layer,Responsibility,NeverDo}:
Entry-Points (API),Accept external input / return responses / route to domain,Never put business logic here — no calculations or DB queries in controllers
Domain (Services),Business rules / validation / orchestration / DTOs,Never reference HTTP objects (req/res) or DB-specific APIs
Data-Access (Repository),Database queries / external API calls / file I/O,Never import from entry-points — data-access is the bottom layer
```

### Stack-Specific Naming

```toon
layerNames[5]{Stack,EntryPoint,Domain,DataAccess}:
Node.js (Express/Fastify),routes/ or controllers/,services/ or domain/,repositories/ or data-access/
FastAPI,router.py,service.py,repository.py
.NET,Controllers/,Services/,Repositories/
Next.js App Router,app/api/route.ts (Route Handlers),lib/services/,lib/repositories/
Django,views.py,services.py (custom),models.py + managers.py
```

### Dependency Direction

```
Entry-Points → Domain → Data-Access
     ↓              ↓           ↓
  (HTTP/Queue)  (Pure Logic)  (DB/External)
```

**Never go backwards.** If data-access needs to call domain logic, you have a circular dependency — refactor by extracting shared types or using events.

---

## §3 API Design Conventions

### REST Naming

```toon
restConventions[6]{Rule,Example,AntiPattern}:
Plural nouns for resources,GET /api/orders,GET /api/getOrders (verb in URL)
Nesting for ownership,GET /api/users/{id}/orders,GET /api/orders?userId={id} (flat when no ownership)
Kebab-case for multi-word,GET /api/order-items,GET /api/orderItems or /api/order_items
Version in URL or header,/api/v1/orders or Accept-Version: v1,No versioning at all
HTTP methods for actions,POST /api/orders (create) / PATCH (partial update),POST /api/createOrder
Consistent error shape,{ error: { code / message / details } },Inconsistent shapes across endpoints
```

### API Client Pattern (Frontend)

Create a single pre-configured API client instance. Never scatter `fetch()` calls with ad-hoc config.

```typescript
// src/lib/api-client.ts — [FROM_DOCS] Bulletproof React pattern
const apiClient = axios.create({
  baseURL: config.API_URL,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => handleApiError(error),  // centralized error handling
);

export { apiClient };
```

### 3-Part API Declaration (Frontend)

Each API endpoint gets 3 artifacts colocated in the feature's `api/` folder:

```typescript
// src/features/orders/api/get-orders.ts
// 1. Types + validation schema
import { z } from 'zod';
const OrderSchema = z.object({ id: z.string(), total: z.number() });
type Order = z.infer<typeof OrderSchema>;

// 2. Fetcher function (uses the single API client)
const getOrders = async (): Promise<Order[]> => {
  return apiClient.get('/orders');
};

// 3. Hook wrapping the fetcher (react-query / swr)
export const useOrders = () => {
  return useQuery({ queryKey: ['orders'], queryFn: getOrders });
};
```

### Error Response Shape

Standardize across all backend APIs:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Order total must be positive",
    "details": [
      { "field": "total", "constraint": "min", "value": -5 }
    ],
    "correlationId": "txn-abc123"
  }
}
```

---

## §4 State Management Patterns

### The 5 Categories

Don't put everything in one global store. Categorize state by its nature:

```toon
stateCategories[5]{Category,What,Where,Tools}:
Component State,Local to one component (open/closed / form input),Inside the component,useState / useReducer
Application State,Global UI concerns (theme / modals / notifications),Global store — keep minimal,zustand / jotai / context+hooks / redux
Server Cache State,Remote data fetched from APIs,Managed by data-fetching library,react-query / swr / RTK Query
Form State,Form inputs / validation / submission status,Form library,React Hook Form + zod / Formik + yup
URL State,Route params / query strings / pagination,Browser URL bar,react-router / nuxt-router / Next.js params
```

### Decision Matrix

```toon
stateDecision[5]{Question,Answer,Use}:
Is it local to one component?,Yes,Component State (useState)
Is it needed across unrelated components?,Yes — and it's UI state,Application State (zustand/context)
Does it come from an API?,Yes,Server Cache State (react-query)
Is it form input with validation?,Yes,Form State (React Hook Form)
Should it survive page reload via URL?,Yes,URL State (router params)
```

### Backend State Patterns

```toon
backendState[3]{Pattern,When,Implementation}:
Stateless services,Default for all services,No in-memory state. Session in JWT or external store (Redis).
Cache layer,Frequent reads of expensive queries,Redis / Memcached. Always set TTL. Invalidate on writes.
Event-driven state,Multi-service coordination,Message queue (SQS / Kafka / RabbitMQ). Eventual consistency.
```

---

## §5 Environment & Configuration

The canonical rule is **12-Factor III — Store config in the environment**: anything that varies between deploys (DB handles, credentials, per-deploy hostnames) lives in env vars, never in code. Env vars are granular and orthogonal — manage each independently per deploy; never bundle them into named "environments" (`dev`/`staging`/`qa`), which scales into a combinatorial mess.

**Litmus test** (12-Factor): *could this repository be made open source right now, without leaking a single credential?* If not, config is still entangled with code.

### The 6-Property Checklist

Every project's configuration must satisfy all 6 properties (12-Factor III, refined by Node.js Best Practices 1.4):

```toon
configChecklist[6]{Property,Requirement,Example}:
1. Dual source,Readable from file AND environment variable,dotenv + process.env / Pydantic BaseSettings
2. Secrets outside code,Never commit secrets to source control,.env in .gitignore / vault / cloud secrets manager
3. Hierarchical,Organized by concern — not a flat list,config.database.host / config.auth.jwt_secret
4. Typed,Config values have explicit types — not all strings,zod schema / Pydantic model / convict schema
5. Validated at startup,App fails fast if required config is missing,Validate on import — not on first use
6. Defaults for every key,Non-secret keys have sensible defaults,PORT=3000 / LOG_LEVEL=info
```

### Implementation by Stack

```typescript
// Node.js — zod validation at startup
// src/config/index.ts
import { z } from 'zod';

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export const config = ConfigSchema.parse(process.env);
// App crashes immediately if DATABASE_URL or JWT_SECRET is missing
```

```python
# FastAPI — Pydantic BaseSettings
# app/core/config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    app_env: str = "development"
    port: int = 8000
    database_url: str                # required — no default
    jwt_secret: str                  # required — no default
    log_level: str = "info"

    class Config:
        env_file = ".env"

settings = Settings()  # Fails fast if required vars missing
```

### `.env.example` Convention

Always commit a `.env.example` (never `.env`) showing all required variables with placeholder values:

```env
# .env.example — copy to .env and fill in real values
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://user:pass@localhost:5432/mydb
JWT_SECRET=change-me-to-a-real-secret-at-least-32-chars
LOG_LEVEL=info
```

---

## §6 Package Boundaries & Shared Code

### Monorepo vs Polyrepo Decision

```toon
repoDecision[4]{Factor,Monorepo,Polyrepo}:
Team size,1 team / <8 developers — shared tooling is easy,Multiple independent teams with different release cycles
Shared code,Heavy sharing between apps (UI kit / auth / types),Minimal sharing — services communicate via API contracts
Deploy cadence,Deploy together or near-simultaneously,Independent deployment per service is critical
Tooling cost,Willing to invest in Turborepo / Nx / pnpm workspaces,Prefer simple per-repo CI/CD — less infra overhead
```

### Shared Code as Packages

Following Node.js Best Practices 1.3 — wrap reusable code as packages with explicit boundaries:

```
libraries/
├── logger/
│   ├── package.json       # Own package.json — explicit exports
│   ├── src/
│   │   └── index.ts       # Public API — only export what consumers need
│   └── tsconfig.json
├── auth/
│   ├── package.json
│   └── src/
└── ui-kit/                # Shared components (monorepo only)
    ├── package.json
    └── src/
```

**Key rules:**

- Each library has its own `package.json` with `exports` field defining the public API
- Consumers import from the package name, never from internal paths
- In monorepo: use `npm link`, `pnpm workspaces`, or `tsconfig paths`
- In polyrepo: publish to private npm registry or Git submodules

### Cross-Feature Import Enforcement

Use linting to prevent architectural decay:

```toon
importRules[3]{Rule,Enforcement,Why}:
No cross-feature imports,ESLint import/no-restricted-paths,Features must remain independent — compose at app level
Unidirectional flow,ESLint import/no-restricted-paths zones,shared → features → app (never reverse)
No deep imports into libraries,package.json exports field,Consumers use public API — internal refactors don't break consumers
```

---

## §7 Database Access Patterns

### ORM vs Query Builder Decision

```toon
dbAccessDecision[4]{Approach,When,Examples,TradeOff}:
Full ORM,Rapid prototyping / CRUD-heavy apps / team prefers OOP,Prisma / TypeORM / SQLAlchemy / Entity Framework,Convenience over control. Watch for N+1 queries.
Query Builder,Need SQL control with type safety / complex joins,Knex / Drizzle / SQLAlchemy Core,Balance of safety and flexibility.
Raw SQL + parameterized,Performance-critical / dialect-specific syntax,pg or mysql2 with $1 params (Snowflake connector when applicable),Full control. Must parameterize — never string concatenate. [CC#1]
Stored Procedures,Enterprise policy requires / heavy DB-side logic,PL/pgSQL (Snowflake stored procs when applicable),Logic lives in DB — harder to test / version.
```

### Migration Strategy

```toon
migrationRules[4]{Rule,Why}:
One migration per schema change,Atomic changes are easier to review / revert
Never edit a deployed migration,Create a new migration to fix issues — deployed migrations are immutable
Test migrations up AND down,Rollback must work. Test `migrate:down` before deploying.
Version-control migrations alongside code,Migrations ship with the feature that needs them
```

### Connection Pooling

- **Always pool** — never open a connection per request
- Node.js: use `pg` pool (default 10 connections) or Prisma's built-in pooling
- FastAPI: use `asyncpg` pool or SQLAlchemy async engine with pool settings
- Set `pool_size` based on expected concurrency, not maximum
- In serverless/short-lived environments, close connections explicitly so they aren't orphaned
- **Data-warehouse connectors (when applicable)** — e.g. Snowflake: use the connector's built-in pool and close connections explicitly in serverless contexts

### Cross-Reference

Database access in this file is deliberately general-purpose (A1 = application development). For data-warehouse-specific SQL patterns (Snowflake QUALIFY, FLATTEN, MERGE, VARIANT), see `a1-development.md` → "Performance Patterns" → "Data Workloads (when applicable)".

---

## §8 Scaffolding Checklist

When A1 receives a "new project" request (after A6 analysis if non-trivial), execute this checklist in order:

### Phase 1: Foundation

- [ ] **Runtime check** — verify local versions (`node --version`, `python --version`, etc.) and adapt framework versions accordingly. Don't assume latest. `[R#8 Environment pre-check]`
- [ ] **Initialize project** — `npm init`, `poetry init`, `dotnet new`, etc. with correct name, license, and version
- [ ] **Create folder structure** — use §1 templates, adapted to the stack. Only create folders the project actually needs
- [ ] **Set up config** — implement §5 pattern (typed, validated, env-aware). Create `.env.example`
- [ ] **Single entry point** — one `main.ts` / `main.py` / `Program.cs`. Flag duplicates as CRITICAL `[Ref: a1-development.md → Red Flags]`

### Phase 2: Tooling

- [ ] **Linting + formatting** — ESLint + Prettier (JS/TS), Ruff (Python), or equivalent. Configure import restriction rules from §1
- [ ] **TypeScript / type checking** — `tsconfig.json` with strict mode, or `mypy.ini` / `pyproject.toml` type settings
- [ ] **Git setup** — `.gitignore` (use gitignore.io for stack), `.env` excluded, lock files included
- [ ] **Editor config** — `.editorconfig` for consistent whitespace. Create `.instructions.md` with `applyTo` front matter for Copilot conventions

### Phase 3: Infrastructure Files

- [ ] **README.md** — project name, purpose, setup steps, run commands, architecture overview
- [ ] **AGENTS.md** — workspace root file with architecture summary, conventions, test commands, sensitive areas `[R#8]`
- [ ] **PORTS.md** — if multiple services, document port allocations `[Ref: a5-infrastructure.md]`
- [ ] **.instructions.md** — scoped coding conventions with `applyTo: '**/*.ts'` patterns for the stack

### Phase 4: Verification

- [ ] **Build passes** — `npm run build` / `python -m py_compile` / `dotnet build` with zero errors
- [ ] **Dev server starts** — run and verify in browser `[R#8 Build, Run, Verify, Show]`
- [ ] **Smoke test** — at least one request succeeds (health endpoint, index page)
- [ ] **A9 post-check** — evaluate scaffold for reusability. If it's a pattern worth cataloging, ask user

### Anti-Patterns

```toon
scaffoldAntiPatterns[5]{AntiPattern,Why,Instead}:
Copy entire boilerplate repo without auditing,Inherits dead dependencies / wrong config / stale patterns,Generate from checklist — only add what's needed
Install everything upfront,Bloated node_modules / unused packages / security surface,Install as you build features — no speculative dependencies
Skip config validation,App works in dev / crashes in staging with missing env var,Validate at startup from day 1 (§5)
Organize by technical layer at root,controllers/ models/ services/ becomes spaghetti at scale,Feature-based structure (§1) — layers live inside features
No .gitignore from the start,.env / node_modules / __pycache__ committed accidentally,First file created after init
```

### Common Rationalizations

```toon
scaffoldRationalizations[5]{Excuse,Reality}:
"I'll restructure the folders later",Structure ossifies fast — every new file deepens the wrong layout. Cheapest to fix on day 1.
"Config validation is overkill for a small app",The missing-env-var crash always lands in staging/prod where it's most expensive. Validate at startup from the first commit (§5).
"I'll just copy our other repo's setup",Inherits dead deps / stale patterns / wrong config. Generate from the checklist (§8) — add only what's needed.
"Snowflake-style SQL is fine to bake into the app layer",Couples application code to one warehouse dialect. Keep DB access general (§7); isolate dialect specifics.
"We can add tests once the structure settles",Untested scaffolds never settle. A smoke test on the health endpoint is the verification gate (§8 Phase 4).
```

---

## Cross-References

This file complements other A1 resources and persona files:

```toon
crossRefs[6]{Topic,File,Section}:
Pfizer naming conventions / SQL patterns,a1-development.md,Pfizer Conventions / Performance Patterns
Deployment / CI/CD / backup,a5-infrastructure.md,Full file
Auth / PHI/PII / security patterns,a7-security.md,Full file
Architecture pattern selection,a6-business-analysis.md,Architecture Pattern Selection
Pre-existing component reuse,a9-reusable-components.md,Pre-Check Protocol
Testing strategy for new projects,a2-testing.md,Tool Selection / Strategy
```

## Sources

Content in this file is validated against:

- **Bulletproof React** (alan2207, 35k stars) — feature-based structure, API layer, state management, ESLint enforcement
- **Node.js Best Practices** (goldbergyoni, 105k stars) — business component structure, 3-tier layering, utilities as packages, config checklist
- **The Twelve-Factor App** (Adam Wiggins / Heroku) — Factor III Config (env vars, open-source litmus test, §5), Factor IV backing services, Factor X dev/prod parity
- **Pfizer field experience** — Snowflake patterns (as data-workload sub-scope), FastAPI conventions, ADLC workflow integration
