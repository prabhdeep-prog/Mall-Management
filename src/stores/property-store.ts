import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface Property {
  id: string
  name: string
  code: string
  city: string
  type: string
  status: string | null
}

// How long before cached properties are considered stale (5 minutes)
const STALE_TIME = 5 * 60 * 1000

interface PropertyState {
  properties: Property[]
  selectedProperty: Property | null
  isLoading: boolean
  error: string | null
  lastFetchedAt: number | null

  // Actions
  setProperties: (properties: Property[]) => void
  setSelectedProperty: (property: Property | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  fetchProperties: (force?: boolean) => Promise<void>
}

export const usePropertyStore = create<PropertyState>()(
  persist(
    (set, get) => ({
      properties: [],
      selectedProperty: null,
      isLoading: false,
      error: null,
      lastFetchedAt: null,

      setProperties: (properties) => set({ properties }),

      setSelectedProperty: (property) => set({ selectedProperty: property }),

      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error }),

      fetchProperties: async (force = false) => {
        const state = get()

        // Skip fetch if data is fresh and not forced
        if (
          !force &&
          state.properties.length > 0 &&
          state.lastFetchedAt &&
          Date.now() - state.lastFetchedAt < STALE_TIME
        ) {
          return
        }

        // Prevent concurrent fetches
        if (state.isLoading) return

        set({ isLoading: true, error: null })
        try {
          const response = await fetch("/api/properties")
          if (!response.ok) {
            throw new Error("Failed to fetch properties")
          }
          const data = await response.json()
          const properties = data.data || data || []

          set({ properties, isLoading: false, lastFetchedAt: Date.now() })

          // Auto-select first property if none selected
          const currentSelected = get().selectedProperty
          if (!currentSelected && properties.length > 0) {
            set({ selectedProperty: properties[0] })
          }
          // Update selected property with fresh data
          else if (currentSelected) {
            const updated = properties.find((p: Property) => p.id === currentSelected.id)
            if (updated) {
              set({ selectedProperty: updated })
            } else if (properties.length > 0) {
              set({ selectedProperty: properties[0] })
            }
          }
        } catch (error) {
          console.error("Error fetching properties:", error)
          set({
            error: error instanceof Error ? error.message : "Failed to fetch properties",
            isLoading: false
          })
        }
      },
    }),
    {
      name: "property-store",
      partialize: (state) => ({
        selectedProperty: state.selectedProperty
      }),
    }
  )
)

