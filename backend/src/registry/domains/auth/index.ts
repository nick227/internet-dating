import type { DomainRegistry } from '../../types.js';
import { Auth } from '../../../lib/auth/rules.js';
import { prisma } from '../../../lib/prisma/client.js';
import { json } from '../../../lib/http/json.js';
import bcrypt from 'bcryptjs';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken
} from '../../../lib/auth/jwt.js';

const getCookieOpts = (rememberMe: boolean = false) => {
  const base = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  };
  
  if (rememberMe) {
    return {
      ...base,
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    };
  }
  
  return base;
};

export const authDomain: DomainRegistry = {
  domain: 'auth',
  routes: [
    {
      id: 'auth.POST./auth/signup',
      method: 'POST',
      path: '/auth/signup',
      auth: Auth.public(),
      summary: 'Create a user and issue auth cookies',
      tags: ['auth'],
      handler: async (req, res) => {
        const { email, password, rememberMe } = (req.body ?? {}) as { email?: string; password?: string; rememberMe?: boolean };
        if (!email || !password) return json(res, { error: 'email and password required' }, 400);

        const passwordHash = await bcrypt.hash(password, 10);
        const cookieOptions = getCookieOpts(rememberMe === true);

        try {
          const user = await prisma.user.create({
            data: {
              email,
              passwordHash,
              profile: { create: { isVisible: true } }
            },
            select: { id: true, email: true }
          });

          const sub = String(user.id);
          res.cookie('access_token', signAccessToken({ sub }), cookieOptions);
          res.cookie('refresh_token', signRefreshToken({ sub }), cookieOptions);

          return json(res, { userId: user.id, email: user.email });
        } catch {
          return json(res, { error: 'Unable to signup (email may already exist)' }, 409);
        }
      }
    },

    {
      id: 'auth.POST./auth/login',
      method: 'POST',
      path: '/auth/login',
      auth: Auth.public(),
      summary: 'Verify credentials and issue auth cookies',
      tags: ['auth'],
      handler: async (req, res) => {
        const { email, password, rememberMe } = (req.body ?? {}) as { email?: string; password?: string; rememberMe?: boolean };
        if (!email || !password) return json(res, { error: 'email and password required' }, 400);

        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, passwordHash: true, deletedAt: true }
        });
        if (!user || user.deletedAt) return json(res, { error: 'Invalid credentials' }, 401);

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return json(res, { error: 'Invalid credentials' }, 401);

        const sub = String(user.id);
        const cookieOptions = getCookieOpts(rememberMe === true);
        res.cookie('access_token', signAccessToken({ sub }), cookieOptions);
        res.cookie('refresh_token', signRefreshToken({ sub }), cookieOptions);

        return json(res, { userId: user.id });
      }
    },

    {
      id: 'auth.POST./auth/refresh',
      method: 'POST',
      path: '/auth/refresh',
      auth: Auth.public(),
      summary: 'Refresh access token',
      tags: ['auth'],
      handler: async (req, res) => {
        const token = req.cookies?.refresh_token;
        if (!token) return json(res, { error: 'unauthenticated' }, 401);

        try {
          const payload = verifyRefreshToken(token);
          if (!payload || !payload.sub) {
            console.error('[auth/refresh] Refresh token payload missing sub field', { payload });
            return json(res, { error: 'invalid refresh token' }, 401);
          }
          // Validate that sub is a valid positive integer
          const userIdTest = BigInt(payload.sub);
          if (userIdTest <= 0n) {
            console.error('[auth/refresh] Invalid userId in refresh token', { sub: payload.sub });
            return json(res, { error: 'invalid refresh token' }, 401);
          }
          res.cookie('access_token', signAccessToken({ sub: payload.sub }), getCookieOpts(false));
          return json(res, { ok: true });
        } catch (err) {
          console.error('[auth/refresh] Error refreshing token', { error: err });
          return json(res, { error: 'invalid refresh token' }, 401);
        }
      }
    },

    {
      id: 'auth.POST./auth/logout',
      method: 'POST',
      path: '/auth/logout',
      auth: Auth.user(),
      summary: 'Clear auth cookies',
      tags: ['auth'],
      handler: async (_req, res) => {
        const cookieOpts = getCookieOpts(false);
        res.cookie('access_token', '', { ...cookieOpts, maxAge: 0 });
        res.cookie('refresh_token', '', { ...cookieOpts, maxAge: 0 });
        return json(res, { ok: true });
      }
    },

    {
      id: 'auth.GET./auth/me',
      method: 'GET',
      path: '/auth/me',
      auth: Auth.user(),
      summary: 'Return current user id',
      tags: ['auth'],
      handler: async (req, res) => {
        // req.userId should be set by requireAuth middleware, but ensure it exists
        const userId = req.userId ?? req.ctx?.userId?.toString();
        if (!userId) {
          return json(res, { error: 'User ID not found' }, 401);
        }
        return json(res, { userId });
      }
    }
  ]
};
