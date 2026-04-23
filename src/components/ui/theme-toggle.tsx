"use client"

/**
 * ThemeToggle — animated sun/moon icon button for the header.
 * Accessible, keyboard-focusable, tooltip on hover.
 */

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "@/components/providers/theme-provider"
import { cn } from "@/lib/utils"

interface ThemeToggleProps {
  className?: string
  /** "icon" = single animated button (default), "segmented" = Light | System | Dark pills */
  variant?: "icon" | "segmented"
}

export function ThemeToggle({ className, variant = "icon" }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme()

  if (variant === "segmented") {
    return (
      <div
        className={cn(
          "flex items-center rounded-lg border bg-muted p-0.5 text-xs gap-0.5",
          className,
        )}
        role="group"
        aria-label="Theme selection"
      >
        {(["light", "system", "dark"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setTheme(mode)}
            aria-pressed={theme === mode}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium capitalize transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              theme === mode
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {mode === "light"  && <Sun  className="h-3 w-3" />}
            {mode === "dark"   && <Moon className="h-3 w-3" />}
            {mode === "system" && <span className="h-3 w-3 text-[10px] font-bold">A</span>}
            {mode}
          </button>
        ))}
      </div>
    )
  }

  // Default: single animated icon button
  const isDark = resolvedTheme === "dark"

  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "group relative flex h-8 w-8 items-center justify-center rounded-md",
        "text-muted-foreground transition-colors duration-200",
        "hover:bg-accent hover:text-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        className,
      )}
    >
      {/* Sun icon — visible in light mode */}
      <Sun
        className={cn(
          "absolute h-4 w-4 transition-all duration-300",
          isDark
            ? "rotate-90 scale-0 opacity-0"
            : "rotate-0 scale-100 opacity-100",
        )}
        aria-hidden
      />
      {/* Moon icon — visible in dark mode */}
      <Moon
        className={cn(
          "absolute h-4 w-4 transition-all duration-300",
          isDark
            ? "rotate-0 scale-100 opacity-100"
            : "-rotate-90 scale-0 opacity-0",
        )}
        aria-hidden
      />
      <span className="sr-only">
        {isDark ? "Switch to light mode" : "Switch to dark mode"}
      </span>
    </button>
  )
}
