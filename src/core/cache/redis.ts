/**
 * Redis Caching Utility using Upstash Redis (Serverless)
 * 
 * Features:
 * - Session caching
 * - Dashboard metrics caching
 * - Agent state caching
 * - Property/tenant data caching
 * - Rate limiting support
 * 
 * Note: All functions gracefully degrade when Redis is not configured
 */

import { Redis } from '@upstash/redis'

// Check if Redis is properly configured
const isRedisConfigured = (): boolean => {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  return !!(url && token && url.startsWith('https://') && token.length > 10)
}

// Initialize Redis client only if properly configured
let redis: Redis | null = null
let redisInitialized = false

function getRedisClient(): Redis | null {
  if (!redisInitialized) {
    redisInitialized = true
    try {
      if (isRedisConfigured()) {
        redis = new Redis({
          url: process.env.UPSTASH_REDIS_REST_URL!,
          token: process.env.UPSTASH_REDIS_REST_TOKEN!,
        })
      }
    } catch (error) {
      console.error('Failed to initialize Redis client:', error)
      redis = null
    }
  }
  return redis
}

// Cache key prefixes for organization
export const CACHE_KEYS = {
  // Dashboard metrics
  DASHBOARD_METRICS: (propertyId: string) => `dashboard:metrics:${propertyId}`,
  DASHBOARD_SUMMARY: (orgId: string) => `dashboard:summary:${orgId}`,
  
  // Agent state and activities
  AGENT_STATE: (agentId: string) => `agent:state:${agentId}`,
  AGENT_ACTIVITIES: (propertyId: string) => `agent:activities:${propertyId}`,
  AGENT_DECISIONS: (agentId: string) => `agent:decisions:${agentId}`,
  
  // Property data
  PROPERTY: (propertyId: string) => `property:${propertyId}`,
  PROPERTY_LIST: (orgId: string) => `properties:list:${orgId}`,
  PROPERTY_METRICS: (propertyId: string) => `property:metrics:${propertyId}`,
  
  // Tenant data
  TENANT: (tenantId: string) => `tenant:${tenantId}`,
  TENANT_LIST: (propertyId: string) => `tenants:list:${propertyId}`,
  
  // Financial data
  INVOICE_LIST: (propertyId: string) => `invoices:list:${propertyId}`,
  PAYMENT_LIST: (propertyId: string) => `payments:list:${propertyId}`,
  FINANCIAL_SUMMARY: (propertyId: string) => `financial:summary:${propertyId}`,
  
  // Work orders
  WORK_ORDER_LIST: (propertyId: string) => `workorders:list:${propertyId}`,
  
  // Session data
  USER_SESSION: (userId: string) => `session:user:${userId}`,
  
  // Rate limiting
  RATE_LIMIT: (identifier: string) => `ratelimit:${identifier}`,
  
  // Analytics
  ANALYTICS: (propertyId: string, period: string) => `analytics:${propertyId}:${period}`,
} as const

// Default TTL values (in seconds)
export const CACHE_TTL = {
  SHORT: 60,           // 1 minute - for real-time data
  MEDIUM: 300,         // 5 minutes - for dashboard metrics
  LONG: 3600,          // 1 hour - for less frequently changing data
  DAY: 86400,          // 24 hours - for historical data
  SESSION: 7200,       // 2 hours - for user sessions
  ANALYTICS: 1800,     // 30 minutes - for analytics data
} as const

/**
 * Get cached data or fetch from source
 * @param key Cache key
 * @param fetcher Function to fetch data if cache miss
 * @param ttl Time to live in seconds
 */
export async function getCachedOrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = CACHE_TTL.MEDIUM
): Promise<T> {
  const client = getRedisClient()
  
  // If Redis is not configured, just fetch directly
  if (!client) {
    return fetcher()
  }
  
  try {
    // Try cache first
    const cached = await client.get<T>(key)
    if (cached !== null) {
      return cached
    }

    // Fetch from source
    const data = await fetcher()
    
    // Cache the result
    if (data !== null && data !== undefined) {
      await client.setex(key, ttl, JSON.stringify(data))
    }

    return data
  } catch (error) {
    console.error('Redis cache error:', error)
    // Fallback to direct fetch on cache error
    return fetcher()
  }
}

/**
 * Set cache value with TTL
 */
export async function setCache<T>(
  key: string,
  value: T,
  ttl: number = CACHE_TTL.MEDIUM
): Promise<void> {
  const client = getRedisClient()
  if (!client) return
  
  try {
    await client.setex(key, ttl, JSON.stringify(value))
  } catch (error) {
    console.error('Redis set error:', error)
  }
}

/**
 * Get cache value
 */
export async function getCache<T>(key: string): Promise<T | null> {
  const client = getRedisClient()
  if (!client) return null
  
  try {
    return await client.get<T>(key)
  } catch (error) {
    console.error('Redis get error:', error)
    return null
  }
}

/**
 * Delete cache key
 */
export async function deleteCache(key: string): Promise<void> {
  const client = getRedisClient()
  if (!client) return
  
  try {
    await client.del(key)
  } catch (error) {
    console.error('Redis delete error:', error)
  }
}

/**
 * Delete multiple cache keys matching a pattern
 * Note: Pattern-based deletion should be used sparingly
 */
export async function deleteCachePattern(pattern: string): Promise<void> {
  const client = getRedisClient()
  if (!client) return
  
  try {
    const keys = await client.keys(pattern)
    if (keys.length > 0) {
      await client.del(...keys)
    }
  } catch (error) {
    console.error('Redis pattern delete error:', error)
  }
}

/**
 * Invalidate cache for a specific entity
 */
export async function invalidateEntityCache(
  entityType: 'property' | 'tenant' | 'agent' | 'invoice' | 'workorder',
  entityId: string,
  parentId?: string
): Promise<void> {
  const client = getRedisClient()
  if (!client) return
  
  const keysToDelete: string[] = []
  
  switch (entityType) {
    case 'property':
      keysToDelete.push(
        CACHE_KEYS.PROPERTY(entityId),
        CACHE_KEYS.PROPERTY_METRICS(entityId),
        CACHE_KEYS.DASHBOARD_METRICS(entityId),
        CACHE_KEYS.TENANT_LIST(entityId),
        CACHE_KEYS.INVOICE_LIST(entityId),
        CACHE_KEYS.WORK_ORDER_LIST(entityId)
      )
      if (parentId) {
        keysToDelete.push(CACHE_KEYS.PROPERTY_LIST(parentId))
      }
      break
    
    case 'tenant':
      keysToDelete.push(CACHE_KEYS.TENANT(entityId))
      if (parentId) {
        keysToDelete.push(CACHE_KEYS.TENANT_LIST(parentId))
      }
      break
    
    case 'agent':
      keysToDelete.push(
        CACHE_KEYS.AGENT_STATE(entityId),
        CACHE_KEYS.AGENT_DECISIONS(entityId)
      )
      if (parentId) {
        keysToDelete.push(CACHE_KEYS.AGENT_ACTIVITIES(parentId))
      }
      break
    
    case 'invoice':
      if (parentId) {
        keysToDelete.push(
          CACHE_KEYS.INVOICE_LIST(parentId),
          CACHE_KEYS.FINANCIAL_SUMMARY(parentId)
        )
      }
      break
    
    case 'workorder':
      if (parentId) {
        keysToDelete.push(CACHE_KEYS.WORK_ORDER_LIST(parentId))
      }
      break
  }
  
  if (keysToDelete.length > 0) {
    try {
      await client.del(...keysToDelete)
    } catch (error) {
      console.error('Cache invalidation error:', error)
    }
  }
}

/**
 * Rate limiting implementation
 * @param identifier Unique identifier (e.g., IP address, user ID)
 * @param limit Maximum requests allowed
 * @param window Time window in seconds
 * @returns Object with allowed status and remaining requests
 */
export async function checkRateLimit(
  identifier: string,
  limit: number = 100,
  window: number = 60
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const client = getRedisClient()
  const now = Math.floor(Date.now() / 1000)
  
  // If Redis is not configured, allow all requests
  if (!client) {
    return { allowed: true, remaining: limit, resetAt: now + window }
  }
  
  const key = CACHE_KEYS.RATE_LIMIT(identifier)
  const windowStart = now - window
  
  try {
    // Use sorted set for sliding window rate limiting
    const pipeline = client.pipeline()
    
    // Remove old entries
    pipeline.zremrangebyscore(key, 0, windowStart)
    
    // Count current entries
    pipeline.zcard(key)
    
    // Add current request
    pipeline.zadd(key, { score: now, member: `${now}:${Math.random()}` })
    
    // Set expiry
    pipeline.expire(key, window)
    
    const results = await pipeline.exec()
    const currentCount = (results[1] as number) || 0
    
    const allowed = currentCount < limit
    const remaining = Math.max(0, limit - currentCount - 1)
    const resetAt = now + window
    
    return { allowed, remaining, resetAt }
  } catch (error) {
    console.error('Rate limit error:', error)
    // Allow request on error (fail open)
    return { allowed: true, remaining: limit, resetAt: now + window }
  }
}

/**
 * Store agent state in Redis for quick access
 */
export async function setAgentState(
  agentId: string,
  state: {
    status: 'idle' | 'processing' | 'waiting_approval' | 'error'
    currentTask?: string
    lastActivity?: Date
    metrics?: Record<string, number>
  }
): Promise<void> {
  const key = CACHE_KEYS.AGENT_STATE(agentId)
  await setCache(key, state, CACHE_TTL.MEDIUM)
}

/**
 * Get agent state from Redis
 */
export async function getAgentState(agentId: string): Promise<{
  status: 'idle' | 'processing' | 'waiting_approval' | 'error'
  currentTask?: string
  lastActivity?: Date
  metrics?: Record<string, number>
} | null> {
  return getCache(CACHE_KEYS.AGENT_STATE(agentId))
}

/**
 * Push activity to agent activity list
 */
export async function pushAgentActivity(
  propertyId: string,
  activity: {
    id: string
    agentId: string
    agentName: string
    actionType: string
    description: string
    timestamp: Date
    status: string
  }
): Promise<void> {
  const client = getRedisClient()
  if (!client) return
  
  const key = CACHE_KEYS.AGENT_ACTIVITIES(propertyId)
  try {
    // Push to beginning of list
    await client.lpush(key, JSON.stringify(activity))
    // Trim to keep only last 100 activities
    await client.ltrim(key, 0, 99)
    // Set expiry
    await client.expire(key, CACHE_TTL.LONG)
  } catch (error) {
    console.error('Push agent activity error:', error)
  }
}

/**
 * Get recent agent activities
 */
export async function getAgentActivities(
  propertyId: string,
  limit: number = 50
): Promise<unknown[]> {
  const client = getRedisClient()
  if (!client) return []
  
  const key = CACHE_KEYS.AGENT_ACTIVITIES(propertyId)
  try {
    const activities = await client.lrange(key, 0, limit - 1)
    return activities.map(a => typeof a === 'string' ? JSON.parse(a) : a)
  } catch (error) {
    console.error('Get agent activities error:', error)
    return []
  }
}

/**
 * Session management - store user session data
 */
export async function setUserSession(
  userId: string,
  sessionData: {
    lastActive: Date
    currentPropertyId?: string
    preferences?: Record<string, unknown>
  }
): Promise<void> {
  const key = CACHE_KEYS.USER_SESSION(userId)
  await setCache(key, sessionData, CACHE_TTL.SESSION)
}

/**
 * Get user session data
 */
export async function getUserSession(userId: string): Promise<{
  lastActive: Date
  currentPropertyId?: string
  preferences?: Record<string, unknown>
} | null> {
  return getCache(CACHE_KEYS.USER_SESSION(userId))
}

/**
 * Health check for Redis connection
 */
export async function isRedisHealthy(): Promise<boolean> {
  const client = getRedisClient()
  if (!client) return false
  
  try {
    const result = await client.ping()
    return result === 'PONG'
  } catch (error) {
    console.error('Redis health check failed:', error)
    return false
  }
}

/**
 * Check if Redis is available
 */
export function isRedisAvailable(): boolean {
  return getRedisClient() !== null
}

// Export the Redis client getter for direct access when needed
export { getRedisClient as redis }
