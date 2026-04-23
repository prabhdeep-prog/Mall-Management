"use client"

/**
 * Lightweight theme provider — no external dependency.
 * Manages light / dark / system preferences with:
 *   - localStorage persistence  (key: "theme")
 *   - system-preference fallback via matchMedia
 *   - instant class toggle on <html> (no flash)
 *   - smooth 300ms CSS transitions applied via globals.css
 */

import * as React from "react"

type ThemeMode = "light" | "dark" | "system"

interface ThemeContextValue {
  theme: ThemeMode          // stored preference
  resolvedTheme: "light" | "dark"  // actual applied theme
  setTheme: (t: ThemeMode) => void
  toggleTheme: () => void   // quick light ↔ dark toggle
}

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined)

const STORAGE_KEY = "theme"

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function resolveTheme(mode: ThemeMode): "light" | "dark" {
  return mode === "system" ? getSystemTheme() : mode
}

function applyTheme(resolved: "light" | "dark") {
  const root = document.documentElement
  if (resolved === "dark") {
    root.classList.add("dark")
  } else {
    root.classList.remove("dark")
  }
  root.setAttribute("data-theme", resolved)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "system"
    return (localStorage.getItem(STORAGE_KEY) as ThemeMode) || "system"
  })

  const resolvedTheme = resolveTheme(theme)

  const setTheme = React.useCallback((t: ThemeMode) => {
    setThemeState(t)
    localStorage.setItem(STORAGE_KEY, t)
    applyTheme(resolveTheme(t))
  }, [])

  const toggleTheme = React.useCallback(() => {
    const next = resolvedTheme === "dark" ? "light" : "dark"
    setTheme(next)
  }, [resolvedTheme, setTheme])

  // Apply on mount and keep in sync with system changes when mode=system
  React.useEffect(() => {
    applyTheme(resolveTheme(theme))

    if (theme !== "system") return

    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => applyTheme(resolveTheme("system"))
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>")
  return ctx
}
