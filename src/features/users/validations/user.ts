import { z } from "zod"

// Indian phone number validation (10 digits, optionally with country code)
const phoneRegex = /^(\+91[-\s]?)?[6-9]\d{9}$/

export const userSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be less than 100 characters")
    .trim(),
  email: z
    .string()
    .email("Please enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Password must contain at least one uppercase letter, one lowercase letter, and one number"
    )
    .optional()
    .or(z.literal("")),
  role: z.enum(["super_admin", "organization_admin", "property_manager", "maintenance_manager", "accountant", "viewer"], {
    errorMap: () => ({ message: "Please select a valid role" }),
  }),
  phone: z
    .string()
    .refine(
      (val) => !val || val.length === 0 || phoneRegex.test(val),
      "Please enter a valid 10-digit Indian phone number"
    )
    .optional(),
  department: z
    .string()
    .max(100, "Department must be less than 100 characters")
    .optional(),
  title: z
    .string()
    .max(100, "Title must be less than 100 characters")
    .optional(),
  status: z.enum(["active", "inactive", "suspended"]).optional(),
})

export type UserFormData = z.infer<typeof userSchema>

// Schema for updating user (password is optional, email may or may not be changeable)
export const userUpdateSchema = userSchema.partial().extend({
  email: z.string().email("Please enter a valid email address").optional(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Password must contain at least one uppercase letter, one lowercase letter, and one number"
    )
    .optional()
    .or(z.literal("")),
})

export type UserUpdateFormData = z.infer<typeof userUpdateSchema>

