"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useToast } from "@/components/ui/use-toast"
import {
  Settings,
  User,
  Lock,
  Bell,
  Building2,
  Loader2,
  CheckCircle2,
  Eye,
  EyeOff,
} from "lucide-react"
import { useSession } from "next-auth/react"

interface TenantProfile {
  name: string
  email: string
  phone: string | null
  businessName: string
  contactPerson: string | null
  gstin: string | null
  pan: string | null
}

export default function TenantSettingsPage() {
  const { data: session } = useSession()
  const { toast } = useToast()

  const [profile, setProfile]         = React.useState<TenantProfile | null>(null)
  const [isLoading, setIsLoading]     = React.useState(true)
  const [isSaving, setIsSaving]       = React.useState(false)

  // Password change form state
  const [pwForm, setPwForm]           = React.useState({ current: "", next: "", confirm: "" })
  const [showPw, setShowPw]           = React.useState(false)
  const [isChangingPw, setIsChangingPw] = React.useState(false)

  React.useEffect(() => {
    fetch("/api/tenant/profile")
      .then((r) => r.json())
      .then((res) => setProfile(res.data ?? null))
      .finally(() => setIsLoading(false))
  }, [])

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setIsSaving(true)
    try {
      const res = await fetch("/api/tenant/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: profile.name, phone: profile.phone }),
      })
      if (res.ok) {
        toast({ title: "Profile updated", description: "Your changes have been saved." })
      } else {
        toast({ title: "Error", description: "Failed to update profile.", variant: "destructive" })
      }
    } finally {
      setIsSaving(false)
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault()
    if (pwForm.next !== pwForm.confirm) {
      toast({ title: "Passwords do not match", variant: "destructive" })
      return
    }
    if (pwForm.next.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" })
      return
    }
    setIsChangingPw(true)
    try {
      const res = await fetch("/api/tenant/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.next }),
      })
      if (res.ok) {
        toast({ title: "Password changed", description: "Your password has been updated." })
        setPwForm({ current: "", next: "", confirm: "" })
      } else {
        const body = await res.json()
        toast({ title: "Error", description: body.error ?? "Failed to change password.", variant: "destructive" })
      }
    } finally {
      setIsChangingPw(false)
    }
  }

  const initials = session?.user?.name
    ? session.user.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : "T"

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account and preferences</p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4" /> Profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <form onSubmit={handleProfileSave} className="space-y-4">
              {/* Avatar */}
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14">
                  <AvatarFallback className="bg-primary text-primary-foreground text-lg font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{profile?.businessName}</p>
                  <p className="text-xs text-muted-foreground">{profile?.email}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Display Name</Label>
                  <Input
                    id="name"
                    value={profile?.name ?? ""}
                    onChange={(e) => setProfile((p) => p ? { ...p, name: e.target.value } : p)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" value={profile?.email ?? ""} disabled className="bg-muted" />
                  <p className="text-[11px] text-muted-foreground">Email cannot be changed</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={profile?.phone ?? ""}
                    onChange={(e) => setProfile((p) => p ? { ...p, phone: e.target.value } : p)}
                  />
                </div>
              </div>
              <Button type="submit" size="sm" disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                Save Changes
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Business info (read-only) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" /> Business Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-4">
            Business details are managed by your property manager. Contact them to make changes.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              { label: "Business Name",   value: profile?.businessName },
              { label: "Contact Person",  value: profile?.contactPerson },
              { label: "GSTIN",           value: profile?.gstin },
              { label: "PAN",             value: profile?.pan },
            ].map(({ label, value }) => (
              <div key={label} className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{label}</Label>
                <Input value={value ?? "—"} disabled className="bg-muted text-sm" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4" /> Change Password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            {(["current", "next", "confirm"] as const).map((field) => (
              <div key={field} className="space-y-1.5">
                <Label htmlFor={`pw-${field}`}>
                  {{ current: "Current Password", next: "New Password", confirm: "Confirm New Password" }[field]}
                </Label>
                <div className="relative">
                  <Input
                    id={`pw-${field}`}
                    type={showPw ? "text" : "password"}
                    value={pwForm[field]}
                    onChange={(e) => setPwForm((p) => ({ ...p, [field]: e.target.value }))}
                    required
                    minLength={field === "current" ? undefined : 8}
                    autoComplete={field === "current" ? "current-password" : "new-password"}
                  />
                  {field === "confirm" && (
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPw((v) => !v)}
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  )}
                </div>
              </div>
            ))}
            <Button type="submit" size="sm" disabled={isChangingPw}>
              {isChangingPw ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-2 h-3.5 w-3.5" />}
              Update Password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
