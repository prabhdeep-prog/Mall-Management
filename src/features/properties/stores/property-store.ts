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

interface PropertyState {
  properties: Property[]
  selectedProperty: Property | null
  isLoading: boolean
  error: string | null
  
  // Actions
  setProperties: (properties: Property[]) => void
  setSelectedProperty: (property: Property | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  fetchProperties: () => Promise<void>
}

export const usePropertyStore = create<PropertyState>()(
  persist(
    (set, get) => ({
      properties: [],
      selectedProperty: null,
      isLoading: false,
      error: null,

      setProperties: (properties) => set({ properties }),
      
      setSelectedProperty: (property) => set({ selectedProperty: property }),
      
      setLoading: (isLoading) => set({ isLoading }),
      
      setError: (error) => set({ error }),

      fetchProperties: async () => {
        set({ isLoading: true, error: null })
        try {
          const response = await fetch("/api/properties?refresh=true")
          if (!response.ok) {
            throw new Error("Failed to fetch properties")
          }
          const data = await response.json()
          const properties = data.data || data || []
          
          set({ properties, isLoading: false })
          
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

