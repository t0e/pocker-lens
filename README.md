# PocketLens

> PocketLens is a multilingual personal finance tracker focused on fast transaction capture through receipts, natural-language input, and a mobile-first interface.

---

## ⚠️ Current Implementation Status

**Phase 2: Authentication + Financial Accounts (Active & Completed)**

The project is under active development. Phase 2 introduces:
- **Secure Authentication**: Backend-managed session tokens with signed HttpOnly cookies, salted password hashing with bcrypt, and session validation.
- **Financial Accounts Management**: Cash wallets, bank accounts, credit cards, and savings accounts.
- **Multi-Currency Support**: ISO 4217 currencies (VND, USD, EUR, GBP, JPY, SGD, etc.) stored with decimal-safe PostgreSQL `NUMERIC(19,4)` precision and grouped accurately without fake conversion rates.
- **Strict Data Ownership**: User-scoped queries with 404 responses for cross-user isolation.
- **Responsive Web UI**: Next.js App Router authenticated shell, login/register flows, and accounts management with empty states.

*Transactions, receipt scanning OCR, and budgets are scheduled for subsequent phases.*

---

## 🎯 Project Goals

- **Lightning-Fast Transaction Capture**: Log expenses in seconds using receipt scanning, natural-language input, or quick entry widgets.
- **Multilingual OCR & Processing**: Built with first-class support for English and Vietnamese receipts and currency formats.
- **Mobile-First Experience**: Designed primarily for mobile web and PWA usage, while providing a clean responsive desktop dashboard.
- **Reliable Background Pipeline**: Asynchronous background worker architecture for receipt processing and image storage.
- **Privacy & Ownership**: Docker-first local development with strict user data isolation and decimal-accurate balance tracking.

---

## 🚀 Roadmap

- [x] **Phase 1: Project Foundation** (Monorepo, Docker Compose, API/Worker scaffolds, PostgreSQL, Redis, healthchecks)
- [x] **Phase 2: Authentication + Financial Accounts** (Auth, session cookies, accounts CRUD, multi-currency, ownership enforcement)
- [ ] **Phase 3: Transactions & Cash Flow** (Income/expense logging, transfers, categories, balance updates)
- [ ] **Phase 4: Receipt Scanning & OCR Pipeline** (English & Vietnamese receipt extraction, BullMQ processing)
- [ ] **Phase 5: Budgets, Subscriptions & Multi-Currency Analytics**

---

## 🏗 Architecture & Tech Stack

### Architecture Overview

```text
Browser (Web Frontend — Port 3000)
   │
   ├── Next.js App Router (Auth Context, Mobile/Desktop Shell, Accounts Management)
   │
   ▼
Backend API (Fastify / TypeScript — Port 4000)
   │
   ├── Auth Service (Bcrypt Password Hashing, Signed HttpOnly Session Cookies)
   ├── Accounts Service (CRUD, User Ownership Isolation, Decimal Precision)
   ├── PostgreSQL 16 (Users, Sessions, Accounts, Migrations — Port 5432)
   ├── Redis 7 (Session Cache & Queue Infrastructure — Port 6379)
   └── Named Volume (/data/receipts — Receipt Image Storage)
          ▲
          │
Background Worker (Node.js / BullMQ)
```

### Tech Stack

- **Frontend**: Next.js 14 (App Router), React 18, Tailwind CSS, Lucide Icons
- **Backend API**: Node.js, Fastify, TypeScript, Prisma ORM, Bcrypt, Zod, Pino
- **Background Worker**: Node.js, TypeScript, BullMQ, ioredis
- **Database**: PostgreSQL 16
- **Cache & Queue**: Redis 7
- **Storage**: Pluggable storage provider (`LocalStorageProvider` targeting `/data/receipts`)
- **Infrastructure**: Docker, Docker Compose, npm workspaces

---

## 📁 Repository Structure

```text
pocket-lens/
├── apps/
│   ├── web/                    # Next.js App Router responsive frontend shell
│   │   ├── src/app/            # App Router pages (Dashboard, Accounts, Login, Register, etc.)
│   │   ├── src/components/     # Layout, navigation, and UI primitives
│   │   ├── src/context/        # AuthContext and session state
│   │   └── src/lib/            # Typed API client and currency formatters
│   │
│   ├── api/                    # Node.js + Fastify backend API
│   │   ├── prisma/             # Prisma schema and migrations (Users, Sessions, Accounts)
│   │   └── src/                # Auth, accounts, health routes, DB & Redis clients
│   │
│   └── worker/                 # Node.js + TypeScript background worker
│       └── src/                # BullMQ queue registration and lifecycle
│
├── packages/
│   └── shared/                 # Shared TypeScript types, validation schemas, currency constants, and storage interfaces
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
# Run all unit, integration, and API tests
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
