import { z } from "zod"

export const equipmentSchema = z.object({
  name: z
    .string()
    .min(2, "Equipment name must be at least 2 characters")
    .max(200, "Equipment name must be less than 200 characters")
    .trim(),
  type: z.enum(["hvac", "elevator", "escalator", "generator", "fire_safety", "electrical", "plumbing", "other"], {
    errorMap: () => ({ message: "Please select a valid equipment type" }),
  }),
  location: z
    .string()
    .max(200, "Location must be less than 200 characters")
    .optional(),
  manufacturer: z
    .string()
    .max(100, "Manufacturer must be less than 100 characters")
    .optional(),
  model: z
    .string()
    .max(100, "Model must be less than 100 characters")
    .optional(),
  serialNumber: z
    .string()
    .max(50, "Serial number must be less than 50 characters")
    .optional(),
  installationDate: z.string().optional(),
  warrantyExpiry: z.string().optional(),
  lastMaintenanceDate: z.string().optional(),
  nextMaintenanceDate: z
    .string()
    .refine(
      (val) => !val || new Date(val) >= new Date(),
      "Next maintenance date should be in the future"
    )
    .optional(),
  maintenanceInterval: z
    .string()
    .refine(
      (val) => !val || val.length === 0 || (parseInt(val) > 0 && parseInt(val) <= 365),
      "Maintenance interval must be between 1 and 365 days"
    )
    .optional(),
  healthScore: z
    .string()
    .refine(
      (val) => !val || val.length === 0 || (parseFloat(val) >= 0 && parseFloat(val) <= 100),
      "Health score must be between 0 and 100"
    )
    .optional(),
  status: z.enum(["operational", "maintenance", "repair", "offline"]).optional(),
  propertyId: z.string(),
})

export type EquipmentFormData = z.infer<typeof equipmentSchema>

export const equipmentUpdateSchema = equipmentSchema.partial()

export type EquipmentUpdateFormData = z.infer<typeof equipmentUpdateSchema>

