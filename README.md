# Agentic Mall Management Platform

<div align="center">

![Next.js](https://img.shields.io/badge/Next.js-14.2-black?style=for-the-badge&logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-0.38-C5F74F?style=for-the-badge&logo=drizzle&logoColor=black)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Anthropic](https://img.shields.io/badge/Anthropic_Claude-Sonnet_4.5-D97757?style=for-the-badge&logo=anthropic&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-Deployed-000000?style=for-the-badge&logo=vercel&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)

**An AI-powered, multi-tenant property management platform built specifically for shopping malls and retail complexes.**

[Live Demo](#screenshots) · [Report Bug](https://github.com/your-username/mall-management/issues) · [Request Feature](https://github.com/your-username/mall-management/issues)

</div>

---

## Overview

The **Agentic Mall Management Platform** is a comprehensive, production-ready SaaS solution that transforms how shopping malls and retail complexes are managed in India. It consolidates tenant relationships, lease management, financial operations, maintenance workflows, POS-based revenue intelligence, and compliance tracking into a single unified platform.

At its core, the platform features an **AI agent framework** powered by Anthropic Claude that can autonomously create work orders, send payment reminders, analyse revenue data, flag compliance risks, and surface actionable insights — all with a human-in-the-loop approval workflow.

**Who is it for:**

| Stakeholder | Value Delivered |
|---|---|
| **Mall Owners** | Portfolio-level visibility and data-driven decision making |
| **Property Managers** | Automated operations with smart work order routing |
| **Finance Teams** | GST-compliant invoicing, payment tracking, MG billing |
| **Maintenance Staff** | Priority-based SLA-tracked work orders |
| **Leasing Managers** | Lease lifecycle management with renewal intelligence |
| **Tenants** | Self-service portal for invoices, requests, and communication |

---

## Features

### Implemented

#### 🏢 Property & Portfolio Management
- Multi-property portfolio management from a single dashboard
- Property details: floors, zones, total GLA, leasable area, operating hours
- Occupancy rate tracking with unit-level status
- Zone-based analytics and floor-plan organisation

#### 👥 Tenant Management
- Full tenant onboarding with KYC (GSTIN, PAN, TAN, trade licence)
- Tenant risk scoring and sentiment analysis (AI-powered)
- Multi-channel communication history (chat, email, WhatsApp, phone)
- Tenant self-service portal with invoice access and request submission

#### 📋 Lease Management
- Three lease types: **Fixed Rent**, **Revenue Share**, **Hybrid (MG-based)**
- Minimum Guarantee (MG) billing engine: `amountDue = max(MG, revShare)`
- Automated escalation clause tracking with configurable rent step-ups
- Lock-in periods, notice periods, CAM charge management
- Lease expiry alerts and renewal recommendation engine
- Security deposit ledger

#### 💰 Financial Management
- Automated invoice generation (Rent, CAM, Utilities, Late Fees)
- GST-compliant invoicing in INR
- Payment tracking and bank reconciliation
- Dunning automation: configurable payment reminder sequences (cron-driven)
- Revenue analytics with YoY comparisons and anomaly detection

#### 📊 Revenue Intelligence
- Real-time POS data aggregation across **7 providers**:
  `Pine Labs · Petpooja · Razorpay POS · POSist · Shopify · Lightspeed · Vend`
- MG billing calculations with period-accurate proration
- Sales/sqft KPI, zone-level breakdown, tenant leaderboard
- 28-day sales heatmap calendar
- YoY growth tracking (seasonality-aware)
- Automated anomaly detection (POS downtime, data gaps, revenue drops)
- Encrypted POS API key storage (AES-256-GCM)

#### 🔧 Maintenance & Work Orders
- Work order creation, priority routing (Low → Critical), and SLA tracking
- Equipment asset register with predictive maintenance scheduling
- Vendor assignment, performance scoring, and SLA compliance metrics
- Auto-created work orders from AI agents

#### ✅ Compliance Management
- Regulatory requirement register with document expiry tracking
- Risk-level classification (Low / Medium / High / Critical)
- Automated reminder schedules (configurable days before expiry)
- Compliance status dashboard with audit trail

#### 🤖 AI Agent Framework
- **6 specialised agents**: Operations Commander, Tenant Relations, Financial, Maintenance, Space Optimisation, Compliance
- **Agent tools**: create work orders, send reminders, analyse data, make recommendations
- Human-in-the-loop approval workflow for all agent actions
- Agent action and decision logs with confidence scores and reasoning
- Real-time agent activity stream via Server-Sent Events

#### 👤 Authentication & RBAC
- NextAuth v5 with JWT strategy
- **8 role levels**: Super Admin → Organisation Admin → Property Manager → Finance Manager → Maintenance Manager → Leasing Manager → Tenant → Viewer
- 40+ granular permissions with wildcard support (`properties:*`, `invoices:read`)
- PostgreSQL Row-Level Security (RLS) for data isolation
- Multi-tenant subdomain routing (`tenant.mallos.com`)

#### 💳 Payments & Billing
- **Razorpay** and **Stripe** payment gateway integration
- Webhook-based payment event processing with idempotency
- Subscription billing for SaaS tier management
- Automated dunning sequences via cron (every 15 minutes)

#### 🔗 Integrations
- **POS Webhooks**: Pine Labs, Petpooja, Razorpay POS (HMAC-verified, idempotent)
- **Email**: Resend for transactional emails
- **Cache**: Upstash Redis for session and org-context caching

### Upcoming / Planned

- [ ] WhatsApp notification channel for tenant communications
- [ ] Advanced predictive analytics (lease renewal probability ML model)
- [ ] Footfall counter integration (mall-wide conversion rate tracking)
- [ ] Bulk lease import and data migration tooling
- [ ] Mobile-native app (React Native)
- [ ] CAM reconciliation annual statement generation
- [ ] Integration with Tally / Zoho Books for accounting sync

---

## Tech Stack

| Category | Technology |
|---|---|
| **Framework** | Next.js 14.2 (App Router, Server Components) |
| **Language** | TypeScript 5.7 |
| **Database** | PostgreSQL 16 (Neon serverless / Docker local) |
| **ORM** | Drizzle ORM 0.38 + Drizzle Kit |
| **Auth** | NextAuth v5 (JWT, Credentials provider) |
| **AI / Agents** | Anthropic Claude Sonnet 4.5 via `@anthropic-ai/sdk` |
| **UI Components** | Radix UI primitives + Tailwind CSS 3.4 |
| **Charts** | Recharts 2.15 |
| **Tables** | TanStack React Table 8 |
| **Forms** | React Hook Form 7 + Zod 3.24 |
| **State** | Zustand 5 |
| **Cache** | Upstash Redis |
| **Payments** | Razorpay 2.9 + Stripe 20.4 |
| **Email** | Resend 4.1 |
| **Deployment** | Vercel (Serverless + Edge) |
| **Containerisation** | Docker (multi-stage) + docker-compose |
| **CI/CD** | GitHub Actions |

---

## Project Structure

```
mall-management/
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── (dashboard)/            # Protected staff dashboard routes
│   │   │   ├── analytics/          # Analytics & reporting
│   │   │   ├── agents/             # AI agent monitoring
│   │   │   ├── approvals/          # Agent action approval queue
│   │   │   ├── compliance/         # Compliance management
│   │   │   ├── dashboard/          # Main dashboard
│   │   │   ├── equipment/          # Asset management
│   │   │   ├── financials/         # Financial dashboard
│   │   │   ├── leases/             # Lease management
│   │   │   ├── properties/[id]/    # Property detail pages
│   │   │   ├── revenue-intelligence/ # POS analytics & MG billing
│   │   │   ├── roles/              # RBAC role management
│   │   │   ├── settings/           # Application settings
│   │   │   ├── tenants/[id]/       # Tenant profile pages
│   │   │   ├── users/              # User management
│   │   │   ├── vendors/            # Vendor management
│   │   │   └── work-orders/        # Work order management
│   │   ├── (portal)/               # Tenant self-service portal
│   │   │   └── portal/             # Tenant-facing pages
│   │   ├── api/                    # API routes (50+ endpoints)
│   │   │   ├── agents/             # Agent management & execution
│   │   │   ├── billing/            # Subscription billing
│   │   │   ├── chat/               # Agent chat interface
│   │   │   ├── compliance/         # Compliance API
│   │   │   ├── cron/               # Scheduled background jobs
│   │   │   │   ├── pos-sync/       # Daily POS data sync
│   │   │   │   └── process-dunning/ # Payment reminder sequences
│   │   │   ├── dashboard/          # Dashboard metrics
│   │   │   ├── equipment/          # Equipment CRUD
│   │   │   ├── invoices/[id]/      # Invoice & payment APIs
│   │   │   ├── leases/             # Lease management API
│   │   │   ├── pos/                # POS integration endpoints
│   │   │   ├── properties/         # Property CRUD
│   │   │   ├── revenue-intelligence/ # Revenue analytics & MG billing
│   │   │   ├── tenants/            # Tenant CRUD
│   │   │   ├── users/              # User & role management
│   │   │   ├── vendors/            # Vendor CRUD
│   │   │   ├── webhooks/           # Payment & POS webhooks
│   │   │   │   ├── pos/            # Pine Labs, Petpooja, Razorpay POS
│   │   │   │   ├── razorpay/       # Razorpay payment webhooks
│   │   │   │   └── stripe/         # Stripe webhooks
│   │   │   ├── work-orders/        # Work order CRUD
│   │   │   └── health/             # Health check
│   │   ├── auth/login/             # Login page
│   │   └── pos-simulator/          # POS testing tool
│   ├── features/                   # Feature-Sliced modules
│   │   ├── agents/                 # AI agent definitions & tools
│   │   ├── equipment/              # Equipment feature module
│   │   ├── financials/             # Financial operations module
│   │   ├── properties/             # Property management module
│   │   ├── tenants/                # Tenant management module
│   │   ├── users/                  # User & RBAC module
│   │   ├── vendors/                # Vendor management module
│   │   └── work-orders/            # Maintenance module
│   ├── components/                 # Shared React components
│   │   ├── ui/                     # Radix UI primitives
│   │   ├── dashboard/              # Dashboard-specific components
│   │   ├── layout/                 # Sidebar, navbar, shell
│   │   ├── agents/                 # Agent activity components
│   │   ├── auth/                   # Auth guard components
│   │   └── chat/                   # AI chat interface
│   ├── lib/
│   │   ├── db/                     # Database client, schema (25+ tables)
│   │   ├── auth/                   # NextAuth config, RBAC, permissions
│   │   ├── agents/                 # Orchestrator, tools, prompts
│   │   │   ├── tools/              # Agent tool implementations
│   │   │   ├── prompts/            # System prompts per agent type
│   │   │   └── orchestrator.ts     # Agentic loop execution engine
│   │   ├── cache/                  # Upstash Redis cache layer
│   │   ├── crypto/                 # AES-256-GCM API key encryption
│   │   ├── pos/                    # POS provider adapters & factory
│   │   └── revenue/                # Billing engine & KPI engine
│   ├── stores/                     # Zustand client state
│   ├── hooks/                      # Custom React hooks
│   └── common/
│       ├── constants/              # App-wide constants
│       ├── types/                  # Shared TypeScript types
│       └── utils/                  # Utility functions
├── scripts/
│   ├── migrations/                 # Raw SQL migrations (001–005)
│   └── seed.ts                     # Database seed script
├── docs/
│   └── PRODUCT_OVERVIEW.md         # Product documentation
├── docker-compose.yml              # Local dev stack (PG 16 + Redis 7)
├── Dockerfile                      # Multi-stage production image
├── vercel.json                     # Vercel deployment + cron config
├── drizzle.config.ts               # Drizzle ORM configuration
└── .env.local                      # Local environment variables
```

---

## Installation

### Prerequisites

- **Node.js** 20+
- **pnpm** 9+ (or npm / yarn)
- **PostgreSQL** 16+ (local or [Neon](https://neon.tech) serverless)
- **Docker** (optional, for the full local stack)

### Option A — Docker (Recommended for local dev)

The easiest way to get a fully working local environment with PostgreSQL and Redis:

```bash
# 1. Clone the repository
git clone https://github.com/your-username/mall-management.git
cd mall-management

# 2. Copy the environment file
cp .env.local.example .env.local
# Edit .env.local with your values (see Environment Variables section)

# 3. Start PostgreSQL and Redis via Docker Compose
docker-compose up -d

# 4. Install dependencies
pnpm install

# 5. Run database migrations
pnpm db:migrate

# 6. Seed initial data
pnpm db:seed

# 7. Start the development server
pnpm dev
```

The app will be available at `http://localhost:3000`.

### Option B — Manual Setup

```bash
# 1. Clone the repository
git clone https://github.com/your-username/mall-management.git
cd mall-management

# 2. Install dependencies
pnpm install

# 3. Configure environment variables
cp .env.local.example .env.local
# Edit .env.local — set DATABASE_URL to your PostgreSQL connection string

# 4. Push schema to the database
pnpm db:migrate

# 5. Seed the database
pnpm db:seed

# 6. Start the development server
pnpm dev
```

---

## Environment Variables

Create a `.env.local` file in the project root. All variables marked **Required** must be set before the app will start.

```bash
# ── Database ──────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://user:password@localhost:5432/mallmanagement
# Optional: separate service-role connection for background jobs
DATABASE_SERVICE_URL=postgresql://service_user:password@localhost:5432/mallmanagement

# ── Authentication ────────────────────────────────────────────────────────────
AUTH_SECRET=                       # Required. Generate: openssl rand -base64 32
AUTH_URL=http://localhost:3000     # Required. Your deployment URL in production

# ── AI (Anthropic) ────────────────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-...       # Required for AI agents. Leave unset for mock mode.

# ── Cache (Upstash Redis) ─────────────────────────────────────────────────────
UPSTASH_REDIS_REST_URL=https://...  # Optional. Falls back to direct DB without cache.
UPSTASH_REDIS_REST_TOKEN=...        # Optional.

# ── Payments ──────────────────────────────────────────────────────────────────
STRIPE_SECRET_KEY=sk_...            # Required for Stripe billing
STRIPE_WEBHOOK_SECRET=whsec_...     # Required for Stripe webhook verification
RAZORPAY_KEY_ID=rzp_...             # Required for Razorpay
RAZORPAY_KEY_SECRET=...             # Required for Razorpay

# ── Email (Resend) ────────────────────────────────────────────────────────────
RESEND_API_KEY=re_...               # Optional. Logs to console if unset.

# ── Cron Security ────────────────────────────────────────────────────────────
CRON_SECRET=...                    # Required in production (Bearer token for cron routes)

# ── Domain (Multi-tenant Subdomain Routing) ───────────────────────────────────
NEXT_PUBLIC_ROOT_DOMAIN=mallos.com         # Root domain for subdomain routing
NEXT_PUBLIC_APP_URL=http://localhost:3000  # Public URL for redirects & links
```

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ Yes | PostgreSQL connection string |
| `DATABASE_SERVICE_URL` | No | Separate connection for background jobs; falls back to `DATABASE_URL` |
| `AUTH_SECRET` | ✅ Yes | Secret for signing JWT sessions |
| `AUTH_URL` | ✅ Yes | Canonical URL of the deployment |
| `ANTHROPIC_API_KEY` | Recommended | Anthropic API key; without it, agents return mock responses |
| `UPSTASH_REDIS_REST_URL` | No | Redis URL; without it, cache is skipped |
| `UPSTASH_REDIS_REST_TOKEN` | No | Redis auth token |
| `STRIPE_SECRET_KEY` | For billing | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | For billing | Stripe webhook signing secret |
| `RAZORPAY_KEY_ID` | For payments | Razorpay API key ID |
| `RAZORPAY_KEY_SECRET` | For payments | Razorpay API key secret |
| `RESEND_API_KEY` | No | Resend API key for transactional emails |
| `CRON_SECRET` | Production | Bearer token that Vercel sends with cron requests |
| `NEXT_PUBLIC_ROOT_DOMAIN` | No | Root domain for subdomain-based multi-tenancy |
| `NEXT_PUBLIC_APP_URL` | No | Fully-qualified public URL |

---

## Usage

### Running the Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). You will be redirected to `/auth/login`.

Use the credentials from the seed script (default: `admin@demo.com` / `password`).

### Database Management

```bash
# Generate new migration files from schema changes
pnpm db:generate

# Apply all pending migrations
pnpm db:migrate

# Open Drizzle Studio (visual database browser)
pnpm db:studio

# Re-seed the database with demo data
pnpm db:seed
```

### Building for Production

```bash
pnpm build
pnpm start
```

### Docker Production Build

```bash
# Build the production image
docker build -t mall-management .

# Run the container
docker run -p 3000:3000 --env-file .env.local mall-management
```

### Key Workflows

**Adding a new tenant:**
1. Navigate to **Tenants** → **Add Tenant**
2. Fill in business details (GSTIN, PAN, contact)
3. Navigate to **Leases** → create a lease for the tenant
4. Connect a POS integration under the tenant's lease

**Connecting a POS provider:**
1. Open a lease record → **POS Integration** tab
2. Select the provider (e.g., Pine Labs, Petpooja)
3. Enter the provider API credentials — they are encrypted at rest (AES-256-GCM)
4. Click **Test Connection** to verify

**Reviewing agent actions:**
1. Navigate to **Approvals**
2. Review pending AI-generated actions (work orders, reminders, recommendations)
3. Approve or reject each action with optional notes

**Revenue Intelligence:**
1. Navigate to **Revenue Intelligence**
2. Select a date range or use a preset (Last Month, Last 90 Days, etc.)
3. View the sales heatmap, zone breakdown, and tenant leaderboard
4. Download the MG billing summary for month-end processing

---

## Testing

There is currently no automated test suite configured. Tests are planned for a future release.

For manual API testing, use the **POS Simulator** tool at `/pos-simulator` to generate synthetic sales data without a real POS device.

```bash
# Run type checking (catches structural and type errors)
pnpm build   # also validates TypeScript via Next.js compiler
```

---

## Deployment

### Vercel (Primary)

The project is configured for zero-configuration deployment on Vercel.

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

Vercel automatically runs two cron jobs (configured in `vercel.json`):

| Cron | Schedule | Purpose |
|---|---|---|
| `/api/cron/process-dunning` | Every 15 minutes | Send payment reminders |
| `/api/cron/pos-sync` | Daily at 2 AM | Poll POS providers for latest sales |

Set all environment variables in the Vercel project dashboard before deploying.

**Required Vercel settings:**
- Build command: `pnpm run build`
- Install command: `pnpm install`
- Output: `.next` (auto-detected)
- Node.js version: 20.x

### Docker (Self-Hosted)

```bash
# Build and start with docker-compose (includes PG + Redis)
docker-compose up --build

# Or build and run just the app container
docker build -t mall-management .
docker run -p 3000:3000 --env-file .env.local mall-management
```

### Database

The project uses **Drizzle ORM migrations** for schema management. On first deploy, run:

```bash
pnpm db:migrate   # Creates all tables and indexes
pnpm db:seed      # Inserts initial data (org, property, demo users)
```

For production, use [Neon](https://neon.tech) (PostgreSQL serverless) — the `@neondatabase/serverless` package is already included.

---

## Screenshots

> _Screenshots and a live demo link will be added here._

| Dashboard | Revenue Intelligence | Tenant Profile |
|---|---|---|
| ![Dashboard](docs/screenshots/dashboard.png) | ![Revenue Intelligence](docs/screenshots/revenue-intelligence.png) | ![Tenant](docs/screenshots/tenant.png) |

| Lease Management | AI Agent Activity | Work Orders |
|---|---|---|
| ![Leases](docs/screenshots/leases.png) | ![Agents](docs/screenshots/agents.png) | ![Work Orders](docs/screenshots/work-orders.png) |

---

## Contributing

Contributions are welcome. Please follow these steps:

1. **Fork** the repository
2. **Create** a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Commit** your changes following the conventional commits format:
   ```bash
   git commit -m "feat: add lease renewal notification"
   ```
4. **Push** to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```
5. **Open a Pull Request** against the `main` branch

### Contribution Guidelines

- Run `pnpm build` before opening a PR — it must pass TypeScript and lint checks
- Maintain the feature-sliced architecture: business logic belongs in `features/` or `lib/`, not in `app/`
- New database columns require a migration in `scripts/migrations/` using sequential numbering (e.g., `006_...sql`)
- Environment variables must be documented in this README and in `.env.local.example`
- Keep API routes thin — delegate to service functions in `features/` or `lib/`

---

## License

This project is licensed under the **MIT License**.

```
MIT License

Copyright (c) 2025 Prabhdeep

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

<div align="center">

Built with Next.js, PostgreSQL, and Anthropic Claude for the future of retail property management in India.

</div>
