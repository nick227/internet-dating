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
    const parsed = parsePositiveBigInt(payload.sub, 'userId');
    if (!parsed.ok) return null;
    return parsed.value;
  } catch {
    return null;
  }
}

export const attachContext: Handler = (req, _res, next) => {
  req.ctx = req.ctx ?? {};

  // Optional identification for public routes (no enforcement)
  const token = getAccessToken(req);
  const tokenUserId = token ? tokenToUserId(token) : null;
  if (tokenUserId) {
    req.ctx.userId = tokenUserId;
    req.userId = tokenUserId.toString();
  }

  next();
};
