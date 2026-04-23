"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import {
  Loader2,
  KeyRound,
  Copy,
  CheckCheck,
  ExternalLink,
  ShieldCheck,
  User,
  Mail,
  AlertCircle,
  RefreshCw,
  ShieldOff,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/use-toast"

// ── Types ─────────────────────────────────────────────────────────────────────

interface GrantPortalAccessDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenant: {
    id: string
    businessName: string
    email: string | null
    contactPerson: string | null
  }
}

interface ExistingAccess {
  hasAccess: boolean
  email?: string
  name?: string
  isActive?: boolean
  lastLoginAt?: string | null
  createdAt?: string
}

type Step = "check" | "form" | "success" | "existing"

// ── Helpers ───────────────────────────────────────────────────────────────────

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 bg-muted px-3 py-2 rounded-md text-sm font-mono break-all">{value}</code>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 flex-shrink-0"
          onClick={handleCopy}
        >
          {copied
            ? <CheckCheck className="h-4 w-4 text-green-600" />
            : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function GrantPortalAccessDialog({ open, onOpenChange, tenant }: GrantPortalAccessDialogProps) {
  const { toast } = useToast()
  const [step, setStep] = React.useState<Step>("check")
  const [isLoading, setIsLoading] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [isRevoking, setIsRevoking] = React.useState(false)
  const [existingAccess, setExistingAccess] = React.useState<ExistingAccess | null>(null)

  const [email, setEmail] = React.useState(tenant.email || "")
  const [name, setName] = React.useState(tenant.contactPerson || "")
  const [emailError, setEmailError] = React.useState("")

  const [credentials, setCredentials] = React.useState<{
    email: string
    temporaryPassword: string
    loginUrl: string
  } | null>(null)

  // Check for existing access when dialog opens
  React.useEffect(() => {
    if (!open) return
    setEmail(tenant.email || "")
    setName(tenant.contactPerson || "")
    setEmailError("")
    setCredentials(null)
    checkExistingAccess()
  }, [open, tenant])

  const checkExistingAccess = async () => {
    setIsLoading(true)
    setStep("check")
    try {
      const res = await fetch(`/api/tenants/${tenant.id}/portal-access`)
      const json = await res.json()
      if (json.success) {
        setExistingAccess(json.data)
        setStep(json.data.hasAccess ? "existing" : "form")
      } else {
        setStep("form")
      }
    } catch {
      setStep("form")
    } finally {
      setIsLoading(false)
    }
  }

  const handleGrant = async () => {
    if (!email.trim()) { setEmailError("Email is required"); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setEmailError("Enter a valid email"); return }
    setEmailError("")
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/tenants/${tenant.id}/portal-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), name: name.trim() || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to grant access")
      setCredentials(json.data)
      setStep("success")
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRevoke = async () => {
    if (!confirm("Are you sure you want to revoke portal access? The tenant will no longer be able to log in.")) return
    setIsRevoking(true)
    try {
      const res = await fetch(`/api/tenants/${tenant.id}/portal-access`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to revoke access")
      toast({ title: "Access revoked", description: `${tenant.businessName} can no longer access the portal.` })
      onOpenChange(false)
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" })
    } finally {
      setIsRevoking(false)
    }
  }

  const handleResetPassword = async () => {
    setIsSubmitting(true)
    try {
      // Re-grant with same email generates new password
      const res = await fetch(`/api/tenants/${tenant.id}/portal-access`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Failed")
      // Now re-grant
      const grantRes = await fetch(`/api/tenants/${tenant.id}/portal-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: existingAccess?.email, name: existingAccess?.name }),
      })
      const json = await grantRes.json()
      if (!grantRes.ok) throw new Error(json.error || "Failed to reset password")
      setCredentials(json.data)
      setStep("success")
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setStep("check")
    setCredentials(null)
    setEmailError("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            Tenant Portal Access
          </DialogTitle>
          <DialogDescription>
            {tenant.businessName}
          </DialogDescription>
        </DialogHeader>

        {/* ── Loading state ── */}
        {step === "check" && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* ── Form step ── */}
        {step === "form" && (
          <div className="space-y-5 py-2">
            <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p>This will create a portal account. Share the generated credentials with the tenant so they can log in at <strong>/portal/login</strong>.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  Login Email <span className="text-destructive">*</span>
                </label>
                <Input
                  type="email"
                  placeholder="tenant@example.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setEmailError("") }}
                />
                {emailError && <p className="text-xs text-destructive mt-1">{emailError}</p>}
              </div>
              <div>
                <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  Contact Name
                </label>
                <Input
                  placeholder="Contact person's name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              A secure temporary password will be generated automatically. The tenant must change it after first login.
            </p>
          </div>
        )}

        {/* ── Existing access ── */}
        {step === "existing" && existingAccess?.hasAccess && (
          <div className="space-y-4 py-2">
            <div className={cn(
              "flex items-center gap-3 p-3 rounded-lg border",
              existingAccess.isActive
                ? "bg-green-50 border-green-200"
                : "bg-yellow-50 border-yellow-200"
            )}>
              <ShieldCheck className={cn("h-5 w-5", existingAccess.isActive ? "text-green-600" : "text-yellow-600")} />
              <div>
                <p className="text-sm font-medium">
                  {existingAccess.isActive ? "Portal access is active" : "Portal access is inactive"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {existingAccess.isActive
                    ? existingAccess.lastLoginAt
                      ? `Last login: ${new Date(existingAccess.lastLoginAt).toLocaleDateString("en-IN")}`
                      : "Never logged in"
                    : "Access was previously revoked"}
                </p>
              </div>
              <Badge className={existingAccess.isActive ? "bg-green-100 text-green-700 ml-auto" : "bg-yellow-100 text-yellow-700 ml-auto"}>
                {existingAccess.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>

            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Login email</span>
                <span className="font-medium">{existingAccess.email}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Name</span>
                <span className="font-medium">{existingAccess.name || "—"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Created</span>
                <span className="font-medium">
                  {existingAccess.createdAt
                    ? new Date(existingAccess.createdAt).toLocaleDateString("en-IN")
                    : "—"}
                </span>
              </div>
              <Separator className="my-1" />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Portal URL</span>
                <a
                  href="/portal/login"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-primary flex items-center gap-1 hover:underline"
                >
                  /portal/login <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 gap-2"
                onClick={handleResetPassword}
                disabled={isSubmitting || isRevoking}
              >
                {isSubmitting
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <RefreshCw className="h-4 w-4" />}
                Reset Password
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1 gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={handleRevoke}
                disabled={isRevoking || isSubmitting}
              >
                {isRevoking
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <ShieldOff className="h-4 w-4" />}
                Revoke Access
              </Button>
            </div>
          </div>
        )}

        {/* ── Success step ── */}
        {step === "success" && credentials && (
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <ShieldCheck className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-green-800">Portal access granted!</p>
                <p className="text-xs text-green-700 mt-0.5">Share these credentials with the tenant. This password will not be shown again.</p>
              </div>
            </div>

            <div className="space-y-3 p-4 bg-muted/50 rounded-lg border">
              <CopyField label="Login Email" value={credentials.email} />
              <CopyField label="Temporary Password" value={credentials.temporaryPassword} />
              <CopyField label="Login URL" value={credentials.loginUrl} />
            </div>

            <div className="text-xs text-muted-foreground space-y-1 pl-1">
              <p>• The tenant must change this password after first login</p>
              <p>• They can access invoices, lease details, documents and support</p>
              <p>• You can revoke access at any time from this menu</p>
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <DialogFooter>
          {step === "form" && (
            <>
              <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
              <Button type="button" onClick={handleGrant} disabled={isSubmitting} className="gap-2">
                {isSubmitting
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Granting…</>
                  : <><KeyRound className="h-4 w-4" /> Grant Access</>}
              </Button>
            </>
          )}
          {step === "success" && (
            <Button type="button" onClick={handleClose} className="w-full gap-2">
              <CheckCheck className="h-4 w-4" /> Done
            </Button>
          )}
          {step === "existing" && (
            <Button type="button" variant="outline" onClick={handleClose}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
