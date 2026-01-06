import type { Handler } from '../http/types.js';
import type { AuthRule } from './rules.js';
import { parsePositiveBigInt } from '../http/parse.js';
import { verifyAccessToken } from './jwt.js';

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
      // This error message will be logged but we return null to indicate auth failure
      return null;
    }
    return parsed.value;
  } catch (err) {
    // JWT verification errors are expected for invalid tokens - just return null
    // This indicates the token is invalid, not a server error
    return null;
  }
}

export function requireAuth(rule: AuthRule): Handler {
  return (req, res, next) => {
    try {
      if (rule.kind === 'public') return next();

      // attachContext may already have set it; still enforce for protected routes
      if (!req.ctx?.userId) {
        const token = getAccessToken(req);
        if (!token) {
          return res.status(401).json({ error: 'Authentication required' });
        }
        const userId = tokenToUserId(token);
        if (!userId) {
          return res.status(401).json({ error: 'invalid token' });
        }
        req.ctx.userId = userId;
        req.userId = userId.toString();
      }

      if (rule.kind === 'user') return next();

      if (rule.kind === 'owner') {
        const v = req.params[rule.param];
        if (v === undefined || v === null || v === '') {
          return res.status(400).json({ error: `Missing param: ${rule.param}` });
        }
        const parsed = parsePositiveBigInt(v, rule.param);
        if (!parsed.ok) return res.status(400).json({ error: parsed.error });
        if (parsed.value !== req.ctx.userId) return res.status(403).json({ error: 'Forbidden' });
        return next();
      }

      return res.status(501).json({ error: 'Auth rule not implemented yet' });
    } catch (err) {
      // Catch any unexpected errors and return 401 (auth failure) not 400
      console.error('[requireAuth] Unexpected error in auth middleware', { error: err });
      return res.status(401).json({ error: 'Authentication failed' });
    }
  };
}
