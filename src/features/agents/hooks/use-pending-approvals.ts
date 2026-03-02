/**
 * Hook: usePendingApprovals
 * Fetches the count of pending agent approvals.
 * Used in the Header component to display pending approvals badge.
 */

import { useEffect, useState } from "react"

interface UsePendingApprovalsReturn {
  pendingApprovals: number
  isLoadingApprovals: boolean
  error: string | null
}

export function usePendingApprovals(): UsePendingApprovalsReturn {
  const [pendingApprovals, setPendingApprovals] = useState(0)
  const [isLoadingApprovals, setIsLoadingApprovals] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchApprovals = async () => {
      setIsLoadingApprovals(true)
      setError(null)

      try {
        const response = await fetch("/api/v1/agents/actions?status=pending")
        if (!response.ok) {
          throw new Error("Failed to fetch pending approvals")
        }

        const data = await response.json()
        setPendingApprovals(data.data?.length || 0)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error"
        setError(errorMessage)
        console.error("Error fetching pending approvals:", err)
      } finally {
        setIsLoadingApprovals(false)
      }
    }

    fetchApprovals()

    // Optionally, set up polling to refresh pending approvals periodically
    const interval = setInterval(fetchApprovals, 30000) // Refresh every 30 seconds

    return () => clearInterval(interval)
  }, [])

  return {
    pendingApprovals,
    isLoadingApprovals,
    error,
  }
}
