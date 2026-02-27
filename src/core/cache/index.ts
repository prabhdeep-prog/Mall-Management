/**
 * Cache module exports
 */

export {
  // Core functions
  getCachedOrFetch,
  setCache,
  getCache,
  deleteCache,
  deleteCachePattern,
  invalidateEntityCache,
  
  // Rate limiting
  checkRateLimit,
  
  // Agent state management
  setAgentState,
  getAgentState,
  pushAgentActivity,
  getAgentActivities,
  
  // Session management
  setUserSession,
  getUserSession,
  
  // Health check
  isRedisHealthy,
  isRedisAvailable,
  
  // Constants
  CACHE_KEYS,
  CACHE_TTL,
  
  // Redis client getter (for advanced use)
  redis,
} from './redis'

