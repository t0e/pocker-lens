# PocketLens

> PocketLens is a multilingual personal finance tracker focused on fast transaction capture through receipts, natural-language input, and a mobile-first interface.

---

## ⚠️ Current Implementation Status

**Phase 1: Project Foundation (Active)**

The project is currently under active foundational development. Phase 1 establishes the monorepo architecture, Docker Compose infrastructure, API server, background worker scaffold, database migration tooling, and responsive mobile-first application shell.

Financial tracking, receipt OCR extraction, AI processing, and authentication are planned for upcoming phases.

---

## 🎯 Project Goals

- **Lightning-Fast Transaction Capture**: Log expenses in seconds using receipt scanning, natural-language input, or quick entry widgets.
- **Multilingual OCR & Processing**: Built with first-class support for English and Vietnamese receipts and currency formats.
- **Mobile-First Experience**: Designed primarily for mobile web and PWA usage, while providing a clean responsive desktop dashboard.
- **Reliable Background Pipeline**: Asynchronous background worker architecture for receipt processing and image storage.
- **Privacy & Ownership**: Docker-first local development with clean separation of database records and receipt binary storage.

---

## 🚀 Planned Features

- **Balances & Accounts**: Multiple accounts (Checking, Savings, Cash wallets, Credit).
- **Income & Expense Tracking**: Categorization, tagging, and transaction management.
- **Transfers & Split Transactions**: Seamless transfers between accounts.
- **Budgets & Spending Limits**: Real-time category budget tracking and alerts.
- **Receipt Scanning**: English and Vietnamese receipt text extraction.
- **Natural-Language Entry**: Fast text-to-transaction parsing.
- **Background Processing**: Asynchronous receipt processing via BullMQ and Redis.
- **Multi-Currency & Analytics**: Multi-currency support (USD, VND, EUR) and cash flow trends.
- **Recurring Subscriptions & Duplicate Detection**: Automatic detection of recurring charges and duplicate entries.

---

## 🏗 Architecture & Tech Stack

### Architecture Overview

```text
Browser (Web Frontend)
   │
   ├── Next.js App Router (Port 3000)
   │
   ▼
Backend API (Fastify / TypeScript — Port 4000)
   │
   ├── PostgreSQL 16 (Relational Data & Migrations — Port 5432)
   ├── Redis 7 (Queues & Caching — Port 6379)
   └── Named Volume (/data/receipts — Receipt Image Storage)
          ▲
          │
Background Worker (Node.js / BullMQ)
```

### Tech Stack

- **Frontend**: Next.js (App Router), React, TypeScript, Tailwind CSS, Lucide Icons
- **Backend API**: Node.js, Fastify, TypeScript, Prisma ORM, Zod, Pino
- **Background Worker**: Node.js, TypeScript, BullMQ, ioredis
- **Database**: PostgreSQL 16
- **Cache & Queue**: Redis 7
- **Storage**: Pluggable storage provider (`LocalStorageProvider` with named Docker volume `/data/receipts`, planned `S3StorageProvider`)
- **Infrastructure**: Docker, Docker Compose, npm workspaces

---

## 📁 Repository Structure

```text
pocket-lens/
├── apps/
│   ├── web/                    # Next.js App Router responsive frontend shell
│   │   ├── src/app/            # App Router pages (Dashboard, Transactions, Budgets, etc.)
│   │   ├── src/components/     # Navigation and UI primitives
│   │   └── src/data/           # Isolated demo/mock financial data
│   │
│   ├── api/                    # Node.js + Fastify backend API
│   │   ├── prisma/             # Prisma schema and migrations
│   │   └── src/                # API routes (/health), DB, Redis, and error handling
│   │
│   └── worker/                 # Node.js + TypeScript background worker
│       └── src/                # BullMQ queue registration and lifecycle
│
├── packages/
│   └── shared/                 # Shared TypeScript types, queue contracts, and storage providers
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

### 1. Quick Start with Docker (Recommended)

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
   - **Web Health Check**: [http://localhost:3000/api/health](http://localhost:3000/api/health)

4. Stop services (preserving database and receipt storage data):
   ```bash
   docker compose down
   ```

---

## 🧪 Testing & Verification

Run tests, type-checks, and linter across all workspaces:

```bash
# Run all unit and integration tests
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
