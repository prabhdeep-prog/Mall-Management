import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { serviceDb } from "@/lib/db"
import { agentActions, agents, auditLogs, notifications } from "@/lib/db/schema"
import { eq, desc, and, sql } from "drizzle-orm"
import { requirePermission, PERMISSIONS } from "@/lib/auth/rbac"
import { z } from "zod"
import { executeApprovedAction } from "@/lib/agents/executor"

const querySchema = z.object({
  status: z.enum(["pending", "approved", "executed", "rejected", "failed"]).optional(),
  agentId: z.string().uuid().optional(),
  propertyId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
})

// GET: Fetch agent actions with optional filters
export async function GET(request: NextRequest) {
  const { authorized, error } = await requirePermission(PERMISSIONS.AGENTS_VIEW)
  if (!authorized) {
    return NextResponse.json({ error }, { status: 403 })
  }

  try {
    const params = Object.fromEntries(request.nextUrl.searchParams)
    const query = querySchema.parse(params)

    const conditions = []
    if (query.status) conditions.push(eq(agentActions.status, query.status))
    if (query.agentId) conditions.push(eq(agentActions.agentId, query.agentId))
    if (query.propertyId) conditions.push(eq(agentActions.propertyId, query.propertyId))

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    const [rows, countResult] = await Promise.all([
      serviceDb
        .select({
          id: agentActions.id,
          agentId: agentActions.agentId,
          agentName: agents.name,
          agentType: agents.type,
          propertyId: agentActions.propertyId,
          actionType: agentActions.actionType,
          entityType: agentActions.entityType,
          entityId: agentActions.entityId,
          trigger: agentActions.trigger,
          reasoning: agentActions.reasoning,
          confidence: agentActions.confidence,
          status: agentActions.status,
          requiresApproval: agentActions.requiresApproval,
          approvedBy: agentActions.approvedBy,
          approvedAt: agentActions.approvedAt,
          executedAt: agentActions.executedAt,
          inputData: agentActions.inputData,
          outputData: agentActions.outputData,
          error: agentActions.error,
          metadata: agentActions.metadata,
          createdAt: agentActions.createdAt,
        })
        .from(agentActions)
        .leftJoin(agents, eq(agentActions.agentId, agents.id))
        .where(whereClause)
        .orderBy(desc(agentActions.createdAt))
        .limit(query.limit)
        .offset(query.offset),
      serviceDb
        .select({ count: sql<string>`COUNT(*)` })
        .from(agentActions)
        .where(whereClause),
    ])

    const data = rows.map((r) => ({
      ...r,
      confidence: parseFloat(String(r.confidence ?? "0")),
      impact: (r.metadata as Record<string, unknown>)?.impact as string || "medium",
      description: r.trigger || r.reasoning || "No description",
    }))

    return NextResponse.json({
      success: true,
      data,
      total: parseInt(countResult[0]?.count ?? "0", 10),
      limit: query.limit,
      offset: query.offset,
    })
  } catch (err) {
    console.error("GET /api/agents/actions error:", err)
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("; ") }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

const decisionSchema = z.object({
  actionId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  reason: z.string().optional(),
})

// POST: Approve or reject a single action
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { actionId, decision, reason } = decisionSchema.parse(body)

    // Check RBAC
    const permKey = decision === "approve" ? PERMISSIONS.AGENTS_APPROVE : PERMISSIONS.AGENTS_REJECT
    const { authorized, error } = await requirePermission(permKey)
    if (!authorized) {
      return NextResponse.json({ error }, { status: 403 })
    }

    // Fetch action
    const [action] = await serviceDb
      .select()
      .from(agentActions)
      .where(eq(agentActions.id, actionId))
      .limit(1)

    if (!action) {
      return NextResponse.json({ error: "Action not found" }, { status: 404 })
    }
    if (action.status !== "pending") {
      return NextResponse.json({ error: `Action already ${action.status}` }, { status: 409 })
    }

    const orgId = request.headers.get("x-org-id")
    const now = new Date()

    if (decision === "reject") {
      // Reject: update status, write audit log
      const meta = { ...(action.metadata as Record<string, unknown> ?? {}), rejectionReason: reason ?? null }
      await serviceDb.update(agentActions).set({ status: "rejected", approvedBy: session.user.id, approvedAt: now, metadata: meta }).where(eq(agentActions.id, actionId))

      // Audit log
      if (orgId) {
        await serviceDb.insert(auditLogs).values({
          organizationId: orgId,
          action: "agent_action.rejected",
          entity: "agent_action",
          entityId: actionId,
          before: { status: "pending" },
          after: { status: "rejected", reason },
          userId: session.user.id,
          createdAt: now,
        }).catch(() => {})
      }

      return NextResponse.json({ success: true, message: "Action rejected", data: { id: actionId, status: "rejected" } })
    }

    // Approve → execute
    await serviceDb.update(agentActions).set({ status: "approved", approvedBy: session.user.id, approvedAt: now }).where(eq(agentActions.id, actionId))

    // Attempt execution
    try {
      const result = await executeApprovedAction(action)
      await serviceDb.update(agentActions).set({ status: "executed", executedAt: new Date(), outputData: result }).where(eq(agentActions.id, actionId))

      // Audit log
      if (orgId) {
        await serviceDb.insert(auditLogs).values({
          organizationId: orgId,
          action: "agent_action.executed",
          entity: "agent_action",
          entityId: actionId,
          before: { status: "pending" },
          after: { status: "executed", outputData: result },
          userId: session.user.id,
          createdAt: new Date(),
        }).catch(() => {})
      }

      return NextResponse.json({ success: true, message: "Action approved and executed", data: { id: actionId, status: "executed", result } })
    } catch (execErr: unknown) {
      const errMsg = execErr instanceof Error ? execErr.message : String(execErr)
      await serviceDb.update(agentActions).set({ status: "failed", error: errMsg }).where(eq(agentActions.id, actionId))

      return NextResponse.json({ success: true, message: "Action approved but execution failed", data: { id: actionId, status: "failed", error: errMsg } }, { status: 200 })
    }
  } catch (err) {
    console.error("POST /api/agents/actions error:", err)
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors.map(e => e.message).join("; ") }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PATCH: Bulk approve/reject
export async function PATCH(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { actionIds, decision } = z.object({
      actionIds: z.array(z.string().uuid()).min(1).max(50),
      decision: z.enum(["approve", "reject"]),
    }).parse(body)

    const permKey = decision === "approve" ? PERMISSIONS.AGENTS_APPROVE : PERMISSIONS.AGENTS_REJECT
    const { authorized, error } = await requirePermission(permKey)
    if (!authorized) {
      return NextResponse.json({ error }, { status: 403 })
    }

    let processed = 0
    const errors: string[] = []

    for (const actionId of actionIds) {
      try {
        const [action] = await serviceDb.select().from(agentActions).where(and(eq(agentActions.id, actionId), eq(agentActions.status, "pending"))).limit(1)
        if (!action) continue

        if (decision === "reject") {
          await serviceDb.update(agentActions).set({ status: "rejected", approvedBy: session.user.id, approvedAt: new Date() }).where(eq(agentActions.id, actionId))
          processed++
        } else {
          await serviceDb.update(agentActions).set({ status: "approved", approvedBy: session.user.id, approvedAt: new Date() }).where(eq(agentActions.id, actionId))
          try {
            const result = await executeApprovedAction(action)
            await serviceDb.update(agentActions).set({ status: "executed", executedAt: new Date(), outputData: result }).where(eq(agentActions.id, actionId))
          } catch (execErr: unknown) {
            const errMsg = execErr instanceof Error ? execErr.message : String(execErr)
            await serviceDb.update(agentActions).set({ status: "failed", error: errMsg }).where(eq(agentActions.id, actionId))
            errors.push(`${actionId}: ${errMsg}`)
          }
          processed++
        }
      } catch (err) {
        console.error(`Failed to process action ${actionId}:`, err)
      }
    }

    return NextResponse.json({ success: true, processed, total: actionIds.length, errors: errors.length > 0 ? errors : undefined })
  } catch (err) {
    console.error("PATCH /api/agents/actions error:", err)
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors.map(e => e.message).join("; ") }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
