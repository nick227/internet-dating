import type { Handler } from '../lib/http/types.js';
import { verifyAccessToken } from '../lib/auth/jwt.js';
import { parsePositiveBigInt } from '../lib/http/parse.js';

function getAccessToken(req: any): string | null {
  const hdr = req.headers?.authorization;
  const bearer = typeof hdr === 'string' && hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  const cookieToken = req.cookies?.access_token ?? null;
  return bearer ?? cookieToken ?? null;
}

function tokenToUserId(token: string): bigint | null {
  try {
    const payload = verifyAccessToken(token);
    if (!payload || !payload.sub) {
      return null;
    }
    const parsed = parsePositiveBigInt(payload.sub, 'userId');
    if (!parsed.ok) {
      // Invalid userId in token - return null to indicate auth failure
      return null;
    }
    return parsed.value;
  } catch (err) {
    // JWT verification errors are expected for invalid tokens - just return null
    // This indicates the token is invalid, not a server error
    return null;
  }
}

export const attachContext: Handler = (req, _res, next) => {
  try {
    req.ctx = req.ctx ?? {};

    // Optional identification for public routes (no enforcement)
    // If token is invalid, just don't set userId - don't throw errors
    const token = getAccessToken(req);
    if (token) {
      const tokenUserId = tokenToUserId(token);
      if (tokenUserId) {
        req.ctx.userId = tokenUserId;
        req.userId = tokenUserId.toString();
      }
      // If token is invalid, tokenToUserId returns null - that's fine, just continue
    }

    next();
  } catch (err) {
    // If something unexpected happens, log it but don't break the request
    // The requireAuth middleware will handle authentication properly
    console.error('[attachContext] Unexpected error', { error: err });
    next();
  }
};
