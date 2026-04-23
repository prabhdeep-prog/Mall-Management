import "next-auth"
import type { UserRole } from "@/lib/auth"

declare module "next-auth" {
  interface User {
    id: string
    email: string
    name: string
    role: UserRole
    organizationId: string
    /** Populated only for tenant portal users */
    tenantId?: string
  }

  interface Session {
    user: {
      id: string
      email: string
      name: string
      role: UserRole
      organizationId: string
      /** Populated only for tenant portal users */
      tenantId?: string
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    role: UserRole
    organizationId: string
    /** Populated only for tenant portal users */
    tenantId?: string
  }
}
