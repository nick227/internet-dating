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
  const expiresIn = process.env.JWT_ACCESS_TTL ?? '15m';
  return jwt.sign(payload, env('JWT_ACCESS_SECRET'), {
    expiresIn
  } as jwt.SignOptions);
}

export function signRefreshToken(payload: JwtPayload) {
  const expiresIn = process.env.JWT_REFRESH_TTL ?? '30d';
  return jwt.sign(payload, env('JWT_REFRESH_SECRET'), {
    expiresIn
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): JwtPayload {
  try {
    const payload = jwt.verify(token, env('JWT_ACCESS_SECRET')) as JwtPayload;
    if (!payload || !payload.sub) {
      throw new Error('Token payload missing sub field');
    }
    return payload;
  } catch (err) {
    // Re-throw JWT errors - they'll be caught by tokenToUserId
    throw err;
  }
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, env('JWT_REFRESH_SECRET')) as JwtPayload;
}
