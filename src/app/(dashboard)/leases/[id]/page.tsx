"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  IndianRupee,
  MapPin,
  Phone,
  Mail,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  User,
  AlertCircle,
  Activity,
  Receipt,
  XCircle,
  FileSignature,
  Shield,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn, formatCurrency } from "@/lib/utils"
import { format, differenceInDays } from "date-fns"

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeaseDetail {
  id: string
  unitNumber: string
  floor: number | null
  zone: string | null
  areaSqft: string | null
  leaseType: string | null
  baseRent: string | null
  revenueSharePercentage: string | null
  camCharges: string | null
  securityDeposit: string | null
  rentEscalationPercentage: string | null
  escalationFrequencyMonths: number | null
  lockInPeriodMonths: number | null
  noticePeriodMonths: number | null
  startDate: string
  endDate: string
  status: string | null
  renewalStatus: string | null
  renewalRecommendationReason: string | null
  metadata: Record<string, unknown> | null
  property: {
    id: string
    name: string
    code: string
    city: string | null
    state: string | null
    address: string | null
  } | null
  tenant: {
    id: string
    businessName: string
    brandName: string | null
    category: string | null
    subcategory: string | null
    contactPerson: string | null
    email: string | null
    phone: string | null
    riskScore: string | null
    satisfactionScore: string | null
    sentimentScore: string | null
    targetOpeningDate: string | null
    onboardingStatus: string | null
    status: string | null
    portalStatus: string
  } | null
  invoices: Invoice[]
  billingSummary: {
    totalInvoiced: number
    totalPaid: number
    totalPending: number
    collectionRate: string
    invoiceCount: number
  }
  posSnapshot: {
    totalGross: number
    totalNet: number
    totalTransactions: number
    days: number
  } | null
}

interface Invoice {
  id: string
  invoiceNumber: string
  billingMonth: string
  dueDate: string
  baseAmount: string | null
  taxAmount: string | null
  totalAmount: string | null
  status: string | null
  createdAt: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active:          "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  draft:           "bg-gray-100 text-gray-700 dark:bg-slate-500/20 dark:text-slate-300",
  expired:         "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  terminated:      "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
  renewal_pending: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  pending:         "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400",
  paid:            "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  overdue:         "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
}

const LEASE_TYPE_LABELS: Record<string, string> = {
  fixed_rent:           "Fixed Rent",
  revenue_share:        "Revenue Share",
  hybrid:               "Hybrid",
  minimum_guarantee:    "Minimum Guarantee",
}

const RISK_LABELS: Record<string, { label: string; color: string }> = {
  low:    { label: "Low",    color: "text-emerald-600" },
  medium: { label: "Medium", color: "text-amber-600" },
  high:   { label: "High",   color: "text-red-600" },
}

function riskLevel(score: string | null) {
  const n = parseFloat(score || "0")
  if (n <= 0.3) return "low"
  if (n <= 0.6) return "medium"
  return "high"
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b last:border-0">
      <span className="text-sm text-muted-foreground shrink-0 w-28 sm:w-32">{label}</span>
      <div className="text-sm font-medium text-right flex-1 min-w-0 break-words [&_*]:break-words">
        {value ?? "—"}
      </div>
    </div>
  )
}

function SkeletonPage() {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-60 rounded-xl" />)}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LeaseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()

  const [lease,   setLease]   = React.useState<LeaseDetail | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error,   setError]   = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`/api/leases/${id}`)
      const json = await res.json()
      if (!res.ok) { setError(json.error || "Failed to load lease"); return }
      setLease(json.data)
    } catch (e) {
      setError("Failed to load lease")
    } finally {
      setLoading(false)
    }
  }, [id])

  React.useEffect(() => { load() }, [load])

  if (loading) return <SkeletonPage />

  if (error || !lease) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-lg font-medium">{error || "Lease not found"}</p>
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
          </Button>
        </div>
      </div>
    )
  }

  const daysRemaining = differenceInDays(new Date(lease.endDate), new Date())
  const isExpiringSoon = daysRemaining > 0 && daysRemaining <= 90
  const isRevShare = ["revenue_share", "hybrid", "minimum_guarantee"].includes(lease.leaseType || "")
  const meta = (lease.metadata || {}) as Record<string, string>

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold break-words">
                {lease.property?.name ?? "Unknown Property"} — Unit {lease.unitNumber}
              </h1>
              <Badge className={cn(STATUS_COLORS[lease.status || "draft"])}>
                {lease.status || "draft"}
              </Badge>
              {isExpiringSoon && (
                <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Expiring in {daysRemaining}d
                </Badge>
              )}
              {daysRemaining < 0 && (
                <Badge className="bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400">Expired</Badge>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {LEASE_TYPE_LABELS[lease.leaseType || ""] ?? lease.leaseType} ·{" "}
              {lease.areaSqft ? `${parseFloat(lease.areaSqft).toLocaleString()} sq.ft` : ""}
              {lease.floor != null && ` · Floor ${lease.floor}`}
              {lease.zone && ` · ${lease.zone}`}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 gap-2 self-end sm:self-start">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          {lease.tenant && (
            <Link href={`/tenants/${lease.tenant.id}`}>
              <Button variant="outline" size="sm">
                <User className="mr-2 h-3.5 w-3.5" /> View Tenant
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* ── KPI summary strip ── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="bg-gradient-to-br from-emerald-50 to-white border-emerald-100 dark:from-emerald-950/40 dark:to-card dark:border-emerald-900/40">
          <CardContent className="pt-4 pb-3">
            <p className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
              <IndianRupee className="h-3 w-3" /> Monthly Rent
            </p>
            <p className="truncate text-xl font-bold text-emerald-700 dark:text-emerald-400" title={formatCurrency(parseFloat(lease.baseRent || "0"))}>
              {formatCurrency(parseFloat(lease.baseRent || "0"))}
            </p>
            {lease.revenueSharePercentage && (
              <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-400">+{lease.revenueSharePercentage}% rev-share</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-100 dark:from-blue-950/40 dark:to-card dark:border-blue-900/40">
          <CardContent className="pt-4 pb-3">
            <p className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Receipt className="h-3 w-3" /> Collection Rate
            </p>
            <p className="text-xl font-bold text-blue-700 dark:text-blue-400">
              {lease.billingSummary.collectionRate}%
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {lease.billingSummary.invoiceCount} invoice{lease.billingSummary.invoiceCount !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-50 to-white border-amber-100 dark:from-amber-950/40 dark:to-card dark:border-amber-900/40">
          <CardContent className="pt-4 pb-3">
            <p className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
              <AlertCircle className="h-3 w-3" /> Pending
            </p>
            <p className="truncate text-xl font-bold text-amber-700 dark:text-amber-400" title={formatCurrency(lease.billingSummary.totalPending)}>
              {formatCurrency(lease.billingSummary.totalPending)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-white border-purple-100 dark:from-purple-950/40 dark:to-card dark:border-purple-900/40">
          <CardContent className="pt-4 pb-3">
            <p className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" /> Days Remaining
            </p>
            <p className={cn(
              "text-xl font-bold",
              daysRemaining < 0
                ? "text-red-600 dark:text-red-400"
                : daysRemaining <= 90
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-purple-700 dark:text-purple-400",
            )}>
              {daysRemaining < 0 ? `${Math.abs(daysRemaining)}d ago` : `${daysRemaining}d`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Main 3-col layout ── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">

        {/* Col 1: Lease Terms */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSignature className="h-4 w-4" /> Lease Terms
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            <DetailRow label="Lease Type"      value={<span className="capitalize">{(lease.leaseType || "fixed_rent").replace(/_/g, " ")}</span>} />
            <DetailRow label="Unit"            value={lease.unitNumber} />
            <DetailRow label="Property"        value={lease.property?.name} />
            <DetailRow label="Floor"           value={lease.floor != null ? `Floor ${lease.floor}` : null} />
            <DetailRow label="Zone"            value={lease.zone} />
            <DetailRow label="Area"            value={lease.areaSqft ? `${parseFloat(lease.areaSqft).toLocaleString()} sq.ft` : null} />
            <DetailRow label="Base Rent"       value={formatCurrency(parseFloat(lease.baseRent || "0"))} />
            <DetailRow label="CAM Charges"     value={lease.camCharges ? formatCurrency(parseFloat(lease.camCharges)) : null} />
            <DetailRow label="Security Deposit" value={lease.securityDeposit ? formatCurrency(parseFloat(lease.securityDeposit)) : null} />
            {lease.revenueSharePercentage && (
              <DetailRow label="Revenue Share" value={`${lease.revenueSharePercentage}%`} />
            )}
            <DetailRow label="Start Date"      value={format(new Date(lease.startDate), "dd MMM yyyy")} />
            <DetailRow label="End Date"        value={format(new Date(lease.endDate), "dd MMM yyyy")} />
            {lease.rentEscalationPercentage && (
              <DetailRow
                label="Escalation"
                value={`${lease.rentEscalationPercentage}% every ${lease.escalationFrequencyMonths || 12} mo`}
              />
            )}
            {lease.lockInPeriodMonths && (
              <DetailRow label="Lock-in Period" value={`${lease.lockInPeriodMonths} months`} />
            )}
            {lease.noticePeriodMonths && (
              <DetailRow label="Notice Period"  value={`${lease.noticePeriodMonths} months`} />
            )}
            {meta.fitOutPeriod && (
              <DetailRow label="Fit-out Period" value={`${meta.fitOutPeriod} days`} />
            )}
            {meta.rentFreePeriod && (
              <DetailRow label="Rent-free Period" value={`${meta.rentFreePeriod} days`} />
            )}
            {lease.renewalStatus && (
              <DetailRow
                label="Renewal Status"
                value={
                  <Badge className={
                    lease.renewalStatus === "recommended"
                      ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400"
                      : "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400"
                  }>
                    {lease.renewalStatus}
                  </Badge>
                }
              />
            )}
          </CardContent>
        </Card>

        {/* Col 2: Tenant Info */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-4 w-4" /> Tenant Info
              </CardTitle>
              {lease.tenant && (
                <Link href={`/tenants/${lease.tenant.id}`}>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                    <ExternalLink className="h-3 w-3" /> View
                  </Button>
                </Link>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!lease.tenant ? (
              <p className="text-sm text-muted-foreground">No tenant linked.</p>
            ) : (
              <div className="space-y-0">
                <DetailRow
                  label="Business"
                  value={
                    <div>
                      <p>{lease.tenant.businessName}</p>
                      {lease.tenant.brandName && lease.tenant.brandName !== lease.tenant.businessName && (
                        <p className="text-xs text-muted-foreground">{lease.tenant.brandName}</p>
                      )}
                    </div>
                  }
                />
                <DetailRow label="Category"    value={<span className="capitalize">{lease.tenant.category?.replace(/_/g, " ")}</span>} />
                <DetailRow label="Sub-category" value={<span className="capitalize">{lease.tenant.subcategory?.replace(/_/g, " ")}</span>} />
                <DetailRow
                  label="Contact"
                  value={
                    <div className="space-y-0.5">
                      {lease.tenant.contactPerson && <p className="break-words">{lease.tenant.contactPerson}</p>}
                      {lease.tenant.phone && (
                        <p className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3 shrink-0" />
                          <a href={`tel:${lease.tenant.phone}`} className="break-all hover:underline">
                            {lease.tenant.phone}
                          </a>
                        </p>
                      )}
                      {lease.tenant.email && (
                        <p className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                          <Mail className="h-3 w-3 shrink-0" />
                          <a href={`mailto:${lease.tenant.email}`} className="break-all hover:underline" title={lease.tenant.email}>
                            {lease.tenant.email}
                          </a>
                        </p>
                      )}
                    </div>
                  }
                />
                <DetailRow
                  label="Tenant Status"
                  value={
                    <Badge className={
                      lease.tenant.status === "active"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                        : "bg-gray-100 text-gray-700 dark:bg-slate-500/20 dark:text-slate-300"
                    }>
                      {lease.tenant.status || "unknown"}
                    </Badge>
                  }
                />
                <DetailRow
                  label="Portal"
                  value={
                    <Badge className={
                      lease.tenant.portalStatus === "active"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400"
                        : "bg-gray-100 text-gray-600 dark:bg-slate-500/20 dark:text-slate-300"
                    }>
                      {lease.tenant.portalStatus}
                    </Badge>
                  }
                />
                {lease.tenant.riskScore && (
                  <DetailRow
                    label="Risk Score"
                    value={
                      <span className={cn("font-semibold", RISK_LABELS[riskLevel(lease.tenant.riskScore)]?.color)}>
                        {RISK_LABELS[riskLevel(lease.tenant.riskScore)]?.label} ({parseFloat(lease.tenant.riskScore).toFixed(2)})
                      </span>
                    }
                  />
                )}
                {lease.tenant.targetOpeningDate && (
                  <DetailRow
                    label="Opening Date"
                    value={format(new Date(lease.tenant.targetOpeningDate), "dd MMM yyyy")}
                  />
                )}
                {lease.tenant.onboardingStatus && (
                  <DetailRow
                    label="Onboarding"
                    value={
                      <span className="capitalize text-xs font-medium">
                        {lease.tenant.onboardingStatus.replace(/_/g, " ")}
                      </span>
                    }
                  />
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Col 3: Billing + POS Snapshot */}
        <div className="space-y-4">
          {/* Billing Summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <IndianRupee className="h-4 w-4" /> Billing Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: "Total Invoiced", value: formatCurrency(lease.billingSummary.totalInvoiced), color: "text-foreground" },
                { label: "Total Paid",     value: formatCurrency(lease.billingSummary.totalPaid),     color: "text-emerald-600" },
                { label: "Pending",        value: formatCurrency(lease.billingSummary.totalPending),  color: "text-amber-600" },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className={cn("text-sm font-semibold", color)}>{value}</span>
                </div>
              ))}
              <div className="flex items-center justify-between rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
                <span className="text-sm font-medium">Collection Rate</span>
                <span className="text-sm font-bold text-primary">{lease.billingSummary.collectionRate}%</span>
              </div>
            </CardContent>
          </Card>

          {/* POS Snapshot */}
          {isRevShare && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShoppingCart className="h-4 w-4" /> POS (Last 30 Days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {lease.posSnapshot ? (
                  <div className="space-y-2">
                    {[
                      { label: "Gross Sales",   value: formatCurrency(lease.posSnapshot.totalGross),  icon: TrendingUp },
                      { label: "Net Revenue",   value: formatCurrency(lease.posSnapshot.totalNet),    icon: IndianRupee },
                      { label: "Transactions",  value: lease.posSnapshot.totalTransactions.toLocaleString(), icon: Activity },
                      { label: "Days Tracked",  value: `${lease.posSnapshot.days} days`,              icon: Calendar },
                    ].map(({ label, value, icon: Icon }) => (
                      <div key={label} className="flex items-center justify-between rounded-lg border px-3 py-2">
                        <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                          <Icon className="h-3.5 w-3.5" />{label}
                        </span>
                        <span className="text-sm font-semibold">{value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-6 text-center">
                    <ShoppingCart className="h-8 w-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">No POS data in last 30 days.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ── Invoice History ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Invoice History
          </CardTitle>
          <CardDescription>Most recent {lease.invoices.length} invoices for this lease</CardDescription>
        </CardHeader>
        <CardContent>
          {lease.invoices.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Receipt className="h-12 w-12 text-muted-foreground/30" />
              <p className="text-muted-foreground">No invoices generated yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Billing Month</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Base Amount</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lease.invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-sm">{inv.invoiceNumber}</TableCell>
                    <TableCell>{inv.billingMonth}</TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(inv.dueDate), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(parseFloat(inv.baseAmount || "0"))}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatCurrency(parseFloat(inv.taxAmount || "0"))}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(parseFloat(inv.totalAmount || "0"))}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {inv.status === "paid"    && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                        {inv.status === "overdue" && <AlertCircle  className="h-3.5 w-3.5 text-red-500" />}
                        {inv.status === "pending" && <Clock        className="h-3.5 w-3.5 text-amber-500" />}
                        <Badge className={cn("text-xs", STATUS_COLORS[inv.status || "pending"])}>
                          {inv.status || "pending"}
                        </Badge>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
