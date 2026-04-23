import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@/lib/auth"
import { withTenantContext } from "@/lib/db/with-tenant-context"
import { sql } from "drizzle-orm"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  IndianRupee,
  TrendingUp,
  CheckCircle2,
  Calendar,
  FileText,
  ArrowRight,
  AlertCircle,
  Clock,
} from "lucide-react"
import dynamic from "next/dynamic"
import { formatCurrency, formatDate } from "@/lib/utils/index"
import { AnnouncementBanner } from "./_components/announcement-banner"

// Lazy-load chart components — keeps initial JS bundle small
const SalesTrendChart = dynamic(
  () => import("./_components/sales-trend-chart").then((m) => m.SalesTrendChart),
  { ssr: false, loading: () => <div className="h-[280px] animate-pulse rounded bg-muted" /> },
)
const PaymentHistoryChart = dynamic(
  () => import("./_components/payment-history-chart").then((m) => m.PaymentHistoryChart),
  { ssr: false, loading: () => <div className="h-[280px] animate-pulse rounded bg-muted" /> },
)

// ── Server-side data fetching ────────────────────────────────────────────────

interface DashboardSummary {
  totalOutstanding: number
  overdueCount: number
  invoiceCount: number
  lastPaymentDate: string | null
  lastPaymentAmount: number | null
  currentMonthSales: number
  leaseEndDate: string | null
  daysToLeaseExpiry: number | null
}

interface SalesPoint {
  date: string
  grossSales: number
  netSales: number
}

interface PaymentPoint {
  date: string
  amount: number
  method: string | null
}

type RecentInvoice = {
  id: string
  invoice_number: string
  total_amount: string
  due_date: string
  status: string
  [key: string]: unknown
}

async function getDashboardData(tenantId: string) {
  const [summary, salesTrend, paymentHistory, recentInvoices] = await Promise.all([
    // 1. Dashboard summary
    withTenantContext(tenantId, async (tx) => {
      const [row] = await tx.execute<{
        outstanding: string
        overdue_count: string
        invoice_count: string
        last_payment_date: string | null
        last_payment_amount: string | null
        month_sales: string
        lease_end_date: string | null
      }>(sql`
        SELECT
          (
            SELECT COALESCE(SUM(i.total_amount - COALESCE(i.paid_amount, 0)), 0)
            FROM invoices i
            INNER JOIN leases l ON l.id = i.lease_id
            WHERE l.tenant_id = current_setting('app.current_tenant_id')::uuid
              AND i.status IN ('pending', 'overdue')
          ) AS outstanding,
          (
            SELECT COUNT(*)
            FROM invoices i
            INNER JOIN leases l ON l.id = i.lease_id
            WHERE l.tenant_id = current_setting('app.current_tenant_id')::uuid
              AND i.status = 'overdue'
          ) AS overdue_count,
          (
            SELECT COUNT(*)
            FROM invoices i
            INNER JOIN leases l ON l.id = i.lease_id
            WHERE l.tenant_id = current_setting('app.current_tenant_id')::uuid
          ) AS invoice_count,
          (
            SELECT p.payment_date
            FROM payments p
            INNER JOIN invoices i ON i.id = p.invoice_id
            INNER JOIN leases l  ON l.id = i.lease_id
            WHERE l.tenant_id = current_setting('app.current_tenant_id')::uuid
            ORDER BY p.payment_date DESC
            LIMIT 1
          ) AS last_payment_date,
          (
            SELECT p.amount
            FROM payments p
            INNER JOIN invoices i ON i.id = p.invoice_id
            INNER JOIN leases l  ON l.id = i.lease_id
            WHERE l.tenant_id = current_setting('app.current_tenant_id')::uuid
            ORDER BY p.payment_date DESC
            LIMIT 1
          ) AS last_payment_amount,
          (
            SELECT COALESCE(SUM(s.net_sales), 0)
            FROM pos_sales_data s
            WHERE s.tenant_id = current_setting('app.current_tenant_id')::uuid
              AND s.sales_date >= date_trunc('month', CURRENT_DATE)
          ) AS month_sales,
          (
            SELECT l.end_date
            FROM leases l
            WHERE l.tenant_id = current_setting('app.current_tenant_id')::uuid
              AND l.status = 'active'
            ORDER BY l.end_date DESC
            LIMIT 1
          ) AS lease_end_date
      `)

      const leaseEnd = row?.lease_end_date ?? null
      const daysToExpiry = leaseEnd
        ? Math.ceil((new Date(leaseEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null

      return {
        totalOutstanding:  parseFloat(row?.outstanding ?? "0"),
        overdueCount:      parseInt(row?.overdue_count ?? "0", 10),
        invoiceCount:      parseInt(row?.invoice_count ?? "0", 10),
        lastPaymentDate:   row?.last_payment_date ?? null,
        lastPaymentAmount: row?.last_payment_amount ? parseFloat(row.last_payment_amount) : null,
        currentMonthSales: parseFloat(row?.month_sales ?? "0"),
        leaseEndDate:      leaseEnd,
        daysToLeaseExpiry: daysToExpiry,
      } satisfies DashboardSummary
    }),

    // 2. Sales trend — last 30 days from pos_sales_data
    withTenantContext(tenantId, async (tx) => {
      const rows = await tx.execute<{
        sales_date: string
        gross_sales: string
        net_sales: string
      }>(sql`
        SELECT sales_date, gross_sales, net_sales
        FROM pos_sales_data
        WHERE tenant_id = current_setting('app.current_tenant_id')::uuid
          AND sales_date >= CURRENT_DATE - INTERVAL '30 days'
        ORDER BY sales_date ASC
      `)
      return (Array.isArray(rows) ? rows : []).map((r) => ({
        date:       r.sales_date,
        grossSales: parseFloat(r.gross_sales),
        netSales:   parseFloat(r.net_sales),
      })) as SalesPoint[]
    }),

    // 3. Payment history — last 12 payments
    withTenantContext(tenantId, async (tx) => {
      const rows = await tx.execute<{
        payment_date: string
        amount: string
        payment_method: string | null
      }>(sql`
        SELECT p.payment_date, p.amount, p.payment_method
        FROM payments p
        INNER JOIN invoices i ON i.id = p.invoice_id
        INNER JOIN leases l  ON l.id = i.lease_id
        WHERE l.tenant_id = current_setting('app.current_tenant_id')::uuid
        ORDER BY p.payment_date DESC
        LIMIT 12
      `)
      return (Array.isArray(rows) ? rows : [])
        .map((r) => ({
          date:   r.payment_date,
          amount: parseFloat(r.amount),
          method: r.payment_method,
        }))
        .reverse() as PaymentPoint[] // chronological order for the chart
    }),

    // 4. Recent invoices — last 5
    withTenantContext(tenantId, async (tx) => {
      const rows = await tx.execute<RecentInvoice>(sql`
        SELECT i.id, i.invoice_number, i.total_amount, i.due_date, i.status
        FROM invoices i
        INNER JOIN leases l ON l.id = i.lease_id
        WHERE l.tenant_id = current_setting('app.current_tenant_id')::uuid
        ORDER BY i.created_at DESC
        LIMIT 5
      `)
      return (Array.isArray(rows) ? rows : []) as RecentInvoice[]
    }),
  ])

  return { summary, salesTrend, paymentHistory, recentInvoices }
}

// ── Status badge config ──────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: typeof Clock }> = {
  pending: { label: "Pending", className: "bg-yellow-100 text-yellow-700", icon: Clock         },
  paid:    { label: "Paid",    className: "bg-green-100 text-green-700",   icon: CheckCircle2  },
  overdue: { label: "Overdue", className: "bg-red-100 text-red-700",       icon: AlertCircle   },
}

// ── Page (Server Component) ──────────────────────────────────────────────────

export default async function TenantDashboardPage() {
  const session = await auth()

  if (!session?.user || session.user.role !== "tenant" || !session.user.tenantId) {
    redirect("/tenant/login")
  }

  const { summary, salesTrend, paymentHistory, recentInvoices } =
    await getDashboardData(session.user.tenantId)

  return (
    <div className="space-y-6">
      <AnnouncementBanner />

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">Your store at a glance</p>
      </div>

      {/* ── KPI Cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Outstanding Balance */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Outstanding Balance
            </CardTitle>
            <IndianRupee className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(summary.totalOutstanding)}</p>
            {summary.overdueCount > 0 ? (
              <p className="mt-1 text-xs text-destructive">
                {summary.overdueCount} overdue invoice{summary.overdueCount > 1 ? "s" : ""}
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                {summary.invoiceCount} invoice{summary.invoiceCount !== 1 ? "s" : ""}
              </p>
            )}
          </CardContent>
        </Card>

        {/* This Month Sales */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              This Month Sales
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(summary.currentMonthSales)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              From POS transactions
            </p>
          </CardContent>
        </Card>

        {/* Last Payment */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Last Payment
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {summary.lastPaymentAmount ? formatCurrency(summary.lastPaymentAmount) : "—"}
            </p>
            {summary.lastPaymentDate && (
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDate(summary.lastPaymentDate)}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Lease Expiry */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Lease Expiry
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {summary.daysToLeaseExpiry !== null ? `${summary.daysToLeaseExpiry}d` : "—"}
            </p>
            {summary.leaseEndDate && (
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDate(summary.leaseEndDate)}
              </p>
            )}
            {summary.daysToLeaseExpiry !== null && summary.daysToLeaseExpiry <= 90 && (
              <p className="mt-1 text-xs text-amber-600">Renewal approaching</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Charts ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">30-Day Sales Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <SalesTrendChart data={salesTrend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Payment History</CardTitle>
          </CardHeader>
          <CardContent>
            <PaymentHistoryChart data={paymentHistory} />
          </CardContent>
        </Card>
      </div>

      {/* ── Recent Invoices ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold">Recent Invoices</CardTitle>
          <Link
            href="/tenant/invoices"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {recentInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <FileText className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">No invoices yet</p>
            </div>
          ) : (
            <div className="divide-y">
              {recentInvoices.map((inv) => {
                const s = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.pending
                const StatusIcon = s.icon
                return (
                  <div key={inv.id} className="flex items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{inv.invoice_number}</p>
                        <p className="text-xs text-muted-foreground">Due {formatDate(inv.due_date)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold">
                        {formatCurrency(inv.total_amount)}
                      </span>
                      <Badge className={`flex items-center gap-1 text-[10px] ${s.className}`}>
                        <StatusIcon className="h-3 w-3" />
                        {s.label}
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
