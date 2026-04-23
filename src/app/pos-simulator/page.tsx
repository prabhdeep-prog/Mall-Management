"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import {
  CreditCard,
  Banknote,
  Smartphone,
  Receipt,
  Wifi,
  Clock,
  CheckCircle2,
  IndianRupee,
  Store,
  Loader2,
  ShoppingBag,
  Minus,
  Hash,
  TrendingUp,
  ChevronDown,
} from "lucide-react"

// ============================================================================
// Types
// ============================================================================

interface Integration {
  id: string
  tenantId: string
  propertyId: string
  leaseId: string
  provider: string
  storeId: string
  status: string
  lastSyncAt: string | null
  businessName: string
  category: string
  unitNumber: string
  floor: number | null
  revenueSharePercentage: string | null
}

interface TodaySales {
  grossSales: number
  netSales: number
  discounts: number
  transactionCount: number
  avgTransactionValue: number
  categoryBreakdown: Record<string, number>
}

interface Transaction {
  id: string
  time: string
  amount: number
  category: string
  categoryLabel: string
  paymentMethod: string
  discount: number
}

// ============================================================================
// Constants
// ============================================================================

const PROVIDER_ICONS: Record<string, string> = {
  pine_labs: "\u{1F332}",
  razorpay_pos: "\u26A1",
  petpooja: "\u{1F37D}\uFE0F",
  posist: "\u{1F3EA}",
  shopify: "\u{1F6CD}\uFE0F",
  square: "\u{1F7E6}",
  lightspeed: "\u{1F4A1}",
  vend: "\u{1F3F7}\uFE0F",
}

const PROVIDER_NAMES: Record<string, string> = {
  pine_labs: "Pine Labs",
  razorpay_pos: "Razorpay POS",
  petpooja: "Petpooja",
  posist: "POSist",
  shopify: "Shopify POS",
  square: "Square",
  lightspeed: "Lightspeed",
  vend: "Vend",
}

// Category-specific product buttons
const CATEGORY_PRODUCTS: Record<string, Array<{ key: string; label: string; icon: string }>> = {
  sports: [
    { key: "mens_shoes", label: "Men's Shoes", icon: "\u{1F45E}" },
    { key: "womens_shoes", label: "Women's Shoes", icon: "\u{1F460}" },
    { key: "kids_shoes", label: "Kids", icon: "\u{1F45F}" },
    { key: "accessories", label: "Accessories", icon: "\u{1F45C}" },
  ],
  fashion: [
    { key: "mens_wear", label: "Men's Wear", icon: "\u{1F454}" },
    { key: "womens_wear", label: "Women's Wear", icon: "\u{1F457}" },
    { key: "kids_wear", label: "Kids", icon: "\u{1F9E5}" },
    { key: "accessories", label: "Accessories", icon: "\u{1F45C}" },
  ],
  food_beverage: [
    { key: "sweets", label: "Sweets", icon: "\u{1F36C}" },
    { key: "namkeen", label: "Namkeen", icon: "\u{1F35F}" },
    { key: "beverages", label: "Beverages", icon: "\u{1F964}" },
    { key: "meals", label: "Meals", icon: "\u{1F35B}" },
  ],
  electronics: [
    { key: "phones", label: "Phones", icon: "\u{1F4F1}" },
    { key: "laptops", label: "Laptops", icon: "\u{1F4BB}" },
    { key: "accessories", label: "Accessories", icon: "\u{1F50C}" },
    { key: "audio", label: "Audio", icon: "\u{1F3A7}" },
  ],
  entertainment: [
    { key: "tickets", label: "Tickets", icon: "\u{1F39F}\uFE0F" },
    { key: "fnb", label: "F&B", icon: "\u{1F37F}" },
    { key: "merchandise", label: "Merch", icon: "\u{1F455}" },
    { key: "premium", label: "Premium", icon: "\u2B50" },
  ],
  health_beauty: [
    { key: "skincare", label: "Skincare", icon: "\u{1F9F4}" },
    { key: "makeup", label: "Makeup", icon: "\u{1F484}" },
    { key: "wellness", label: "Wellness", icon: "\u{1F33F}" },
    { key: "fragrance", label: "Fragrance", icon: "\u{1F338}" },
  ],
  jewelry: [
    { key: "gold", label: "Gold", icon: "\u{1F48D}" },
    { key: "diamond", label: "Diamond", icon: "\u{1F48E}" },
    { key: "silver", label: "Silver", icon: "\u{1FA99}" },
    { key: "fashion_jewelry", label: "Fashion", icon: "\u2728" },
  ],
  home_lifestyle: [
    { key: "furniture", label: "Furniture", icon: "\u{1FA91}" },
    { key: "decor", label: "Decor", icon: "\u{1F3E0}" },
    { key: "kitchen", label: "Kitchen", icon: "\u{1F373}" },
    { key: "bedding", label: "Bedding", icon: "\u{1F6CF}\uFE0F" },
  ],
}

const DEFAULT_PRODUCTS = [
  { key: "product_a", label: "Category A", icon: "\u{1F4E6}" },
  { key: "product_b", label: "Category B", icon: "\u{1F381}" },
  { key: "product_c", label: "Category C", icon: "\u{1F6D2}" },
  { key: "product_d", label: "Category D", icon: "\u{1F3F7}\uFE0F" },
]

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatRelativeTime(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffMs / 60000)
  if (diffSecs < 10) return "Just now"
  if (diffSecs < 60) return `${diffSecs}s ago`
  if (diffMins < 60) return `${diffMins}m ago`
  return `${Math.floor(diffMins / 60)}h ago`
}

// ============================================================================
// Component
// ============================================================================

export default function POSSimulatorPage() {
  const searchParams = useSearchParams()
  const presetTenantId = searchParams.get("tenantId")

  // Store selection
  const [integrations, setIntegrations] = React.useState<Integration[]>([])
  const [selectedIntegration, setSelectedIntegration] = React.useState<Integration | null>(null)
  const [storeDropdownOpen, setStoreDropdownOpen] = React.useState(false)

  // Sale form
  const [amount, setAmount] = React.useState("")
  const [category, setCategory] = React.useState("")
  const [paymentMethod, setPaymentMethod] = React.useState("card")
  const [discount, setDiscount] = React.useState("")

  // Today's data
  const [todaySales, setTodaySales] = React.useState<TodaySales | null>(null)

  // Transaction log (session only)
  const [transactions, setTransactions] = React.useState<Transaction[]>([])

  // UI state
  const [loading, setLoading] = React.useState(true)
  const [submitting, setSubmitting] = React.useState(false)
  const [lastSyncAt, setLastSyncAt] = React.useState<string | null>(null)
  const [saleSuccess, setSaleSuccess] = React.useState(false)
  const [currentTime, setCurrentTime] = React.useState(new Date())

  // Clock tick
  React.useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  // Fetch integrations on mount
  React.useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/pos/simulator")
        const result = await res.json()
        if (result.success) {
          setIntegrations(result.data)
        }
      } catch (error) {
        console.error("Failed to load integrations:", error)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Load today's data when store selected
  const loadTodayData = React.useCallback(async (integrationId: string) => {
    try {
      const res = await fetch(`/api/pos/simulator?integrationId=${integrationId}`)
      const result = await res.json()
      if (result.success && result.data.todaySales) {
        const s = result.data.todaySales
        setTodaySales({
          grossSales: Number(s.grossSales),
          netSales: Number(s.netSales),
          discounts: Number(s.discounts || 0),
          transactionCount: s.transactionCount || 0,
          avgTransactionValue: Number(s.avgTransactionValue || 0),
          categoryBreakdown: (s.categoryBreakdown as Record<string, number>) || {},
        })
      } else {
        setTodaySales(null)
      }
    } catch {
      setTodaySales(null)
    }
  }, [])

  const handleSelectStore = React.useCallback((integration: Integration) => {
    setSelectedIntegration(integration)
    setStoreDropdownOpen(false)
    setTransactions([])
    setAmount("")
    setDiscount("")
    const products = CATEGORY_PRODUCTS[integration.category] || DEFAULT_PRODUCTS
    setCategory(products[0]?.key || "")
    loadTodayData(integration.id)
  }, [loadTodayData])

  // Auto-select the integration matching ?tenantId= once integrations have loaded.
  React.useEffect(() => {
    if (!presetTenantId || selectedIntegration || integrations.length === 0) return
    const match = integrations.find((i) => i.tenantId === presetTenantId)
    if (match) handleSelectStore(match)
  }, [presetTenantId, integrations, selectedIntegration, handleSelectStore])

  // Record a sale
  const handleCompleteSale = async () => {
    if (!selectedIntegration || !amount || Number(amount) <= 0) return
    setSubmitting(true)
    setSaleSuccess(false)

    try {
      const res = await fetch("/api/pos/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posIntegrationId: selectedIntegration.id,
          amount: parseFloat(amount),
          paymentMethod,
          category,
          discount: discount ? parseFloat(discount) : 0,
        }),
      })
      const result = await res.json()

      if (result.success) {
        const products = CATEGORY_PRODUCTS[selectedIntegration.category] || DEFAULT_PRODUCTS
        const catLabel = products.find(p => p.key === category)?.label || category

        // Add to local transaction log
        setTransactions(prev => [{
          id: crypto.randomUUID(),
          time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          amount: parseFloat(amount),
          category,
          categoryLabel: catLabel,
          paymentMethod,
          discount: discount ? parseFloat(discount) : 0,
        }, ...prev])

        // Update today's totals from response
        setTodaySales({
          grossSales: result.data.grossSales,
          netSales: result.data.netSales,
          discounts: result.data.discounts,
          transactionCount: result.data.transactionCount,
          avgTransactionValue: result.data.avgTransactionValue,
          categoryBreakdown: result.data.categoryBreakdown,
        })
        setLastSyncAt(result.data.lastSyncAt)

        // Flash success
        setSaleSuccess(true)
        setTimeout(() => setSaleSuccess(false), 1500)

        // Reset form (keep category & payment for speed)
        setAmount("")
        setDiscount("")
      }
    } catch (error) {
      console.error("Sale failed:", error)
    } finally {
      setSubmitting(false)
    }
  }

  // Products for current store
  const products = selectedIntegration
    ? (CATEGORY_PRODUCTS[selectedIntegration.category] || DEFAULT_PRODUCTS)
    : DEFAULT_PRODUCTS

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header ── */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur px-6 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          {/* Left: Provider branding */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center text-xl">
              {selectedIntegration
                ? (PROVIDER_ICONS[selectedIntegration.provider] || "\u{1F4BB}")
                : "\u{1F4BB}"}
            </div>
            <div>
              <div className="font-bold text-sm tracking-wide">
                {selectedIntegration
                  ? PROVIDER_NAMES[selectedIntegration.provider] || "POS Terminal"
                  : "POS Terminal"}
              </div>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest">
                Point of Sale Simulator
              </div>
            </div>
          </div>

          {/* Center: Store name */}
          {selectedIntegration && (
            <div className="text-center hidden md:block">
              <div className="font-semibold">{selectedIntegration.businessName}</div>
              <div className="text-xs text-slate-400">
                Unit {selectedIntegration.unitNumber}
                {selectedIntegration.floor !== null && ` \u00B7 Floor ${selectedIntegration.floor}`}
                {selectedIntegration.revenueSharePercentage && ` \u00B7 ${selectedIntegration.revenueSharePercentage}% rev share`}
              </div>
            </div>
          )}

          {/* Right: Sync + Clock */}
          <div className="flex items-center gap-4">
            {lastSyncAt && (
              <div className="flex items-center gap-2 text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-slate-400">Synced {formatRelativeTime(lastSyncAt)}</span>
              </div>
            )}
            <div className="text-right">
              <div className="text-sm font-mono">
                {currentTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </div>
              <div className="text-[10px] text-slate-500">
                {currentTime.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Store Selector ── */}
      {!selectedIntegration ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-lg w-full space-y-6 text-center">
            <Store className="h-16 w-16 text-slate-600 mx-auto" />
            <h2 className="text-2xl font-bold">Select a Store</h2>
            <p className="text-slate-400">Choose a connected POS integration to start entering sales</p>
            <div className="space-y-2">
              {integrations.map(int => (
                <button
                  key={int.id}
                  onClick={() => handleSelectStore(int)}
                  className="w-full flex items-center gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-600 hover:bg-slate-800/80 transition-all text-left"
                >
                  <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center text-2xl">
                    {PROVIDER_ICONS[int.provider] || "\u{1F4BB}"}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold">{int.businessName}</div>
                    <div className="text-xs text-slate-400">
                      {PROVIDER_NAMES[int.provider]} \u00B7 Unit {int.unitNumber}
                      {int.floor !== null && ` \u00B7 Floor ${int.floor}`}
                      <span className="capitalize"> \u00B7 {(int.category || "").replace("_", " ")}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-emerald-400 text-xs">
                    <Wifi className="h-3 w-3" />
                    Connected
                  </div>
                </button>
              ))}
              {integrations.length === 0 && (
                <div className="p-8 text-slate-500 text-sm space-y-2 text-center">
                  <Store className="h-10 w-10 mx-auto text-slate-600 mb-3" />
                  <p className="font-medium text-slate-400">No connected POS integrations found</p>
                  <p className="text-xs">
                    Go to <span className="font-mono text-slate-300">Tenants → [Tenant] → Lease</span> and create a <span className="text-emerald-400 font-medium">Revenue Share</span> lease.<br />
                    On the <span className="text-emerald-400 font-medium">POS Integration</span> step, click <span className="text-amber-400 font-medium">Use Dev Sample</span> to auto-fill credentials, then save the lease.
                  </p>
                  <p className="text-xs text-slate-600 pt-1">
                    If you already created a lease without POS details, delete it and re-create — or add the integration from the tenant detail page lease form.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ── Main Terminal ── */
        <div className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full">
          {/* Store switcher bar */}
          <div className="mb-4 flex items-center justify-between">
            <div className="relative">
              <button
                onClick={() => setStoreDropdownOpen(!storeDropdownOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-600 text-sm transition-colors"
              >
                <span className="text-lg">{PROVIDER_ICONS[selectedIntegration.provider]}</span>
                <span>{selectedIntegration.businessName}</span>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </button>
              {storeDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                  {integrations.map(int => (
                    <button
                      key={int.id}
                      onClick={() => handleSelectStore(int)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-800 text-sm transition-colors ${int.id === selectedIntegration.id ? "bg-slate-800 border-l-2 border-emerald-500" : ""}`}
                    >
                      <span className="text-lg">{PROVIDER_ICONS[int.provider]}</span>
                      <div>
                        <div className="font-medium">{int.businessName}</div>
                        <div className="text-xs text-slate-500">
                          {PROVIDER_NAMES[int.provider]} \u00B7 {int.unitNumber}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="text-xs text-slate-500">
              Store ID: <span className="font-mono text-slate-400">{selectedIntegration.storeId}</span>
            </div>
          </div>

          {/* Two-column layout */}
          <div className="grid md:grid-cols-5 gap-4">
            {/* ── LEFT: Sale Entry (3 cols) ── */}
            <div className="md:col-span-3 space-y-4">
              {/* Amount Input */}
              <div className={`rounded-2xl border-2 p-6 transition-all ${saleSuccess ? "border-emerald-500 bg-emerald-950/30" : "border-slate-800 bg-slate-900"}`}>
                {saleSuccess ? (
                  <div className="flex items-center justify-center gap-3 py-4">
                    <CheckCircle2 className="h-10 w-10 text-emerald-400" />
                    <span className="text-2xl font-bold text-emerald-400">Sale Recorded!</span>
                  </div>
                ) : (
                  <>
                    <label className="text-xs text-slate-500 uppercase tracking-wide font-medium">Sale Amount</label>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-3xl text-slate-500">{"\u20B9"}</span>
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0"
                        className="flex-1 bg-transparent text-5xl font-bold outline-none placeholder-slate-700 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && amount && Number(amount) > 0) {
                            handleCompleteSale()
                          }
                        }}
                      />
                    </div>
                    {discount && Number(discount) > 0 && (
                      <div className="text-sm text-slate-400 mt-1">
                        Net: {formatINR(Number(amount || 0) - Number(discount))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Category Buttons */}
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-2 block">Category</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {products.map(product => (
                    <button
                      key={product.key}
                      onClick={() => setCategory(product.key)}
                      className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all ${
                        category === product.key
                          ? "border-emerald-500 bg-emerald-950/40 text-emerald-300"
                          : "border-slate-800 bg-slate-900 hover:border-slate-600 text-slate-300"
                      }`}
                    >
                      <span className="text-2xl">{product.icon}</span>
                      <span className="text-xs font-medium">{product.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Discount + Payment Row */}
              <div className="grid grid-cols-2 gap-4">
                {/* Discount */}
                <div>
                  <label className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-2 block">Discount</label>
                  <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
                    <Minus className="h-4 w-4 text-slate-500" />
                    <span className="text-slate-500">{"\u20B9"}</span>
                    <input
                      type="number"
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                      placeholder="0"
                      className="flex-1 bg-transparent outline-none text-lg [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                </div>

                {/* Payment Method */}
                <div>
                  <label className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-2 block">Payment</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: "cash", label: "Cash", Icon: Banknote },
                      { key: "card", label: "Card", Icon: CreditCard },
                      { key: "upi", label: "UPI", Icon: Smartphone },
                    ].map(pm => (
                      <button
                        key={pm.key}
                        onClick={() => setPaymentMethod(pm.key)}
                        className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all ${
                          paymentMethod === pm.key
                            ? "border-blue-500 bg-blue-950/40 text-blue-300"
                            : "border-slate-800 bg-slate-900 hover:border-slate-600 text-slate-400"
                        }`}
                      >
                        <pm.Icon className="h-5 w-5" />
                        <span className="text-[10px] font-medium">{pm.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* COMPLETE SALE Button */}
              <button
                onClick={handleCompleteSale}
                disabled={submitting || !amount || Number(amount) <= 0}
                className="w-full py-5 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 active:scale-[0.99]"
              >
                {submitting ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <>
                    <Receipt className="h-6 w-6" />
                    COMPLETE SALE
                    {amount && Number(amount) > 0 && (
                      <span className="ml-2">\u00B7 {formatINR(Number(amount) - Number(discount || 0))}</span>
                    )}
                  </>
                )}
              </button>
            </div>

            {/* ── RIGHT: Summary (2 cols) ── */}
            <div className="md:col-span-2 space-y-4">
              {/* Today's Running Total */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs text-slate-500 uppercase tracking-wide font-medium">Today&apos;s Total</h3>
                  <div className="flex items-center gap-1 text-[10px] text-emerald-400">
                    <TrendingUp className="h-3 w-3" />
                    LIVE
                  </div>
                </div>
                <div className="text-4xl font-bold text-emerald-400">
                  {formatINR(todaySales?.grossSales || 0)}
                </div>
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div>
                    <div className="text-xs text-slate-500">Transactions</div>
                    <div className="text-lg font-semibold flex items-center gap-1">
                      <Hash className="h-3 w-3 text-slate-500" />
                      {todaySales?.transactionCount || 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Avg Txn</div>
                    <div className="text-lg font-semibold">
                      {formatINR(todaySales?.avgTransactionValue || 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Discounts</div>
                    <div className="text-lg font-semibold text-amber-400">
                      {formatINR(todaySales?.discounts || 0)}
                    </div>
                  </div>
                </div>

                {/* Category Breakdown */}
                {todaySales?.categoryBreakdown && Object.keys(todaySales.categoryBreakdown).length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-800">
                    <div className="text-xs text-slate-500 mb-2">Category Split</div>
                    <div className="space-y-2">
                      {Object.entries(todaySales.categoryBreakdown)
                        .sort(([, a], [, b]) => b - a)
                        .map(([cat, val]) => {
                          const pct = todaySales.grossSales > 0 ? (val / todaySales.grossSales) * 100 : 0
                          const label = products.find(p => p.key === cat)?.label || cat
                          return (
                            <div key={cat}>
                              <div className="flex items-center justify-between text-xs mb-0.5">
                                <span className="text-slate-400">{label}</span>
                                <span>{formatINR(val)}</span>
                              </div>
                              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-emerald-500 rounded-full transition-all"
                                  style={{ width: `${Math.min(pct, 100)}%` }}
                                />
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                )}
              </div>

              {/* Last Receipt */}
              {transactions.length > 0 && (
                <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 p-4 font-mono text-xs">
                  <div className="text-center text-slate-500 mb-2">
                    {"\u2500".repeat(20)} RECEIPT {"\u2500".repeat(20)}
                  </div>
                  <div className="text-center font-semibold text-sm mb-1">
                    {selectedIntegration.businessName}
                  </div>
                  <div className="text-center text-slate-500 text-[10px] mb-3">
                    Unit {selectedIntegration.unitNumber} | {PROVIDER_NAMES[selectedIntegration.provider]}
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Item</span>
                      <span>{transactions[0].categoryLabel}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Amount</span>
                      <span>{formatINR(transactions[0].amount)}</span>
                    </div>
                    {transactions[0].discount > 0 && (
                      <div className="flex justify-between text-amber-400">
                        <span>Discount</span>
                        <span>-{formatINR(transactions[0].discount)}</span>
                      </div>
                    )}
                    <div className="border-t border-dashed border-slate-700 my-1" />
                    <div className="flex justify-between font-bold">
                      <span>Total</span>
                      <span className="text-emerald-400">
                        {formatINR(transactions[0].amount - transactions[0].discount)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Payment</span>
                      <span className="uppercase">{transactions[0].paymentMethod}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Time</span>
                      <span>{transactions[0].time}</span>
                    </div>
                  </div>
                  <div className="text-center text-slate-600 mt-3">
                    {"\u2500".repeat(22)} END {"\u2500".repeat(22)}
                  </div>
                </div>
              )}

              {/* Transaction History */}
              {transactions.length > 0 && (
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                  <h3 className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-3">
                    Session History ({transactions.length})
                  </h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {transactions.map(txn => (
                      <div
                        key={txn.id}
                        className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-800/50 text-sm"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center text-xs">
                            {txn.paymentMethod === "cash" ? "\u{1F4B5}" : txn.paymentMethod === "upi" ? "\u{1F4F1}" : "\u{1F4B3}"}
                          </div>
                          <div>
                            <div className="font-medium">{txn.categoryLabel}</div>
                            <div className="text-[10px] text-slate-500">
                              {txn.time} \u00B7 {txn.paymentMethod.toUpperCase()}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-emerald-400">{formatINR(txn.amount)}</div>
                          {txn.discount > 0 && (
                            <div className="text-[10px] text-amber-400">-{formatINR(txn.discount)} disc</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <footer className="border-t border-slate-800 px-6 py-2 text-center text-[10px] text-slate-600">
        POS Terminal Simulator \u00B7 MallOS Demo Environment \u00B7 Not connected to a real payment processor
      </footer>
    </div>
  )
}
