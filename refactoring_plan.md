# Mall Management Refactoring Plan

## Project Overview & Issues Found

The `Mall-Management` project is a Next.js application utilizing Drizzle ORM for database interactions, NextAuth for authentication, and Anthropic AI SDK for agent orchestration. The application provides various features for managing mall operations, including tenants, leases, financials, maintenance, and AI-powered insights.

### Current Architecture Observations:

1.  **Next.js Application:** The project is built with Next.js, leveraging its `app` router for routing and API routes.
2.  **Database:** Drizzle ORM is used for database schema definition and queries, interacting with a PostgreSQL database (likely Neon DB based on `@neondatabase/serverless`).
3.  **Authentication:** NextAuth.js handles user authentication.
4.  **AI Agents:** An agent orchestration system is implemented using Anthropic AI, with various specialized agents (e.g., Financial Analyst).
5.  **State Management:** Zustand is used for client-side state management, particularly for property selection.
6.  **UI Components:** Shadcn/ui (implied by `@radix-ui` and `tailwind-merge` dependencies) is used for UI components.

### Identified Issues and Code Smells:

1.  **Monolithic `src/lib` Directory:** The `src/lib` directory serves as a catch-all for a wide range of concerns, including database setup, caching, authentication logic, utility functions, validation schemas, and AI agent implementations. This leads to:
    *   **High Coupling:** Different modules within `lib` are tightly coupled, making it difficult to modify one part without potentially affecting others.
    *   **Lack of Clear Boundaries:** The purpose and responsibilities of files within `lib` are not always immediately clear, hindering maintainability and onboarding for new developers.
    *   **Scalability Concerns:** As the project grows, this directory will become increasingly unwieldy and difficult to navigate.

2.  **API Route Logic:** API routes (`src/app/api/.../route.ts`) often contain a mix of concerns: request parsing, input validation, business logic, data access, and response formatting. This violates the **Single Responsibility Principle** and makes testing and maintenance challenging.

3.  **Component Organization:** While `src/components` is somewhat categorized, there's a mix of generic UI components (`ui`) and domain-specific components (e.g., `dashboard`, `agents`). A clearer separation could improve modularity.

4.  **Agent Module Structure:** The AI agent implementations are spread across multiple subdirectories within `src/lib/agents` (`implementations`, `prompts`, `tools`). While this provides some structure, a more cohesive module approach could be beneficial.

5.  **Generic Error Handling:** API routes often use generic error messages like `"Internal server error"`. More specific error handling and a standardized error response format would improve debugging and client-side error management.

6.  **Configuration Management:** Environment variables are accessed directly in some files (e.g., `ANTHROPIC_API_KEY` in `orchestrator.ts`). While functional, a centralized configuration module could provide better type safety and organization for application-wide settings.

## New Recommended File Structure

To address the identified issues, I propose a **feature-sliced architecture** combined with **domain-driven design** principles. This approach groups code by feature or domain, making it more modular, scalable, and easier to understand. Infrastructure concerns will be separated into a dedicated `core` directory.

```
src/
├── app/                      # Next.js App Router (UI and API routes)
│   ├── (auth)/               # Authentication related pages
│   │   └── login/
│   │       └── page.tsx
│   ├── (dashboard)/          # Main application layout and dashboard pages
│   │   ├── dashboard/
│   │   │   └── page.tsx
│   │   ├── layout.tsx
│   │   └── ... (other dashboard pages)
│   ├── api/                  # API routes (thin controllers, delegate to services)
│   │   ├── auth/             # NextAuth.js API routes
│   │   │   └── [...nextauth]/
│   │   │       └── route.ts
│   │   ├── v1/               # Versioned API routes
│   │   │   ├── agents/       # Agent-related API endpoints
│   │   │   │   └── route.ts
│   │   │   ├── compliance/
│   │   │   │   └── route.ts
│   │   │   ├── dashboard/
│   │   │   │   └── route.ts
│   │   │   ├── invoices/
│   │   │   │   ├── [id]/
│   │   │   │   │   ├── payment/
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   ├── reminder/
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   └── route.ts
│   │   │   │   └── route.ts
│   │   │   ├── properties/
│   │   │   │   └── route.ts
│   │   │   ├── tenants/
│   │   │   │   └── route.ts
│   │   │   └── ... (other API routes)
│   │   └── health/
│   │       └── route.ts      # Simple health check endpoint
│   └── globals.css
├── common/                   # Shared types, constants, and utilities used across domains
│   ├── constants/
│   │   └── index.ts
│   ├── types/
│   │   └── index.ts
│   └── utils/
│       └── index.ts
├── components/               # Reusable UI components (presentational only)
│   ├── ui/                   # Shadcn/ui components (as is)
│   │   └── ...
│   ├── layout/               # Layout-specific components (e.g., Header, Sidebar)
│   │   └── ...
│   └── shared/               # Generic, non-domain-specific components
│       └── ...
├── core/                     # Core infrastructure and cross-cutting concerns
│   ├── auth/                 # Authentication logic (NextAuth config, RBAC)
│   │   ├── config.ts
│   │   ├── permissions.ts
│   │   └── rbac.ts
│   ├── cache/                # Caching mechanisms (Redis, utilities)
│   │   ├── index.ts
│   │   └── redis.ts
│   ├── config/               # Centralized application configuration
│   │   └── index.ts
│   ├── db/                   # Database connection and schema definitions
│   │   ├── index.ts
│   │   └── schema.ts
│   ├── errors/               # Custom error classes and error handling utilities
│   │   └── index.ts
│   └── logging/              # Logging utilities
│       └── index.ts
├── features/                 # Domain-specific features (grouped by domain)
│   ├── agents/               # AI Agent module
│   │   ├── api/              # Agent-specific API interactions (if any)
│   │   ├── components/       # Agent-specific UI components
│   │   ├── hooks/
│   │   ├── orchestrator.ts   # Agent orchestration logic
│   │   ├── services/         # Business logic for agents
│   │   │   ├── compliance-agent.ts
│   │   │   ├── financial-agent.ts
│   │   │   └── ...
│   │   ├── types/
│   │   ├── prompts/
│   │   │   └── ...
│   │   └── tools/
│   │       └── ...
│   ├── compliance/           # Compliance management feature
│   │   ├── api/
│   │   ├── components/
│   │   ├── services/
│   │   ├── types/
│   │   └── validations/
│   ├── dashboard/            # Dashboard feature
│   │   ├── api/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── types/
│   ├── financials/           # Financial management feature (invoices, payments, expenses)
│   │   ├── api/
│   │   ├── components/
│   │   ├── services/
│   │   ├── types/
│   │   └── validations/
│   ├── leases/               # Lease management feature
│   │   ├── api/
│   │   ├── components/
│   │   ├── services/
│   │   ├── types/
│   │   └── validations/
│   ├── properties/           # Property management feature
│   │   ├── api/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── stores/           # Zustand store for properties
│   │   │   └── property-store.ts
│   │   ├── types/
│   │   └── validations/
│   ├── tenants/              # Tenant management feature
│   │   ├── api/
│   │   ├── components/
│   │   ├── services/
│   │   ├── types/
│   │   └── validations/
│   └── ... (other features like equipment, work-orders, users, roles, vendors)
├── hooks/                    # Global React hooks (not tied to a specific feature)
│   └── ...
├── styles/                   # Global styles and TailwindCSS configuration
│   └── ...
└── types/                    # Global TypeScript types (if any, otherwise move to common/types)
    └── ...
```

## Explanation of Structural Changes

### 1. `src/app/api/v1` for Versioned API Routes

*   **Why:** Introducing a `v1` subdirectory under `api` allows for API versioning. This is crucial for scalability and maintaining backward compatibility as the application evolves. If future API changes are incompatible, a `v2` can be introduced without breaking existing clients.
*   **Impact:** All existing API routes will be moved under `src/app/api/v1/`. The `route.ts` files will become thin controllers, primarily responsible for request parsing, input validation (delegating to validation schemas), calling appropriate service layer functions, and formatting responses. Business logic will be extracted into dedicated service files within the `features` directory.

### 2. `core/` for Infrastructure and Cross-Cutting Concerns

*   **Why:** The original `src/lib` was a monolith. By creating a `core/` directory, we explicitly separate infrastructure concerns (database, caching, authentication setup, logging, error handling) from business logic. This adheres to the **Dependency Inversion Principle** and **Separation of Concerns**.
    *   **`core/auth`:** Contains NextAuth configuration, RBAC logic, and permission definitions. This centralizes all authentication-related infrastructure.
    *   **`core/cache`:** Houses caching mechanisms (e.g., Redis client setup, caching utilities). This allows for easy swapping of caching providers if needed.
    *   **`core/config`:** A new directory for centralized application configuration. This can include environment-dependent settings, constants, and feature flags, providing a single source of truth.
    *   **`core/db`:** Contains the Drizzle ORM setup (`index.ts`) and schema definitions (`schema.ts`). This makes the database layer an interchangeable component.
    *   **`core/errors`:** For custom error classes and a centralized error handling strategy. This improves consistency and provides more meaningful error messages to clients.
    *   **`core/logging`:** For a standardized logging utility, allowing for consistent log formats and easy integration with external logging services.
*   **Impact:** Files like `src/lib/db/index.ts`, `src/lib/db/schema.ts`, `src/lib/cache/index.ts`, `src/lib/cache/redis.ts`, `src/lib/auth/config.ts`, `src/lib/auth/permissions.ts`, `src/lib/auth/rbac.ts` will be moved to their respective subdirectories under `core/`. Imports will need to be updated accordingly.

### 3. `features/` for Domain-Specific Logic

*   **Why:** This is the most significant change, moving towards a **feature-sliced architecture**. Instead of grouping by technical type (e.g., all services in one `services` folder), code related to a specific domain (e.g., `tenants`, `invoices`, `agents`) is grouped together. Each feature directory will contain its own:
    *   **`api/`:** Feature-specific API route handlers (these will be thin wrappers around services).
    *   **`components/`:** UI components specific to that feature.
    *   **`services/`:** Business logic and data orchestration for the feature. This is where the core logic resides, interacting with the `core/db`, `core/cache`, etc.
    *   **`types/`:** TypeScript types specific to the feature's domain.
    *   **`validations/`:** Zod schemas for validating input specific to the feature.
    *   **`hooks/`:** React hooks specific to the feature.
    *   **`stores/`:** Zustand stores specific to the feature (e.g., `property-store.ts` moves to `features/properties/stores`).
*   **Impact:** This dramatically improves modularity, reduces coupling between unrelated features, and makes it easier to understand, develop, and test individual features. For example, `src/lib/validations/tenant.ts` moves to `src/features/tenants/validations/tenant.ts`. The agent-related files will be consolidated under `src/features/agents/`.

### 4. `components/` Restructuring

*   **Why:** To clearly separate generic, reusable UI components from domain-specific ones.
    *   **`components/ui`:** Remains as is, containing the Shadcn/ui components.
    *   **`components/layout`:** For components that define the overall application layout (e.g., `Header`, `Sidebar`). These are generally application-wide but not tied to a specific business domain.
    *   **`components/shared`:** For generic components that are reusable across multiple features but are not part of the `ui` library (e.g., a generic data table, a loading spinner that's not from Shadcn).
*   **Impact:** `src/components/dashboard/header.tsx` and `src/components/dashboard/sidebar.tsx` will move to `src/components/layout/`. Other domain-specific components will move into their respective `features/[domain]/components` directories.

### 5. `common/` for Truly Shared Utilities and Types

*   **Why:** For utilities, constants, and types that are genuinely used across multiple, unrelated features and do not belong to `core` infrastructure. This prevents utility functions from being scattered or duplicated.
    *   **`common/constants`:** For application-wide constants.
    *   **`common/types`:** For global TypeScript types that are not specific to any single feature or core module.
    *   **`common/utils`:** For small, pure utility functions that don't have side effects and are widely applicable.
*   **Impact:** `src/lib/utils/index.ts` will move to `src/common/utils/index.ts`. Global types from `src/types` will move here if they are truly common.

### 6. `hooks/` for Global React Hooks

*   **Why:** To centralize React hooks that are not specific to any single feature and can be reused across the application (e.g., `useAuth`, `useDebounce`). Feature-specific hooks will reside within their respective `features/[domain]/hooks` directories.
*   **Impact:** `src/hooks/use-agent-activity.ts` and `src/hooks/use-permissions.ts` will be evaluated. `use-permissions.ts` might move to `core/auth/hooks` or `features/users/hooks` depending on its usage, while `use-agent-activity.ts` would go to `features/agents/hooks`.

## Refactoring Explanations

### API Route Refactoring (Before → After)

**Before: `src/app/api/tenants/route.ts` (GET example)**

```typescript
// src/app/api/tenants/route.ts (Before)
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { tenants, leases } from "@/lib/db/schema"
import { eq, desc, and } from "drizzle-orm"
import { getCachedOrFetch, CACHE_KEYS, CACHE_TTL, invalidateEntityCache } from "@/lib/cache"
import { PERMISSIONS, requirePermission } from "@/lib/auth/rbac"

export async function GET(request: NextRequest) {
  try {
    const { authorized, error } = await requirePermission(PERMISSIONS.TENANTS_VIEW)
    if (!authorized) {
      return NextResponse.json({ error }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const propertyId = searchParams.get("propertyId")
    const status = searchParams.get("status")
    const category = searchParams.get("category")
    const refresh = searchParams.get("refresh") === "true"

    if (refresh && propertyId) {
      await invalidateEntityCache("tenant", propertyId, propertyId)
    }

    const cacheKey = propertyId
      ? CACHE_KEYS.TENANT_LIST(propertyId)
      : `tenants:list:all:${status || "all"}:${category || "all"}`

    const result = await getCachedOrFetch(
      cacheKey,
      async () => {
        const tenantsWithLeases = await db
          .select({
            tenant: tenants,
            activeLease: leases,
          })
          .from(tenants)
          .leftJoin(
            leases,
            and(
              eq(leases.tenantId, tenants.id),
              eq(leases.status, "active")
            )
          )
          .where(
            and(
              propertyId ? eq(tenants.propertyId, propertyId) : undefined,
              status ? eq(tenants.status, status) : undefined,
              category ? eq(tenants.category, category) : undefined
            )
          )
          .orderBy(desc(tenants.createdAt))

        const seen = new Set<string>()
        const deduplicated: typeof tenantsWithLeases = []
        for (const row of tenantsWithLeases) {
          if (!seen.has(row.tenant.id)) {
            seen.add(row.tenant.id)
            deduplicated.push(row)
          }
        }
        return deduplicated.map(({ tenant, activeLease }) => ({
          ...tenant,
          lease: activeLease
            ? {
                id: activeLease.id,
                unitNumber: activeLease.unitNumber,
                floor: activeLease.floor,
                areaSqft: activeLease.areaSqft,
                baseRent: activeLease.baseRent,
                startDate: activeLease.startDate,
                endDate: activeLease.endDate,
                status: activeLease.status,
              }
            : null,
        }))
      },
      CACHE_TTL.MEDIUM
    )

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error("Get tenants error:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
```

**After: `src/features/tenants/services/tenant-service.ts` and `src/app/api/v1/tenants/route.ts`**

```typescript
// src/features/tenants/services/tenant-service.ts (After)
import { db } from "@/core/db"
import { tenants, leases } from "@/core/db/schema"
import { eq, desc, and } from "drizzle-orm"
import { getCachedOrFetch, invalidateEntityCache, CACHE_KEYS, CACHE_TTL } from "@/core/cache"
import { Tenant, TenantFilterParams } from "@/features/tenants/types"

export async function getTenants(filters: TenantFilterParams, refreshCache: boolean): Promise<Tenant[]> {
  const { propertyId, status, category } = filters

  if (refreshCache && propertyId) {
    await invalidateEntityCache("tenant", propertyId, propertyId)
  }

  const cacheKey = propertyId
    ? CACHE_KEYS.TENANT_LIST(propertyId)
    : `tenants:list:all:${status || "all"}:${category || "all"}`

  return getCachedOrFetch(
    cacheKey,
    async () => {
      const tenantsWithLeases = await db
        .select({
          tenant: tenants,
          activeLease: leases,
        })
        .from(tenants)
        .leftJoin(
          leases,
          and(
            eq(leases.tenantId, tenants.id),
            eq(leases.status, "active")
          )
        )
        .where(
          and(
            propertyId ? eq(tenants.propertyId, propertyId) : undefined,
            status ? eq(tenants.status, status) : undefined,
            category ? eq(tenants.category, category) : undefined
          )
        )
        .orderBy(desc(tenants.createdAt))

      const seen = new Set<string>()
      const deduplicated: typeof tenantsWithLeases = []
      for (const row of tenantsWithLeases) {
        if (!seen.has(row.tenant.id)) {
          seen.add(row.tenant.id)
          deduplicated.push(row)
        }
      }

      return deduplicated.map(({ tenant, activeLease }) => ({
        ...tenant,
        lease: activeLease
          ? {
              id: activeLease.id,
              unitNumber: activeLease.unitNumber,
              floor: activeLease.floor,
              areaSqft: activeLease.areaSqft,
              baseRent: activeLease.baseRent,
              startDate: activeLease.startDate,
              endDate: activeLease.endDate,
              status: activeLease.status,
            }
          : null,
      }))
    },
    CACHE_TTL.MEDIUM
  )
}

// Other tenant-related business logic functions (createTenant, updateTenant, deleteTenant, etc.)
```

```typescript
// src/app/api/v1/tenants/route.ts (After)
import { NextRequest, NextResponse } from "next/server"
import { requirePermission, PERMISSIONS } from "@/core/auth/rbac"
import { getTenants } from "@/features/tenants/services/tenant-service"
import { TenantFilterParams } from "@/features/tenants/types"
import { handleApiError } from "@/core/errors"

export async function GET(request: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.TENANTS_VIEW)

    const { searchParams } = new URL(request.url)
    const filters: TenantFilterParams = {
      propertyId: searchParams.get("propertyId") || undefined,
      status: searchParams.get("status") || undefined,
      category: searchParams.get("category") || undefined,
    }
    const refresh = searchParams.get("refresh") === "true"

    const tenants = await getTenants(filters, refresh)
    return NextResponse.json({ success: true, data: tenants })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST, PUT, DELETE functions would follow a similar pattern
```

**Explanation of Changes:**

*   **Separation of Concerns:** The data fetching and business logic for retrieving tenants are moved from the API route into a dedicated `getTenants` function within `src/features/tenants/services/tenant-service.ts`. The API route now acts as a thin controller, handling request parsing, authorization, and delegating to the service layer.
*   **Improved Readability and Testability:** The `tenant-service.ts` file can be tested independently of the Next.js API route context. The API route itself becomes much cleaner and easier to understand.
*   **Centralized Error Handling:** A new `handleApiError` utility (from `core/errors`) is introduced to provide consistent error responses across all API routes, replacing repetitive `try-catch` blocks with generic messages.
*   **Clearer Imports:** Imports now reflect the new modular structure, drawing from `core/` for infrastructure and `features/` for domain logic.
*   **Type Safety:** Introduction of `TenantFilterParams` and `Tenant` types (from `features/tenants/types`) enhances type safety and clarity.

### Agent Implementation Refactoring (Before → After)

**Before: `src/lib/agents/orchestrator.ts` and `src/lib/agents/implementations/financial.ts`**

(See previous `file read` outputs for content)

**After: `src/features/agents/orchestrator.ts` and `src/features/agents/services/financial-agent.ts`**

```typescript
// src/features/agents/orchestrator.ts (After - moved, potentially minor internal refactors)
import Anthropic from "@anthropic-ai/sdk"
import { db } from "@/core/db"
import { agentActions, agentDecisions } from "@/core/db/schema"
import { eq } from "drizzle-orm"
import type {
  AgentConfig,
  AgentContext,
  AgentDecision,
  Tool,
  ToolCall,
  ToolResult,
  AgentType,
} from "@/features/agents/types"
import { appConfig } from "@/core/config"

// Anthropic client initialization now uses centralized config
const ANTHROPIC_API_KEY = appConfig.anthropic.apiKey;
const isAnthropicConfigured = !!ANTHROPIC_API_KEY && ANTHROPIC_API_KEY.startsWith("sk-ant-") && ANTHROPIC_API_KEY.length > 20;

let anthropic: Anthropic | null = null;
if (isAnthropicConfigured) {
  anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
}

// ... (rest of the Orchestrator class logic remains largely the same, but imports are updated)

// Example of updated storeDecision to use centralized logging
private async storeDecision(
  agent: AgentConfig,
  decision: AgentDecision,
  context: AgentContext
) {
  await db.insert(agentDecisions).values({
    agentId: agent.id,
    decisionType: decision.action,
    context: context,
    reasoning: decision.reasoning,
    recommendation: decision.data,
    confidence: decision.confidence.toString(),
    alternatives: decision.alternatives,
    outcome: decision.requiresApproval ? "pending" : "accepted",
    metadata: {
      ...decision.metadata,
      propertyId: context.propertyId,
      requiresApproval: decision.requiresApproval,
    },
  })
  // Centralized logging example
  // logger.info(`Agent ${agent.name} made decision: ${decision.action}`, { decisionId: decision.id, agentType: agent.type });
}

// ... (rest of the class)
```

```typescript
// src/features/agents/services/financial-agent.ts (After)
import { BaseAgent } from "@/features/agents/orchestrator"
import { financialTools } from "@/features/agents/tools/financial"
import { FINANCIAL_ANALYST_SYSTEM_PROMPT } from "@/features/agents/prompts/financial"
import type { AgentConfig, AgentContext, AgentResponse } from "@/features/agents/types"

export class FinancialAnalystAgent extends BaseAgent {
  constructor() {
    const config: AgentConfig = {
      id: "financial-analyst",
      name: "Financial Analyst",
      persona: "financial_analyst",
      description: "Specializes in financial analysis, payment predictions, and revenue optimization",
      capabilities: [
        "Payment pattern analysis",
        "Payment date prediction",
        "Financial reporting",
        "Collection management",
        "Cash flow forecasting",
      ],
      systemPrompt: FINANCIAL_ANALYST_SYSTEM_PROMPT,
      tools: financialTools,
      maxIterations: 5,
      confidenceThreshold: 0.8,
    }
    super(config)
  }

  async process(input: string, context: AgentContext): Promise<AgentResponse> {
    // ... (logic remains largely the same, but internal imports are updated)
    // Example: this.executeTool("analyze_payment_patterns", params, context)
    // The tool implementations themselves will also be moved to features/agents/tools
  }

  // ... (private helper methods like detectIntent, extractParams, generateResponse)
}

export const financialAnalystAgent = new FinancialAnalystAgent()
```

**Explanation of Changes:**

*   **Consolidated Agent Module:** All agent-related logic, including the `Orchestrator`, `BaseAgent`, specific agent implementations, prompts, and tools, are now consolidated under `src/features/agents/`. This creates a self-contained and highly modular agent system.
*   **Service Layer for Agents:** Specific agent implementations (e.g., `FinancialAnalystAgent`) are placed in `src/features/agents/services/` to clearly define their role as business logic handlers within the agent domain.
*   **Centralized Configuration:** The Anthropic API key is now accessed via `appConfig.anthropic.apiKey` (from `core/config`), ensuring consistent and type-safe access to application settings.
*   **Improved Type Management:** Agent-related types are now defined within `src/features/agents/types`, keeping them co-located with the code they describe.

### Configuration Management (Before → After)

**Before: Direct `process.env` access**

```typescript
// src/lib/agents/orchestrator.ts (Snippet Before)
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const isAnthropicConfigured =
  !!ANTHROPIC_KEY && ANTHROPIC_KEY.startsWith("sk-ant-") && ANTHROPIC_KEY.length > 20

let anthropic: Anthropic | null = null
if (isAnthropicConfigured) {
  anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY })
}
```

**After: `src/core/config/index.ts` and usage**

```typescript
// src/core/config/index.ts (New File)
import z from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  ANTHROPIC_API_KEY: z.string().min(1, 'Anthropic API Key is required'),
  REDIS_URL: z.string().url(),
  DATABASE_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(1, 'NextAuth Secret is required'),
  // ... other environment variables
});

type EnvSchema = z.infer<typeof envSchema>;

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("❌ Invalid environment variables:", parsedEnv.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables");
}

export const appConfig = {
  appUrl: parsedEnv.data.NEXT_PUBLIC_APP_URL,
  anthropic: {
    apiKey: parsedEnv.data.ANTHROPIC_API_KEY,
  },
  redis: {
    url: parsedEnv.data.REDIS_URL,
  },
  db: {
    url: parsedEnv.data.DATABASE_URL,
  },
  auth: {
    nextAuthSecret: parsedEnv.data.NEXTAUTH_SECRET,
  },
  // ... other configurations
};

declare global {
  namespace NodeJS {
    interface ProcessEnv extends EnvSchema {}
  }
}
```

```typescript
// src/features/agents/orchestrator.ts (Snippet After)
import { appConfig } from "@/core/config"

const ANTHROPIC_API_KEY = appConfig.anthropic.apiKey;
const isAnthropicConfigured =
  !!ANTHROPIC_API_KEY && ANTHROPIC_API_KEY.startsWith("sk-ant-") && ANTHROPIC_API_KEY.length > 20;

let anthropic: Anthropic | null = null;
if (isAnthropicConfigured) {
  anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
}
```

**Explanation of Changes:**

*   **Centralized Configuration:** All environment variables and application-wide settings are now loaded and validated in `src/core/config/index.ts`. This file uses Zod for schema validation, ensuring that all required environment variables are present and correctly formatted at application startup.
*   **Type Safety:** The `envSchema` and `EnvSchema` types provide strong type checking for environment variables, preventing runtime errors due to missing or malformed configuration.
*   **Single Source of Truth:** `appConfig` becomes the single, immutable source for all application settings, improving consistency and reducing the chance of errors.
*   **Early Error Detection:** Environment variable validation happens early in the application lifecycle, failing fast if critical configurations are missing.

### Error Handling (Before → After)

**Before: Ad-hoc `try-catch` in API routes**

```typescript
// src/app/api/tenants/route.ts (Snippet Before)
  } catch (error) {
    console.error("Get tenants error:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
```

**After: `src/core/errors/index.ts` and usage**

```typescript
// src/core/errors/index.ts (New File)
import { NextResponse } from "next/server";

export class ApiError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string = "Resource not found") {
    super(message, 404);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message: string = "Unauthorized") {
    super(message, 401);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message: string = "Forbidden") {
    super(message, 403);
  }
}

export class BadRequestError extends ApiError {
  constructor(message: string = "Bad Request") {
    super(message, 400);
  }
}

export function handleApiError(error: unknown) {
  if (error instanceof ApiError) {
    console.error(`[API Error] ${error.statusCode}: ${error.message}`);
    return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
  } else if (error instanceof Error) {
    console.error(`[Unhandled Error] ${error.message}`, error.stack);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  } else {
    console.error("[Unknown Error]", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}
```

```typescript
// src/app/api/v1/tenants/route.ts (Snippet After)
import { requirePermission, PERMISSIONS } from "@/core/auth/rbac"
import { getTenants } from "@/features/tenants/services/tenant-service"
import { TenantFilterParams } from "@/features/tenants/types"
import { handleApiError, ForbiddenError } from "@/core/errors"

export async function GET(request: NextRequest) {
  try {
    const { authorized } = await requirePermission(PERMISSIONS.TENANTS_VIEW)
    if (!authorized) {
      throw new ForbiddenError("You do not have permission to view tenants.")
    }
    // ... rest of the logic
  } catch (error) {
    return handleApiError(error)
  }
}
```

**Explanation of Changes:**

*   **Custom Error Classes:** Introduction of `ApiError` and specialized error classes (e.g., `NotFoundError`, `ForbiddenError`) provides more semantic error types. This allows business logic to throw specific errors that can be caught and handled appropriately at the API boundary.
*   **Centralized Error Handling Function:** `handleApiError` in `src/core/errors/index.ts` acts as a global error handler for API routes. It inspects the error type and returns a standardized `NextResponse` with an appropriate status code and message. This ensures consistency in error responses across the entire API.
*   **Improved Debugging:** Specific error messages and status codes make it easier for client applications to handle errors and for developers to debug issues.

## Improved Code Snippets

### `src/components/dashboard/header.tsx` (Before → After)

**Before:**

```typescript
// src/components/dashboard/header.tsx (Snippet Before)
import { usePropertyStore } from "@/stores/property-store"
import { signOut, useSession } from "next-auth/react"
// ... other imports

export function Header() {
  const router = useRouter()
  const { data: session } = useSession()
  const { 
    properties, 
    selectedProperty, 
    isLoading, 
    setSelectedProperty, 
    fetchProperties 
  } = usePropertyStore()
  
  // ... rest of the component logic
}
```

**After:**

```typescript
// src/components/layout/header.tsx (After)
import { useRouter } from "next/navigation"
import { Bell, Search, ChevronDown, LogOut, User, Settings, Plus, Building2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { usePropertyStore } from "@/features/properties/stores/property-store" // Updated import
import { signOut, useSession } from "next-auth/react"
import { usePendingApprovals } from "@/features/agents/hooks/use-pending-approvals" // New hook

export function Header() {
  const router = useRouter()
  const { data: session } = useSession()
  const { 
    properties, 
    selectedProperty, 
    isLoading, 
    setSelectedProperty, 
    fetchProperties 
  } = usePropertyStore()
  
  const { pendingApprovals, isLoadingApprovals } = usePendingApprovals(); // Use custom hook

  // Fetch properties on mount (remains here as it's a global dependency for the header)
  React.useEffect(() => {
    fetchProperties()
  }, [fetchProperties])

  const handleAddProperty = () => {
    router.push("/properties?action=add")
  }
  
  const handleLogout = async () => {
    await signOut({ callbackUrl: "/auth/login" })
  }

  const userInitials = session?.user?.name
    ? session.user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : "U"

  return (
    <header className="flex h-16 items-center justify-between border-b bg-white px-6 dark:bg-gray-950">
      {/* Left Side - Property Selector */}
      <div className="flex items-center gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2 min-w-[200px] justify-between">
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading...</span>
                </div>
              ) : selectedProperty ? (
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="font-medium truncate max-w-[120px]">{selectedProperty.name}</span>
                  <span className="text-muted-foreground">({selectedProperty.city})</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Select Property</span>
                </div>
              )}
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Select Property</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {properties.length === 0 && !isLoading ? (
              <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                No properties found
              </div>
            ) : (
              properties.map((property) => (
                <DropdownMenuItem
                  key={property.id}
                  onClick={() => setSelectedProperty(property)}
                  className="cursor-pointer"
                >
                  <div className="flex items-center gap-2 w-full">
                    <div
                      className={`h-2 w-2 rounded-full shrink-0 ${
                        property.id === selectedProperty?.id ? "bg-green-500" : "bg-gray-300"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{property.name}</div>
                      <div className="text-xs text-muted-foreground">{property.city} • {property.type}</div>
                    </div>
                  </div>
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="cursor-pointer text-primary"
              onClick={handleAddProperty}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Property
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Search */}
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tenants, invoices, work orders..."
            className="w-80 pl-9"
          />
        </div>
      </div>

      {/* Right Side - Notifications & Profile */}
      <div className="flex items-center gap-4">
        {/* Pending Approvals Badge */}
        {pendingApprovals > 0 && (
          <Button variant="outline" size="sm" className="gap-2" asChild>
            <a href="/approvals">
              <Badge variant="warning" className="h-5 w-5 rounded-full p-0 text-xs">
                {pendingApprovals}
              </Badge>
              <span className="hidden sm:inline">Pending Approvals</span>
            </a>
          </Button>
        )}

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="max-h-80 overflow-y-auto">
              <DropdownMenuItem className="flex flex-col items-start gap-1 cursor-pointer">
                <div className="flex items-center gap-2">
                  <Badge variant="info" className="h-5 text-[10px]">Agent</Badge>
                  <span className="text-sm font-medium">Tenant Relations</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Created work order for HVAC repair in Unit 203
                </p>
                <span className="text-[10px] text-muted-foreground">2 min ago</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="flex flex-col items-start gap-1 cursor-pointer">
                <div className="flex items-center gap-2">
                  <Badge variant="warning" className="h-5 text-[10px]">Alert</Badge>
                  <span className="text-sm font-medium">Payment Overdue</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Fashion Store Ltd has 3 pending invoices
                </p>
                <span className="text-[10px] text-muted-foreground">15 min ago</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="flex flex-col items-start gap-1 cursor-pointer">
                <div className="flex items-center gap-2">
                  <Badge variant="success" className="h-5 text-[10px]">Success</Badge>
                  <span className="text-sm font-medium">Maintenance Complete</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Elevator #2 maintenance completed successfully
                </p>
                <span className="text-[10px] text-muted-foreground">1 hour ago</span>
              </DropdownMenuItem>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer text-center text-primary">
              View all notifications
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Profile */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 px-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src="/placeholder-avatar.jpg" />
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden flex-col items-start md:flex">
                <span className="text-sm font-medium">{session?.user?.name || "User"}</span>
                <span className="text-[10px] text-muted-foreground capitalize">
                  {session?.user?.role?.replace("_", " ") || "Mall Manager"}
                </span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer">
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer">
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer text-red-600" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
```

**Explanation of Changes:**

*   **Relocation:** The `Header` component is moved from `src/components/dashboard/header.tsx` to `src/components/layout/header.tsx`, reflecting its role as a global layout component rather than a dashboard-specific one.
*   **Modular Hooks:** The logic for fetching pending approvals is extracted into a custom hook `usePendingApprovals` (located in `src/features/agents/hooks/use-pending-approvals.ts`). This improves the `Header` component's readability and separates concerns. The `Header` now only consumes the data from the hook, rather than handling the data fetching itself.
*   **Updated Imports:** Imports for `usePropertyStore` and the new `usePendingApprovals` hook are updated to reflect their new locations within the `features` directory.

## Final Recommendations

### 1. **Implement the Proposed Folder Structure:**

Systematically migrate files and directories to align with the new feature-sliced and domain-driven structure. This will be the most time-consuming part of the refactoring but will yield significant long-term benefits in maintainability and scalability.

### 2. **Extract Business Logic to Services:**

Ensure that all API routes (`src/app/api/v1/.../route.ts`) are thin controllers. Extract all business logic, data fetching, and complex operations into dedicated service files within their respective `features/[domain]/services` directories. This promotes the **Single Responsibility Principle** and makes the application easier to test and reason about.

### 3. **Centralize Configuration:**

Fully implement the `src/core/config/index.ts` file to centralize all environment variables and application settings. Use Zod for validation to ensure type safety and early error detection. All parts of the application should import configuration from this central module.

### 4. **Standardize Error Handling:**

Adopt the custom error classes and `handleApiError` utility from `src/core/errors/index.ts` across all API routes and service functions. This will provide consistent, descriptive, and actionable error responses to clients.

### 5. **Implement Comprehensive Testing:**

*   **Unit Tests:** Write unit tests for all service functions, utility functions, and custom hooks. Focus on testing individual units of code in isolation.
*   **Integration Tests:** Implement integration tests for API routes to ensure that the controllers correctly interact with the service layer and return expected responses.
*   **End-to-End (E2E) Tests:** Use tools like Cypress or Playwright for E2E tests to simulate user interactions and verify critical user flows.

### 6. **Introduce Linting and Code Formatting:**

*   **ESLint:** Configure ESLint with a strict set of rules (e.g., Airbnb or Google style guides) to enforce consistent coding standards and catch potential issues early.
*   **Prettier:** Integrate Prettier for automatic code formatting to ensure a consistent code style across the entire codebase.
*   **Husky/lint-staged:** Use Husky and lint-staged to automatically run linters and formatters on staged Git files before commits, preventing inconsistent code from entering the repository.

### 7. **Set Up CI/CD Pipeline:**

*   **Continuous Integration (CI):** Implement a CI pipeline (e.g., GitHub Actions, GitLab CI, Jenkins) to automatically run tests, linting, and build checks on every push to the repository. This ensures code quality and detects regressions early.
*   **Continuous Deployment (CD):** Set up a CD pipeline to automatically deploy changes to staging or production environments after successful CI builds. This enables faster and more reliable releases.

### 8. **Enhance Documentation:**

*   **Code Comments:** Add clear and concise comments to complex logic, algorithms, and public interfaces.
*   **API Documentation:** Use tools like Swagger/OpenAPI to document API endpoints, request/response schemas, and authentication requirements. This is crucial for external consumers and future development.
*   **Architectural Decision Records (ADRs):** Document significant architectural decisions and their rationale. This helps new team members understand the project's evolution and prevents revisiting old decisions.

### 9. **Consider Scalability Improvements:**

*   **Database Optimization:** Regularly review and optimize database queries, add appropriate indexes, and consider connection pooling.
*   **Caching Strategy:** Evaluate and refine the caching strategy. Ensure appropriate cache invalidation mechanisms are in place.
*   **Load Balancing:** For production deployments, ensure proper load balancing is in place to distribute traffic across multiple instances of the application.
*   **Monitoring and Alerting:** Implement comprehensive monitoring for application performance, errors, and resource utilization. Set up alerts for critical issues.

By implementing these recommendations, the `Mall-Management` project will evolve into a robust, maintainable, and scalable application ready for real-world production environments.
