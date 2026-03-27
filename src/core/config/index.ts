import z from "zod"

/**
 * Environment Variables Schema
 * Validates and types all environment variables used in the application.
 * Fails fast at startup if required variables are missing or invalid.
 */
const envSchema = z.object({
  // Application
  NEXT_PUBLIC_APP_URL: z.string().url("NEXT_PUBLIC_APP_URL must be a valid URL"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Database
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid PostgreSQL connection URL"),

  // Cache
  REDIS_URL: z.string().url("REDIS_URL must be a valid Redis connection URL"),

  // Authentication
  NEXTAUTH_SECRET: z.string().min(32, "NEXTAUTH_SECRET must be at least 32 characters"),
  NEXTAUTH_URL: z.string().url("NEXTAUTH_URL must be a valid URL").optional(),

  // AI & Agents
  ANTHROPIC_API_KEY: z.string().optional(),

  // Email (optional for production)
  RESEND_API_KEY: z.string().optional(),

  // Feature Flags
  ENABLE_AGENTS: z.enum(["true", "false"]).default("true").transform(v => v === "true"),
  ENABLE_POS_INTEGRATION: z.enum(["true", "false"]).default("true").transform(v => v === "true"),
  
  // Dev-mode bypass
  DEV_AUTH_BYPASS: z.string().optional().default("false"),
  CI: z.string().optional().default("false"),
})

type EnvSchema = z.infer<typeof envSchema>

/**
 * Parse and validate environment variables
 */
const parsedEnv = envSchema.safeParse(process.env)

if (!parsedEnv.success) {
  const fieldErrors = parsedEnv.error.flatten().fieldErrors
  console.error("❌ Invalid environment variables:")
  Object.entries(fieldErrors).forEach(([field, errors]) => {
    console.error(`   ${field}: ${errors?.join(", ")}`)
  })
  throw new Error("Invalid environment variables. Please check your .env.local file.")
}

const env = parsedEnv.data

/**
 * Centralized Application Configuration
 * Provides type-safe access to all configuration values throughout the application.
 */
export const appConfig = {
  // Application
  appUrl: env.NEXT_PUBLIC_APP_URL,
  nodeEnv: env.NODE_ENV,
  isDevelopment: env.NODE_ENV === "development",
  isProduction: env.NODE_ENV === "production",

  // Database
  database: {
    url: env.DATABASE_URL,
  },

  // Cache
  cache: {
    redisUrl: env.REDIS_URL,
    ttl: {
      short: 60, // 1 minute
      medium: 300, // 5 minutes
      long: 3600, // 1 hour
      veryLong: 86400, // 24 hours
    },
  },

  // Authentication
  auth: {
    nextAuthSecret: env.NEXTAUTH_SECRET,
    nextAuthUrl: env.NEXTAUTH_URL || env.NEXT_PUBLIC_APP_URL,
  },

  // AI & Agents
  anthropic: {
    apiKey: env.ANTHROPIC_API_KEY,
    isConfigured: !!env.ANTHROPIC_API_KEY && env.ANTHROPIC_API_KEY.startsWith("sk-ant-"),
    model: "claude-sonnet-4-5-20250929",
  },

  // Email
  email: {
    resendApiKey: env.RESEND_API_KEY,
    isConfigured: !!env.RESEND_API_KEY,
  },

  // Feature Flags
  features: {
    enableAgents: env.ENABLE_AGENTS,
    enablePosIntegration: env.ENABLE_POS_INTEGRATION,
  },
} as const

/**
 * Type-safe environment variable access for Node.js
 */
declare global {
  namespace NodeJS {
    interface ProcessEnv extends EnvSchema {}
  }
}

export type AppConfig = typeof appConfig
