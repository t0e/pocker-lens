# PocketLens

> PocketLens is a multilingual personal finance tracker focused on fast transaction capture through receipts, natural-language input, and a mobile-first interface.

---

## ⚠️ Current Implementation Status

**Phase 4: Fast Entry + Natural-Language Transaction Input (Active & Completed)**

The project is under active development. Phase 4 introduces:
- **Local Deterministic Natural-Language Parser**: Zero paid API dependency architecture (`RuleBasedParser`) parsing natural language into structured transaction drafts.
- **Bilingual English & Vietnamese Support**: Dictionary and regex-driven detection for numbers/multipliers (`85k`, `80 nghìn`, `32tr`, `2 triệu`, `2m`), types, accounts, categories, and simple dates (`today`, `yesterday`, `hôm nay`, `hôm qua`).
- **Human-in-the-Loop Confirmation**: Natural language input parses into a live preview draft for review/edit before saving; never silently writes to the database.
- **Smart Account & Category Ingestion**: Context-aware account resolution scoped strictly to the authenticated user's active accounts and categories.
- **Mobile-First Quick Add**: Modal supporting both natural quick add and comprehensive manual entry, with keyboard shortcuts (`N`, `Cmd+K` / `Ctrl+K`) and transaction repeat shortcuts.

*Receipt scanning OCR and background processing pipeline belong to Phase 5.*

---

## 🎯 Project Goals

- **Lightning-Fast Transaction Capture**: Log expenses in seconds using receipt scanning, quick natural language entry, and keyboard shortcuts.
- **Multilingual Input & Processing**: Built with first-class support for English and Vietnamese inputs and currency formats.
- **Mobile-First Experience**: Designed primarily for mobile web and PWA usage, while providing a clean responsive desktop dashboard.
- **Reliable Background Pipeline**: Asynchronous background worker architecture for receipt processing and image storage.
- **Privacy & Ownership**: Docker-first local development with strict user data isolation and decimal-accurate balance tracking.

---

## 🚀 Roadmap

- [x] **Phase 1: Project Foundation** (Monorepo, Docker Compose, API/Worker scaffolds, PostgreSQL, Redis, healthchecks)
- [x] **Phase 2: Authentication + Financial Accounts** (Auth, session cookies, accounts CRUD, multi-currency, ownership enforcement)
- [x] **Phase 3: Transactions & Cash Flow** (Income/expense logging, atomic same-currency transfers, categories, monthly summaries)
- [x] **Phase 4: Fast Entry + Natural-Language Input** (English + Vietnamese rule-based parser, quick-add modal, draft preview, confirm flow)
- [ ] **Phase 5: Receipt Scanning, OCR Pipeline & Multi-Currency Analytics**

---

## 🏗 Architecture & Tech Stack

### Architecture Overview

```text
Browser (Web Frontend — Port 3000)
   │
   ├── Next.js App Router (Auth Context, Dashboard, Accounts, Transactions Feed, Quick Add Modal)
   │
   ▼
Backend API (Fastify / TypeScript — Port 4000)
   │
   ├── Auth Service (Bcrypt Password Hashing, Signed HttpOnly Session Cookies)
   ├── Accounts Service (CRUD, Ownership Isolation, Decimal Precision)
   ├── Transactions Service (Atomic Expense/Income/Transfer, Reversal on Delete/Edit)
   ├── Natural-Language Parser (RuleBasedParser with English & Vietnamese Dictionaries)
   ├── Categories Service (System Default Seeds + Custom User Categories)
   ├── Monthly Summary Service (Per-Currency Cash Flow Calculation)
   ├── PostgreSQL 16 (Users, Sessions, Accounts, Categories, Transactions — Port 5432)
   ├── Redis 7 (Session Cache & Queue Infrastructure — Port 6379)
   └── Named Volume (/data/receipts — Receipt Image Storage)
          ▲
          │
Background Worker (Node.js / BullMQ)
```

### Tech Stack

- **Frontend**: Next.js 14 (App Router), React 18, Tailwind CSS, Lucide Icons
- **Backend API**: Node.js, Fastify, TypeScript, Prisma ORM, Bcrypt, Zod, Pino
- **Natural Language Parsing**: Local deterministic rule-based engine (`@pocketlens/shared/parser`) with modular dictionaries (`en.ts`, `vi.ts`)
- **Background Worker**: Node.js, TypeScript, BullMQ, ioredis
- **Database**: PostgreSQL 16 (`DECIMAL(19,4)` money columns)
- **Cache & Queue**: Redis 7
- **Storage**: Pluggable storage provider (`LocalStorageProvider` targeting `/data/receipts`)
- **Infrastructure**: Docker, Docker Compose, npm workspaces

---

## 📁 Repository Structure

```text
pocket-lens/
├── apps/
│   ├── web/                    # Next.js App Router responsive frontend shell
│   │   ├── src/app/            # App Router pages (Dashboard, Transactions, Accounts, Login, Register, etc.)
│   │   ├── src/components/     # Layout, navigation, modals, and UI primitives
│   │   ├── src/context/        # AuthContext and session state
│   │   └── src/lib/            # Typed API client and currency formatters
│   │
│   ├── api/                    # Node.js + Fastify backend API
│   │   ├── prisma/             # Prisma schema and migrations (Users, Sessions, Accounts, Categories, Transactions)
│   │   └── src/                # Auth, accounts, categories, transactions, parser routes, DB & Redis clients
│   │
│   └── worker/                 # Node.js + TypeScript background worker
│       └── src/                # BullMQ queue registration and lifecycle
│
├── packages/
│   └── shared/                 # Shared TypeScript types, validation schemas, currency constants, and natural language parser
│
├── docker/                     # Service Dockerfiles (api, worker, web)
├── docker-compose.yml          # Canonical development orchestrator
├── .env.example                # Canonical environment template
├── .gitignore                  # Git safety configuration
└── README.md
```

---

## 🛠 Local Development & Docker Instructions

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & Docker Compose
- [Node.js](https://nodejs.org/) v20+ (for local host tooling)

### 1. Quick Start with Docker

1. Clone the repository and copy the environment template:
   ```bash
   cp .env.example .env
   ```

2. Start all services using Docker Compose:
   ```bash
   docker compose up --build
   ```

3. Access the services:
   - **Web Application**: [http://localhost:3000](http://localhost:3000)
   - **API Health Check**: [http://localhost:4000/health](http://localhost:4000/health)

4. Stop services (preserving database and receipt storage data):
   ```bash
   docker compose down
   ```

---

## 🧪 Testing & Verification

Run tests, type-checks, and linter across all workspaces:

```bash
# Run all unit, integration, parser, and API tests
npm test

# Run TypeScript type-checking
npm run type-check

# Run ESLint across packages
npm run lint

# Build all packages and applications
npm run build
```

---

## 📄 License

Private & Proprietary. All rights reserved.
