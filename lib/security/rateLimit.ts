/**
 * HIPAA Compliance: Rate Limiting for Authentication
 * Prevents brute force attacks on login endpoints
 * §164.312(d) - Authentication controls
 */

interface RateLimitEntry {
  count: number;
  firstAttempt: number;
  lockedUntil?: number;
}

// In-memory store for rate limiting
// For production at scale, consider Redis
const rateLimitStore = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  windowMs: number;      // Time window in milliseconds
  maxAttempts: number;   // Max attempts allowed in window
  lockoutMs: number;     // Lockout duration after exceeding attempts
}

// Default configuration for login attempts
export const LOGIN_RATE_LIMIT: RateLimitConfig = {
  windowMs: 15 * 60 * 1000,    // 15 minutes
  maxAttempts: 5,               // 5 attempts
  lockoutMs: 30 * 60 * 1000,   // 30 minute lockout
};

// API rate limit (more lenient)
export const API_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000,         // 1 minute
  maxAttempts: 100,            // 100 requests per minute
  lockoutMs: 60 * 1000,        // 1 minute cooldown
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  isLocked: boolean;
  lockoutRemaining?: number;
}

/**
 * Check rate limit for a given identifier (IP address, user ID, etc.)
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = LOGIN_RATE_LIMIT
): RateLimitResult {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  // Check if currently locked out
  if (entry?.lockedUntil && entry.lockedUntil > now) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.lockedUntil,
      isLocked: true,
      lockoutRemaining: Math.ceil((entry.lockedUntil - now) / 1000),
    };
  }

  // No entry or window expired - allow and start fresh
  if (!entry || (now - entry.firstAttempt) > config.windowMs) {
    rateLimitStore.set(identifier, {
      count: 1,
      firstAttempt: now,
    });
    return {
      allowed: true,
      remaining: config.maxAttempts - 1,
      resetTime: now + config.windowMs,
      isLocked: false,
    };
  }

  // Within window - check count
  const newCount = entry.count + 1;
  
  if (newCount > config.maxAttempts) {
    // Lock out the user
    const lockedUntil = now + config.lockoutMs;
    rateLimitStore.set(identifier, {
      ...entry,
      count: newCount,
      lockedUntil,
    });
    return {
      allowed: false,
      remaining: 0,
      resetTime: lockedUntil,
      isLocked: true,
      lockoutRemaining: Math.ceil(config.lockoutMs / 1000),
    };
  }

  // Allow but increment counter
  rateLimitStore.set(identifier, {
    ...entry,
    count: newCount,
  });

  return {
    allowed: true,
    remaining: config.maxAttempts - newCount,
    resetTime: entry.firstAttempt + config.windowMs,
    isLocked: false,
  };
}

/**
 * Record a successful authentication (resets rate limit)
 */
export function resetRateLimit(identifier: string): void {
  rateLimitStore.delete(identifier);
}

/**
 * Record a failed attempt (for failed login tracking)
 */
export function recordFailedAttempt(
  identifier: string,
  config: RateLimitConfig = LOGIN_RATE_LIMIT
): RateLimitResult {
  return checkRateLimit(identifier, config);
}

/**
 * Get rate limit headers for API responses
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': result.resetTime.toString(),
    ...(result.isLocked ? { 'Retry-After': result.lockoutRemaining?.toString() || '1800' } : {}),
  };
}

/**
 * Cleanup expired entries (call periodically)
 */
export function cleanupExpiredEntries(maxAgeMs: number = 60 * 60 * 1000): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    const age = now - entry.firstAttempt;
    const isExpired = age > maxAgeMs;
    const isUnlocked = !entry.lockedUntil || entry.lockedUntil < now;
    
    if (isExpired && isUnlocked) {
      rateLimitStore.delete(key);
    }
  }
}

// Cleanup expired entries every 10 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => cleanupExpiredEntries(), 10 * 60 * 1000);
}
