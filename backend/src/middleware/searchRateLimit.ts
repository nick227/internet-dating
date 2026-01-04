import type { Handler } from '../lib/http/types.js';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory rate limit storage (keyed by userId or IP)
const rateLimitMap = new Map<string, RateLimitEntry>();

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_AUTHENTICATED = 60; // 60 requests per minute for authenticated users
const RATE_LIMIT_MAX_UNAUTHENTICATED = 10; // 10 requests per minute for unauthenticated users

function getRateLimitKey(req: Parameters<Handler>[0]): string {
  // Use userId if authenticated, otherwise use IP
  if (req.ctx?.userId) {
    return `user:${req.ctx.userId}`;
  }
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return `ip:${ip}`;
}

function checkRateLimit(key: string, maxRequests: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || entry.resetAt <= now) {
    // Reset or create entry
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false; // Rate limit exceeded
  }

  entry.count += 1;
  return true;
}

function cleanupOldEntries() {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (entry.resetAt <= now) {
      rateLimitMap.delete(key);
    }
  }
}

// Cleanup old entries every 5 minutes
setInterval(cleanupOldEntries, 5 * 60 * 1000);

/**
 * Rate limiting middleware for search endpoint
 * - Authenticated users: 60 requests/minute
 * - Unauthenticated users: 10 requests/minute per IP
 */
export function searchRateLimit(handler: Handler): Handler {
  return async (req, res, next) => {
    const key = getRateLimitKey(req);
    const maxRequests = req.ctx?.userId 
      ? RATE_LIMIT_MAX_AUTHENTICATED 
      : RATE_LIMIT_MAX_UNAUTHENTICATED;

    if (!checkRateLimit(key, maxRequests)) {
      const entry = rateLimitMap.get(key);
      const retryAfter = entry ? Math.ceil((entry.resetAt - Date.now()) / 1000) : 60;
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter
      });
    }

    return handler(req, res, next);
  };
}
