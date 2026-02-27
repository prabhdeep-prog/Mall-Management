import { z } from "zod"

// Indian phone number validation (10 digits, optionally with country code)
const phoneRegex = /^(\+91[-\s]?)?[6-9]\d{9}$/

// GSTIN validation (15 alphanumeric characters)
const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/

// PAN validation
const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/

export const vendorSchema = z.object({
  name: z
    .string()
    .min(2, "Vendor name must be at least 2 characters")
    .max(200, "Vendor name must be less than 200 characters")
    .trim(),
  type: z.enum(["maintenance", "security", "cleaning", "electrical", "plumbing", "hvac", "landscaping", "other"], {
    errorMap: () => ({ message: "Please select a valid vendor type" }),
  }),
  contactPerson: z
    .string()
    .max(100, "Contact person name must be less than 100 characters")
    .optional(),
  email: z
    .string()
    .email("Please enter a valid email address")
    .optional()
    .or(z.literal("")),
  phone: z
    .string()
    .refine(
      (val) => !val || val.length === 0 || phoneRegex.test(val),
      "Please enter a valid 10-digit Indian phone number"
    )
    .optional(),
  address: z
    .string()
    .max(500, "Address must be less than 500 characters")
    .optional(),
  gstin: z
    .string()
    .refine(
      (val) => !val || val.length === 0 || gstinRegex.test(val.toUpperCase()),
      "Please enter a valid 15-character GSTIN"
    )
    .optional(),
  pan: z
    .string()
    .refine(
      (val) => !val || val.length === 0 || panRegex.test(val.toUpperCase()),
      "Please enter a valid 10-character PAN"
    )
    .optional(),
  bankAccountNumber: z
    .string()
    .max(20, "Bank account number must be less than 20 characters")
    .optional(),
  ifscCode: z
    .string()
    .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Please enter a valid 11-character IFSC code")
    .optional()
    .or(z.literal("")),
  rating: z
    .string()
    .refine(
      (val) => !val || val.length === 0 || (parseFloat(val) >= 0 && parseFloat(val) <= 5),
      "Rating must be between 0 and 5"
    )
    .optional(),
  status: z.enum(["active", "inactive", "suspended"]).optional(),
})

export type VendorFormData = z.infer<typeof vendorSchema>

export const vendorUpdateSchema = vendorSchema.partial()

export type VendorUpdateFormData = z.infer<typeof vendorUpdateSchema>

