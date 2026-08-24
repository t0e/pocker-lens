# PocketLens — Project Handoff & Progress Reference

> **Purpose of this document**: This document is the single persistent source of truth for the PocketLens codebase. It enables any AI assistant or developer to reconstruct the full context, architectural rules, operational flows, database invariants, completed phases, and upcoming roadmap without relying on prior conversation history.

---

## 1. Project Name and Purpose

**PocketLens** is a modern, privacy-respecting personal finance and expense tracking platform tailored for multi-currency management (VND, USD, EUR, JPY, SGD, etc.), receipt scanning with local OCR (English & Vietnamese), category budgeting, subscription tracking, and automated recurring transactions.

---

## 2. Monorepo & Folder Structure

PocketLens is organized as an **npm workspaces** monorepo:

```text
pocket-lens/
├── apps/
│   ├── api/                 # Fastify REST API backend (TypeScript, Node.js)
│   │   ├── prisma/          # Prisma schema, migrations, seed data
│   │   └── src/
│   │       ├── auth/        # Session token hashing and validation
│   │       ├── config/      # Environment configuration (Zod validation)
│   │       ├── db/          # Prisma client singleton
│   │       ├── plugins/     # Fastify auth & security plugins
│   │       ├── routes/      # Endpoints (auth, accounts, categories, transactions, receipts, budgets, recurring)
│   │       ├── services/    # Business services (recurring generation, accounting)
│   │       └── app.ts       # Fastify instance builder
│   ├── web/                 # Next.js 14 App Router frontend (React, Tailwind CSS, Lucide icons)
│   │   ├── src/
│   │   │   ├── app/         # Next.js routes (/, /login, /register, /transactions, /accounts, /receipts, /budgets, /settings)
│   │   │   ├── components/  # Modals, navigation, layout, UI primitives
│   │   │   ├── context/     # AuthContext (cookie-based session state)
│   │   │   └── lib/         # API client & currency formatting utilities
│   └── worker/              # Background BullMQ worker for receipt OCR and recurring scheduler
│       └── src/
│           ├── config/      # Worker environment configuration
│           ├── ocr/         # Tesseract OCR engine wrapper (eng + vie)
│           ├── processor/   # Receipt extraction pipeline
│           ├── queue/       # Redis / BullMQ connection
│           └── scheduler/   # Periodic recurring transaction runner
├── packages/
│   └── shared/              # Shared types, Zod schemas, date math, receipt parsers, storage contracts
│       └── src/
│           ├── account/     # Account validation schemas
│           ├── auth/        # Auth DTOs & password requirements
│           ├── budget/      # Budget DTOs, schemas, and month bound helpers
│           ├── category/    # Category types & default category list
│           ├── currency/    # Currency codes, decimal places, formatting
│           ├── ocr/         # OCR result interfaces
│           ├── parser/      # Deterministic bilingual (EN/VI) receipt parser & dictionary
│           ├── queue/       # BullMQ queue names and job payload interfaces
│           ├── receipt/     # Receipt DTOs and MIME validations
│           ├── recurring/   # Recurrence frequency, clamping date math, projection calculators
│           ├── storage/     # Storage abstraction (Local disk / S3-ready)
│           └── transaction/ # Transaction schemas & cashflow calculation
├── docker/                  # Dockerfiles for api, worker, and web
├── docker-compose.yml       # Production/local multi-service orchestration
└── docs/                    # Architecture and documentation handoff
```

---

## 3. Technology Stack

- **Runtime**: Node.js 20 LTS
- **Languages**: TypeScript (Strict mode across all packages)
- **Monorepo Manager**: npm workspaces
- **API Framework**: Fastify v4 (with `@fastify/cors`, `@fastify/cookie`, `@fastify/helmet`, `@fastify/multipart`, `@fastify/sensible`)
- **Frontend Framework**: Next.js 14 (App Router, React 18, Tailwind CSS, Lucide React)
- **Database & ORM**: PostgreSQL 16 + Prisma ORM v5
- **Task Queue & Caching**: Redis 7 + BullMQ v5
- **OCR Engine**: Tesseract.js (local OCR with `eng` and `vie` training data)
- **Validation**: Zod (shared across frontend and backend)
- **Testing**: Vitest across all workspaces

---

## 4. Docker Services and Topology

The `docker-compose.yml` orchestrates five containers on the `pocketlens_network` bridge:

1. **`postgres`** (`postgres:16-alpine`): Port `5432:5432`. Stores relational data with persistent volume `postgres_data`.
2. **`redis`** (`redis:7-alpine`): Port `6379:6379`. Queue backend for BullMQ with volume `redis_data`.
3. **`api`** (`apps/api` via `docker/api.Dockerfile`): Port `4000:4000`. Authenticated REST endpoints. Mounts `receipt_data` volume at `/data/receipts`.
4. **`worker`** (`apps/worker` via `docker/worker.Dockerfile`): Background consumer for receipt OCR extraction and recurring transaction cron execution. Mounts `receipt_data` volume at `/data/receipts`.
5. **`web`** (`apps/web` via `docker/web.Dockerfile`): Port `3000:3000`. Next.js web application.

---

## 5. Database Architecture & Important Constraints

### Key Models (`apps/api/prisma/schema.prisma`)
- **`User`**: Account holder (`id`, `email`, `passwordHash`, `displayName`).
- **`Session`**: State-backed auth tokens with SHA-256 token hash and expiry (`tokenHash`, `userId`, `expiresAt`).
- **`Account`**: Wallets, banks, credit cards (`userId`, `currency`, `openingBalance`, `currentBalance`, `isArchived`, `isDefault`).
  - Constraint: `currentBalance` is a high-precision `Decimal(19,4)` updated atomically upon transaction creation/edit/deletion.
- **`Category`**: System defaults or user custom categories (`name`, `type` [`EXPENSE`/`INCOME`], `icon`, `isSystem`, `isArchived`).
- **`Transaction`**: Immutable historical entries (`userId`, `type` [`EXPENSE`/`INCOME`/`TRANSFER`], `accountId`, `transferAccountId`, `categoryId`, `amount`, `currency`, `transactionDate`, `receiptId`, `recurringTransactionId`).
- **`Receipt`**: Raw image metadata (`userId`, `storagePath`, `fileName`, `fileSize`, `mimeType`, `status` [`UPLOADED`/`PROCESSING`/`READY_FOR_REVIEW`/`CONFIRMED`/`FAILED`]).
- **`ReceiptExtraction`**: Structured OCR extraction draft (`merchantName`, `totalAmount`, `taxAmount`, `receiptDate`, `language`, `confidenceScore`).
  - **`ReceiptItem`**: Extracted line items (`description`, `quantity`, `unitPrice`, `totalPrice`).
- **`Budget`**: Category spending limit for a specific month (`userId`, `categoryId`, `amount`, `currency`, `month` [Format: `YYYY-MM`]).
  - **Unique Constraint**: `@@unique([userId, categoryId, currency, month])` prevents duplicate active budgets.
- **`RecurringTransaction`**: Recurring templates and subscriptions (`userId`, `type`, `accountId`, `categoryId`, `amount`, `currency`, `frequency` [`DAILY`/`WEEKLY`/`MONTHLY`/`YEARLY`], `interval`, `startDate`, `nextRunDate`, `endDate`, `isActive`, `isSubscription`, `merchant`).
- **`RecurringOccurrence`**: Durable record of executed recurring events.
  - **Unique Constraint**: `@@unique([recurringTransactionId, scheduledFor])` enforces database-level idempotency against duplicate scheduler execution.

---

## 6. Accounting & Transaction Invariants

1. **Balance Precision**: All monetary values are represented as `Decimal(19, 4)` in database and rounded appropriately per currency for display.
2. **Transfer Isolation**:
   - `TRANSFER` transactions require matching currencies between source and destination accounts.
   - Transfers update source account (`-amount`) and destination account (`+amount`).
   - Transfers are **never counted** as income or expense and **never affect category budgets**.
3. **Multi-Currency Strictness**: Balances, budgets, and subscriptions are tracked independently per ISO currency code. No arbitrary FX mixing occurs without explicit conversion.
4. **Historical Immutability of Recurring Templates**:
   - Modifying a `RecurringTransaction` template alters future occurrences only.
   - Deleting a `RecurringTransaction` template preserves already generated historical transactions (`recurringTransactionId` set to `null`).

---

## 7. OCR & Receipt Processing Pipeline

```text
Upload Image (JPEG/PNG/WebP/HEIC)
       ↓
API validates MIME & magic bytes (< 10MB)
       ↓
Local Storage Provider saves to /data/receipts/<userId>/<uuid>.<ext>
       ↓
BullMQ Job queued on 'receipt-processing'
       ↓
Worker picks up job
       ↓
Local Tesseract OCR (eng + vie)
       ↓
Deterministic Parser (Rule-based regex & dictionary for EN/VI)
       ↓
ReceiptExtraction & ReceiptItems saved (Status: READY_FOR_REVIEW)
       ↓
User reviews in UI (Side-by-side verification)
       ↓
User confirms → Creates Transaction via Phase 3 service (Status: CONFIRMED)
```

**CRITICAL INVARIANT**: Never automatically create a real transaction directly from OCR output. It must always produce a review draft first.

---

## 8. Budgeting & Spending Engine

- **Dynamic Derived Calculation**: Budget spending is never stored as an editable column. It is derived in real-time from `Transaction` table (`Transaction.type === 'EXPENSE' && categoryId === budget.categoryId && currency === budget.currency && transactionDate within UTC month bounds`).
- **O(1) Single Aggregation Query**: Budgets for a month are computed via `prisma.transaction.groupBy({ by: ['categoryId', 'currency'] })`, completely avoiding N+1 loops.
- **Budget Statuses**:
  - `0% - 79%`: **`NORMAL`** (Emerald)
  - `80% - 99%`: **`WARNING`** (Amber)
  - `100%+`: **`OVER_BUDGET`** (Rose) with exact overage amount.
- **Expense-Only Rule**: Budgets can only be created for `EXPENSE` categories. Income categories are rejected by the API with `400 Bad Request`.
- **Month Copying**: `POST /budgets/copy` clones previous month category budgets to target month while omitting existing ones.

---

## 9. Recurring Transactions & Subscriptions Engine

- **Anchor-Preserving Date Math**:
  - `calculateNextRunDate` handles monthly 31st edge cases: `Jan 31` → `Feb 28` (or `Feb 29` in leap year) → `Mar 31` (restores original anchor day) → `Apr 30` → `May 31`.
  - Yearly leap year edge cases: `Feb 29 2024` → `Feb 28 2025` → `Feb 29 2028`.
- **Subscriptions**:
  - Items with `isSubscription: true` calculate estimated monthly costs (`calculateEstimatedMonthlyCost`) for weekly, monthly, and yearly intervals.
- **Upcoming Projections**:
  - `GET /recurring/upcoming?days=30` projects occurrences over the next 30 days without creating database records or affecting account balances.
- **Worker Scheduler Execution**:
  - Worker runs recurring check periodically every 60 seconds and on startup.
  - Queries `nextRunDate <= now && isActive == true`.
  - Executes inside a transaction with `RecurringOccurrence` unique constraint checking (`[recurringTransactionId, scheduledFor]`).
  - Advances `nextRunDate` and auto-deactivates if past `endDate` or if account is archived.

---

## 10. Completed Phases 1–7 Summary

| Phase | Description | Key Deliverables |
|---|---|---|
| **Phase 1** | Project Setup & Monorepo Foundation | Fastify API, Next.js Web, Shared package, Tailwind CSS, Docker Compose, Vitest |
| **Phase 2** | Authentication & User Management | Cookie session auth, password hashing with salt, session revocation, auth middleware |
| **Phase 3** | Accounts & Transaction Core | Multi-currency accounts, income/expenses/transfers, balance calculation, categories |
| **Phase 4** | Receipt Storage & Processing Foundation | File validation, storage abstraction, BullMQ queue, receipt database models |
| **Phase 5** | Multilingual Receipt OCR Engine | Local Tesseract OCR (EN/VI), dictionary token matching, deterministic field extraction |
| **Phase 6** | Receipt Review & Confirmation Flow | Interactive side-by-side review modal, item editing, confirmation into transaction service |
| **Phase 7** | Budgets, Recurring & Subscriptions | Monthly category budgets, progress alerts, recurring date math, subscriptions, idempotent scheduler |

---

## 11. Current Verification Status (Phase 7 Complete)

- **Test Suite**: **150 / 150 tests passing** across 19 test files.
  - `@pocketlens/shared`: 62 tests
  - `@pocketlens/api`: 80 tests
  - `@pocketlens/worker`: 8 tests
- **TypeScript**: `npm run type-check` passes with **0 errors** across all 4 workspaces.
- **Lint**: `npm run lint` passes with **0 warnings / 0 errors**.
- **Build**: `npm run build` succeeds completely (Prisma generate, Next.js static page optimization).
- **Remote Git Status**: Pushed to `origin/main` (latest commit: `eb57793`).
- **Known Operational Limitations**:
  - *Worker Migration Race on Fresh Database*: On a completely fresh database, the worker may execute its initial recurring-scheduler check before Prisma migrations complete. The failure is handled gracefully and processing resumes on the next 60-second scheduler tick. Consider introducing a dedicated migration/init service during Phase 10 production hardening.

---

## 12. Environment Variables Reference

Create a `.env` in the repository root:

```env
NODE_ENV=development
API_PORT=4000
WEB_PORT=3000
HOST=0.0.0.0

# Database
POSTGRES_DB=pocketlens
POSTGRES_USER=pocketlens
POSTGRES_PASSWORD=pocketlens_dev_password
DATABASE_URL=postgresql://pocketlens:pocketlens_dev_password@localhost:5432/pocketlens?schema=public

# Redis & Queue
REDIS_URL=redis://localhost:6379

# Authentication
COOKIE_SECRET=super_secret_cookie_signing_key_must_be_at_least_32_characters_long_123456

# Storage
STORAGE_PROVIDER=local
RECEIPT_STORAGE_PATH=/tmp/pocketlens-receipts
```

---

## 13. How to Run & Develop

### Prerequisites
- Node.js 20+
- Docker & Docker Compose

### Local Development
```bash
# 1. Install dependencies
npm install

# 2. Start PostgreSQL and Redis via Docker
docker compose up -d postgres redis

# 3. Generate Prisma client & run migrations
npx prisma generate --schema=./apps/api/prisma/schema.prisma
npx prisma migrate dev --schema=./apps/api/prisma/schema.prisma

# 4. Build shared package
npm run build --workspace=@pocketlens/shared

# 5. Run tests
npm test

# 6. Type check
npm run type-check

# 7. Start services locally
npm run dev --workspace=@pocketlens/api
npm run dev --workspace=@pocketlens/worker
npm run dev --workspace=@pocketlens/web
```

### Full Docker Orchestration
```bash
docker compose up --build -d
```
Access UI at `http://localhost:3000` and API at `http://localhost:4000`.

---

## 14. What Phase 8 Should Implement

Phase 8 will focus on **Multi-Currency Analytics & Financial Reporting**:
- Visual spending breakdowns (category distributions, monthly spending trends).
- Multi-currency net worth dashboard with user-configured reference currencies.
- Cashflow analytics (Income vs. Expense over 3/6/12 months).
- Export capabilities (CSV/JSON export for transactions and tax records).
- Strict isolation: Continue preserving exact currency amounts without lossy auto-conversion unless explicitly requested with historical exchange rate tables.

---

## Instructions for Future AI Sessions

> **MANDATORY INSTRUCTIONS FOR ANY NEW AI ASSISTANT RESUMING THIS PROJECT**:
>
> 1. **Read this file first**: Always read `docs/PROJECT_PROGRESS.md` before making any modifications.
> 2. **Inspect Current Git State**: Run `git status` and `git log --oneline -15` to verify the working tree and latest commits.
> 3. **Never Assume Conversation Context**: Treat each session as stateless and reconstruct context strictly from the codebase and this document.
> 4. **Preserve Architectural Invariants**:
>    - Never automatically confirm OCR outputs into transactions without user review.
>    - Never count transfers as spending or income.
>    - Keep budget spending dynamic (derived from actual expense transactions).
>    - Ensure recurring transactions have database-level idempotency (`RecurringOccurrence` unique constraint).
>    - Never combine different currencies into single numbers without explicit multi-currency structures.
> 5. **Run Regression Tests After Every Change**: Ensure `npm test`, `npm run type-check`, and `npm run lint` all exit with code 0.
> 6. **Make Small, Logical Git Commits**: Commit each feature chunk cleanly with descriptive conventional commit messages.
> 7. **Push After Each Completed Phase**: Always push commits to `origin/main` upon phase completion.
> 8. **Keep This Document Updated**: Update `docs/PROJECT_PROGRESS.md` whenever new phases are implemented or architecture changes.
