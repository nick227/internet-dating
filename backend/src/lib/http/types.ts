import type { Request, Response, NextFunction } from 'express';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type Handler = (req: Request, res: Response, next: NextFunction) => unknown;

export type ApiContext = { userId?: bigint };

declare global {
  namespace Express {
    interface Request {
      ctx: ApiContext;
    }
  }
}
