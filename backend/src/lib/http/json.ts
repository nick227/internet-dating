import type { Response } from 'express';

export function json(res: Response, data: unknown, status = 200) {
  const body = JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
  res.status(status).type('application/json').send(body);
}
