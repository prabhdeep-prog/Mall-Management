"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Scroll,
  Calendar,
  MapPin,
  IndianRupee,
  Percent,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Receipt,
} from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils/index"

interface LeaseData {
  id: string
  startDate: string
  endDate: string
  status: string
  leaseType: string | null
  minimumGuarantee: number | null
  revenueSharePercentage: number | null
  revShareBreakpoint: number | null
  baseRent: number | null
  camCharges: number | null
  camCapPerSqft: number | null
  securityDeposit: number | null
  escalation: {
    percentage: number | null
    frequencyMonths: number | null
  }
  billingCycle: string
  paymentTerms: Record<string, unknown> | null
  lockInPeriodMonths: number | null
  noticePeriodMonths: number | null
  clauses: unknown[] | null
  unit: {
    unitNumber: string
    floor: number | null
    zone: string | null
    areaSqft: number | null
  }
  property: {
    name: string
    city: string
  } | null
}

const LEASE_TYPE_LABELS: Record<string, string> = {
  fixed_rent: "Fixed Rent",
  revenue_share: "Revenue Share",
  hybrid: "Hybrid (MG + Rev Share)",
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active:     { label: "Active",     className: "bg-green-100 text-green-700"  },
  expired:    { label: "Expired",    className: "bg-gray-100 text-gray-600"    },
  terminated: { label: "Terminated", className: "bg-red-100 text-red-700"      },
  draft:      { label: "Draft",      className: "bg-yellow-100 text-yellow-700" },
}

const BILLING_LABELS: Record<string, string> = {
  monthly: "Monthly", quarterly: "Quarterly", annual: "Annual", yearly: "Annual",
}

function DetailRow({ label, value, icon: Icon }: {
  label: string
  value: React.ReactNode
  icon?: React.ElementType
}) {
  return (
    <div className="flex items-start justify-between py-3 border-b last:border-0">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5 flex-shrink-0" />}
        {label}
      </div>
      <div className="text-sm font-medium text-right max-w-[60%]">{value ?? "—"}</div>
    </div>
  )
}

export default function TenantLeasePage() {
  const [lease, setLease]           = React.useState<LeaseData | null>(null)
  const [isLoading, setIsLoading]   = React.useState(true)
  const [error, setError]           = React.useState<string | null>(null)

  React.useEffect(() => {
    fetch("/api/tenant/lease")
      .then((r) => r.json())
      .then((res) => { if (res.data) setLease(res.data); else setError("No lease found") })
      .catch(() => setError("Failed to load lease"))
      .finally(() => setIsLoading(false))
  }, [])

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !lease) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm">{error ?? "No active lease"}</p>
      </div>
    )
  }

  const s = STATUS_CONFIG[lease.status] ?? STATUS_CONFIG.active
  const daysRemaining = Math.ceil(
    (new Date(lease.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  )

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Lease Details</h1>
          <p className="text-sm text-muted-foreground mt-1">Your current lease agreement</p>
        </div>
        <Badge className={`${s.className} text-xs`}>{s.label}</Badge>
      </div>

      {/* Expiry banner */}
      {daysRemaining > 0 && daysRemaining <= 90 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Clock className="h-4 w-4 flex-shrink-0" />
          Your lease expires in <strong>{daysRemaining} days</strong> on {formatDate(lease.endDate)}.
          Contact your property manager for renewal.
        </div>
      )}
      {daysRemaining <= 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          Your lease expired on {formatDate(lease.endDate)}. Please contact your property manager.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Location */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4" /> Property & Unit
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <DetailRow label="Property"    value={lease.property?.name} />
            <DetailRow label="City"        value={lease.property?.city} />
            <DetailRow label="Unit Number" value={lease.unit.unitNumber} />
            <DetailRow label="Floor"       value={lease.unit.floor !== null ? `Floor ${lease.unit.floor}` : null} />
            <DetailRow label="Zone"        value={lease.unit.zone} />
            <DetailRow label="Area"        value={lease.unit.areaSqft ? `${lease.unit.areaSqft.toLocaleString()} sq ft` : null} />
          </CardContent>
        </Card>

        {/* Term */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4" /> Lease Term
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <DetailRow label="Start Date"     value={formatDate(lease.startDate)} />
            <DetailRow label="End Date"       value={formatDate(lease.endDate)} />
            <DetailRow label="Status"         value={<Badge className={`${s.className} text-[10px]`}>{s.label}</Badge>} />
            <DetailRow label="Lock-in Period" value={lease.lockInPeriodMonths ? `${lease.lockInPeriodMonths} months` : null} />
            <DetailRow label="Notice Period"  value={lease.noticePeriodMonths ? `${lease.noticePeriodMonths} months` : null} />
          </CardContent>
        </Card>

        {/* Financials */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <IndianRupee className="h-4 w-4" /> Financial Terms
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <DetailRow label="Lease Type" value={lease.leaseType ? (LEASE_TYPE_LABELS[lease.leaseType] ?? lease.leaseType) : null} />
            {lease.baseRent !== null && (
              <DetailRow label="Base Rent (monthly)" value={formatCurrency(lease.baseRent)} />
            )}
            {lease.minimumGuarantee !== null && lease.minimumGuarantee > 0 && (
              <DetailRow label="Minimum Guarantee" value={formatCurrency(lease.minimumGuarantee)} />
            )}
            {lease.revenueSharePercentage !== null && (
              <DetailRow label="Revenue Share" value={`${lease.revenueSharePercentage}%`} />
            )}
            {lease.revShareBreakpoint !== null && (
              <DetailRow label="Rev Share Breakpoint" value={formatCurrency(lease.revShareBreakpoint)} />
            )}
            {lease.camCharges !== null && (
              <DetailRow label="CAM Charges" value={formatCurrency(lease.camCharges)} />
            )}
            {lease.securityDeposit !== null && (
              <DetailRow label="Security Deposit" value={formatCurrency(lease.securityDeposit)} />
            )}
          </CardContent>
        </Card>

        {/* Escalation & Billing */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Percent className="h-4 w-4" /> Escalation & Billing
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {lease.escalation.percentage !== null ? (
              <>
                <DetailRow label="Escalation Rate" value={`${lease.escalation.percentage}% per cycle`} />
                <DetailRow label="Escalation Frequency" value={lease.escalation.frequencyMonths ? `Every ${lease.escalation.frequencyMonths} months` : null} />
              </>
            ) : (
              <div className="flex items-center gap-2 py-3 border-b text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4" />
                No escalation clause in this lease
              </div>
            )}
            <DetailRow
              label="Billing Cycle"
              icon={Receipt}
              value={BILLING_LABELS[lease.billingCycle] ?? lease.billingCycle}
            />
          </CardContent>
        </Card>
      </div>

      {/* Clauses */}
      {lease.clauses && lease.clauses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Scroll className="h-4 w-4" /> Clauses
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-2">
              {lease.clauses.map((clause, i) => (
                <li key={i} className="text-sm text-muted-foreground border-b last:border-0 py-2">
                  {typeof clause === "string" ? clause : JSON.stringify(clause)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
