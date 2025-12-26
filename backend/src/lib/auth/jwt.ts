import jwt from 'jsonwebtoken';

export type JwtPayload = {
  sub: string;
  iat?: number;
  exp?: number;
};

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export function signAccessToken(payload: JwtPayload) {
  return jwt.sign(payload, env('JWT_ACCESS_SECRET'), {
    expiresIn: process.env.JWT_ACCESS_TTL ?? '15m'
  });
}

export function signRefreshToken(payload: JwtPayload) {
  return jwt.sign(payload, env('JWT_REFRESH_SECRET'), {
    expiresIn: process.env.JWT_REFRESH_TTL ?? '30d'
  });
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, env('JWT_ACCESS_SECRET')) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, env('JWT_REFRESH_SECRET')) as JwtPayload;
}
