import { z } from "zod"

// Indian phone number validation (10 digits, optionally with country code)
const phoneRegex = /^(\+91[-\s]?)?[6-9]\d{9}$/

// GSTIN validation (15 alphanumeric characters)
const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/

// PAN validation (10 alphanumeric characters)
const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/

export const tenantSchema = z.object({
  // Basic Business Information
  businessName: z
    .string()
    .min(2, "Business name must be at least 2 characters")
    .max(100, "Business name must be less than 100 characters")
    .trim(),
  legalEntityName: z
    .string()
    .max(150, "Legal entity name must be less than 150 characters")
    .optional()
    .or(z.literal("")),
  brandName: z
    .string()
    .max(100, "Brand name must be less than 100 characters")
    .optional()
    .or(z.literal("")),
  category: z.enum(["fashion", "food_beverage", "electronics", "entertainment", "services", "health_beauty", "home_lifestyle", "jewelry", "sports", "books_stationery"], {
    errorMap: () => ({ message: "Please select a valid category" }),
  }).optional(),
  subcategory: z.string().max(50, "Subcategory must be less than 50 characters").optional().or(z.literal("")),
  businessType: z.enum(["sole_proprietorship", "partnership", "llp", "pvt_ltd", "public_ltd", "opc"], {
    errorMap: () => ({ message: "Please select a valid business type" }),
  }).optional(),

  // Primary Contact Information
  contactPerson: z
    .string()
    .max(100, "Contact person name must be less than 100 characters")
    .optional()
    .or(z.literal("")),
  designation: z
    .string()
    .max(50, "Designation must be less than 50 characters")
    .optional()
    .or(z.literal("")),
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
    .optional()
    .or(z.literal("")),
  alternatePhone: z
    .string()
    .refine(
      (val) => !val || val.length === 0 || phoneRegex.test(val),
      "Please enter a valid 10-digit Indian phone number"
    )
    .optional()
    .or(z.literal("")),

  // Secondary Contact / Authorized Signatory
  authorizedSignatory: z
    .string()
    .max(100, "Authorized signatory name must be less than 100 characters")
    .optional()
    .or(z.literal("")),
  signatoryPhone: z
    .string()
    .refine(
      (val) => !val || val.length === 0 || phoneRegex.test(val),
      "Please enter a valid 10-digit Indian phone number"
    )
    .optional()
    .or(z.literal("")),
  signatoryEmail: z
    .string()
    .email("Please enter a valid email address")
    .optional()
    .or(z.literal("")),

  // Tax & Compliance Information
  gstin: z
    .string()
    .refine(
      (val) => !val || val.length === 0 || gstinRegex.test(val.toUpperCase()),
      "Please enter a valid 15-character GSTIN"
    )
    .optional()
    .or(z.literal("")),
  pan: z
    .string()
    .refine(
      (val) => !val || val.length === 0 || panRegex.test(val.toUpperCase()),
      "Please enter a valid 10-character PAN"
    )
    .optional()
    .or(z.literal("")),
  tan: z
    .string()
    .max(10, "TAN must be 10 characters")
    .optional()
    .or(z.literal("")),
  cin: z
    .string()
    .max(21, "CIN must be 21 characters")
    .optional()
    .or(z.literal("")),
  fssaiLicense: z
    .string()
    .max(20, "FSSAI License must be less than 20 characters")
    .optional()
    .or(z.literal("")),
  tradeLicense: z
    .string()
    .max(50, "Trade License must be less than 50 characters")
    .optional()
    .or(z.literal("")),
  shopEstablishmentNumber: z
    .string()
    .max(50, "Shop Establishment number must be less than 50 characters")
    .optional()
    .or(z.literal("")),

  // Registered Address
  registeredAddress: z
    .string()
    .max(500, "Address must be less than 500 characters")
    .optional()
    .or(z.literal("")),
  registeredCity: z
    .string()
    .max(100, "City must be less than 100 characters")
    .optional()
    .or(z.literal("")),
  registeredState: z
    .string()
    .max(100, "State must be less than 100 characters")
    .optional()
    .or(z.literal("")),
  registeredPincode: z
    .string()
    .refine(
      (val) => !val || val.length === 0 || /^\d{6}$/.test(val),
      "Please enter a valid 6-digit PIN code"
    )
    .optional()
    .or(z.literal("")),

  // Banking Information
  bankName: z
    .string()
    .max(100, "Bank name must be less than 100 characters")
    .optional()
    .or(z.literal("")),
  bankBranch: z
    .string()
    .max(100, "Branch name must be less than 100 characters")
    .optional()
    .or(z.literal("")),
  accountNumber: z
    .string()
    .max(20, "Account number must be less than 20 characters")
    .optional()
    .or(z.literal("")),
  ifscCode: z
    .string()
    .refine(
      (val) => !val || val.length === 0 || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(val.toUpperCase()),
      "Please enter a valid 11-character IFSC code"
    )
    .optional()
    .or(z.literal("")),
  accountHolderName: z
    .string()
    .max(100, "Account holder name must be less than 100 characters")
    .optional()
    .or(z.literal("")),

  // Property & Status
  propertyId: z.string().uuid("Property ID must be a valid UUID").optional().or(z.literal("")),
  status: z.enum(["active", "inactive", "suspended", "onboarding"]).default("onboarding").optional(),

  // Emergency Contact
  emergencyContactName: z
    .string()
    .max(100, "Emergency contact name must be less than 100 characters")
    .optional()
    .or(z.literal("")),
  emergencyContactPhone: z
    .string()
    .refine(
      (val) => !val || val.length === 0 || phoneRegex.test(val),
      "Please enter a valid 10-digit Indian phone number"
    )
    .optional()
    .or(z.literal("")),

  // Additional metadata
  website: z
    .string()
    .url("Please enter a valid URL")
    .optional()
    .or(z.literal("")),
  socialMedia: z.object({
    facebook: z.string().optional().or(z.literal("")),
    instagram: z.string().optional().or(z.literal("")),
    twitter: z.string().optional().or(z.literal("")),
  }).optional(),
  notes: z
    .string()
    .max(1000, "Notes must be less than 1000 characters")
    .optional()
    .or(z.literal("")),
})

export type TenantFormData = z.infer<typeof tenantSchema>

// Schema for updating tenant (all fields optional)
export const tenantUpdateSchema = tenantSchema.partial()

export type TenantUpdateFormData = z.infer<typeof tenantUpdateSchema>

// Schema for basic tenant creation (minimal fields for quick add)
export const tenantQuickAddSchema = z.object({
  businessName: z
    .string()
    .min(2, "Business name must be at least 2 characters")
    .max(100, "Business name must be less than 100 characters")
    .trim(),
  category: z.enum(["fashion", "food_beverage", "electronics", "entertainment", "services", "health_beauty", "home_lifestyle", "jewelry", "sports", "books_stationery"]).optional(),
  contactPerson: z.string().optional().or(z.literal("")),
  phone: z
    .string()
    .refine(
      (val) => !val || val.length === 0 || phoneRegex.test(val),
      "Please enter a valid 10-digit Indian phone number"
    )
    .optional()
    .or(z.literal("")),
  email: z.string().email("Please enter a valid email address").optional().or(z.literal("")),
  gstin: z
    .string()
    .refine(
      (val) => !val || val.length === 0 || gstinRegex.test(val.toUpperCase()),
      "Please enter a valid 15-character GSTIN"
    )
    .optional()
    .or(z.literal("")),
  propertyId: z.string().uuid("Property ID must be a valid UUID").optional().or(z.literal("")),
})

export type TenantQuickAddFormData = z.infer<typeof tenantQuickAddSchema>

