import { TenantRiskHeatmap } from "@/components/dashboard/tenant-risk-heatmap"

export const dynamic = "force-dynamic"

export default function TenantRiskPage() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tenant Risk</h1>
        <p className="text-muted-foreground">
          Composite 0–100 score from late payments, POS sales trend, complaints, and lease expiry.
        </p>
      </div>
      <TenantRiskHeatmap />
    </div>
  )
}
