import { z } from "zod"

// Indian PIN code validation (6 digits)
const pincodeRegex = /^[1-9][0-9]{5}$/

export const propertySchema = z.object({
  // Basic Information
  name: z
    .string()
    .min(2, "Property name must be at least 2 characters")
    .max(255, "Property name must be less than 255 characters")
    .trim(),
  code: z
    .string()
    .min(2, "Property code must be at least 2 characters")
    .max(50, "Property code must be less than 50 characters")
    .regex(/^[A-Z0-9-]+$/i, "Property code can only contain letters, numbers, and hyphens")
    .trim(),
  type: z.enum(["mall", "retail_complex", "office", "mixed_use"], {
    errorMap: () => ({ message: "Please select a valid property type" }),
  }),
  status: z.enum(["active", "under_construction", "closed"]).default("active"),
  
  // Location Information
  address: z
    .string()
    .max(500, "Address must be less than 500 characters")
    .optional()
    .or(z.literal("")),
  city: z
    .string()
    .min(2, "City must be at least 2 characters")
    .max(100, "City must be less than 100 characters"),
  state: z
    .string()
    .min(2, "State must be at least 2 characters")
    .max(100, "State must be less than 100 characters"),
  country: z.string().default("India"),
  pincode: z
    .string()
    .regex(pincodeRegex, "Please enter a valid 6-digit PIN code")
    .optional()
    .or(z.literal("")),
  
  // Area Information
  totalAreaSqft: z
    .string()
    .refine(
      (val) => !val || (parseFloat(val) > 0 && parseFloat(val) <= 50000000),
      "Total area must be between 1 and 5,00,00,000 sq ft"
    )
    .optional()
    .or(z.literal("")),
  leasableAreaSqft: z
    .string()
    .refine(
      (val) => !val || (parseFloat(val) > 0 && parseFloat(val) <= 50000000),
      "Leasable area must be between 1 and 5,00,00,000 sq ft"
    )
    .optional()
    .or(z.literal("")),
  floors: z
    .string()
    .refine(
      (val) => !val || (parseInt(val) > 0 && parseInt(val) <= 200),
      "Floors must be between 1 and 200"
    )
    .optional()
    .or(z.literal("")),
  
  // Operating Information
  operatingHoursStart: z.string().optional().or(z.literal("")),
  operatingHoursEnd: z.string().optional().or(z.literal("")),
  operatingDays: z.array(z.string()).optional().default([]),
  
  // Amenities
  amenities: z.array(z.string()).optional().default([]),
  
  // Contact Information
  managerName: z.string().max(100, "Manager name must be less than 100 characters").optional().or(z.literal("")),
  managerPhone: z.string().max(15, "Phone must be less than 15 characters").optional().or(z.literal("")),
  managerEmail: z.string().email("Please enter a valid email").optional().or(z.literal("")),
  
  // Organization
  organizationId: z.string().optional(),
})

export const propertyUpdateSchema = propertySchema.partial().extend({
  name: z.string().min(2, "Property name must be at least 2 characters").optional(),
  code: z.string().min(2, "Property code must be at least 2 characters").optional(),
  type: z.enum(["mall", "retail_complex", "office", "mixed_use"]).optional(),
})

export type PropertyFormData = z.infer<typeof propertySchema>
export type PropertyUpdateFormData = z.infer<typeof propertyUpdateSchema>

// Common amenities for quick selection
export const COMMON_AMENITIES = [
  "Parking",
  "Food Court",
  "Kids Play Area",
  "ATM",
  "Escalators",
  "Elevators",
  "Wheelchair Access",
  "Wi-Fi",
  "Customer Service",
  "Restrooms",
  "Prayer Room",
  "First Aid",
  "Security",
  "CCTV",
  "Fire Safety",
  "Power Backup",
  "Air Conditioning",
  "EV Charging",
] as const

// Indian states for dropdown
export const INDIAN_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
] as const

// Days of week for operating hours
export const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const
