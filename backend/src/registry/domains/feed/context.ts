import type { Request } from 'express';
import type { ParseResult } from '../../../lib/http/parse.js';
import { parseLimit, parseOptionalBoolean, parseOptionalNumber, parseOptionalPositiveBigInt } from '../../../lib/http/parse.js';
import type { ViewerContext } from './types.js';

export function buildViewerContext(req: Request): ParseResult<ViewerContext> {
  const takeParsed = parseLimit(req.query.take, 20, 50);
  if (!takeParsed.ok) return { ok: false, error: takeParsed.error };

  const cursorParsed = parseOptionalPositiveBigInt(req.query.cursorId, 'cursorId');
  if (!cursorParsed.ok) return { ok: false, error: cursorParsed.error };

  const debugParsed = parseOptionalBoolean(req.query.debug, 'debug');
  if (!debugParsed.ok) return { ok: false, error: debugParsed.error };

  const seedParsed = parseOptionalNumber(req.query.seed, 'seed');
  if (!seedParsed.ok) return { ok: false, error: seedParsed.error };

  const markSeenParsed = parseOptionalBoolean(req.query.markSeen, 'markSeen');
  if (!markSeenParsed.ok) return { ok: false, error: markSeenParsed.error };

  return {
    ok: true,
    value: {
      userId: req.ctx.userId ?? null,
      take: takeParsed.value,
      cursorId: cursorParsed.value,
      debug: debugParsed.value ?? false,
      seed: seedParsed.value ?? null,
      markSeen: markSeenParsed.value ?? Boolean(req.ctx.userId)
    }
  };
}
