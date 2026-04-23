"use client"

import { useEffect, useState, useCallback, useRef } from "react"

interface UsePosLiveCountOptions {
  tenantId?: string
  enabled?: boolean
}

export function usePosLiveCount(options: UsePosLiveCountOptions = {}) {
  const { tenantId, enabled = true } = options
  const [count, setCount] = useState(0)
  const [isConnected, setIsConnected] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttempts = useRef(0)

  const connect = useCallback(() => {
    if (!enabled || !tenantId || eventSourceRef.current) return

    const url = `/api/events/pos-live?tenantId=${tenantId}`
    const es = new EventSource(url)
    eventSourceRef.current = es

    es.addEventListener("connected", () => {
      setIsConnected(true)
      reconnectAttempts.current = 0
    })

    es.addEventListener("count", (event) => {
      try {
        const data = JSON.parse(event.data)
        setCount(data.count)
      } catch { /* ignore parse errors */ }
    })

    es.addEventListener("heartbeat", () => {})

    es.onerror = () => {
      setIsConnected(false)
      es.close()
      eventSourceRef.current = null

      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30_000)
      reconnectAttempts.current++
      reconnectTimeoutRef.current = setTimeout(connect, delay)
    }
  }, [enabled, tenantId])

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    setIsConnected(false)
    setCount(0)
  }, [])

  useEffect(() => {
    if (enabled && tenantId) {
      connect()
    } else {
      disconnect()
    }
    return disconnect
  }, [enabled, tenantId, connect, disconnect])

  return { count, isConnected }
}
