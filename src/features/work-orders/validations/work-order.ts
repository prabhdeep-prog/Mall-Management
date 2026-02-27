import { z } from "zod"

export const workOrderSchema = z.object({
  title: z
    .string()
    .min(5, "Title must be at least 5 characters")
    .max(200, "Title must be less than 200 characters")
    .trim(),
  description: z
    .string()
    .max(2000, "Description must be less than 2000 characters")
    .optional(),
  category: z.enum(["hvac", "plumbing", "electrical", "structural", "cleaning", "security", "general"], {
    errorMap: () => ({ message: "Please select a valid category" }),
  }),
  priority: z.enum(["low", "medium", "high", "urgent"], {
    errorMap: () => ({ message: "Please select a valid priority" }),
  }),
  location: z
    .string()
    .max(200, "Location must be less than 200 characters")
    .optional(),
  dueDate: z
    .string()
    .refine(
      (val) => !val || new Date(val) >= new Date(),
      "Due date must be in the future"
    )
    .optional(),
  assignedTo: z.string().optional(),
  tenantId: z.string().optional(),
  propertyId: z.string(),
  estimatedCost: z
    .string()
    .refine(
      (val) => !val || val.length === 0 || (parseFloat(val) >= 0 && parseFloat(val) <= 100000000),
      "Estimated cost must be between 0 and 10,00,00,000"
    )
    .optional(),
})

export type WorkOrderFormData = z.infer<typeof workOrderSchema>

export const workOrderUpdateSchema = workOrderSchema.partial()

export type WorkOrderUpdateFormData = z.infer<typeof workOrderUpdateSchema>

