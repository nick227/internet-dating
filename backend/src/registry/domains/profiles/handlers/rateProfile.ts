import { Auth } from '../../../../lib/auth/rules.js';
import { json } from '../../../../lib/http/json.js';
import { parsePositiveBigInt } from '../../../../lib/http/parse.js';
import type { RouteDef } from '../../../../registry/types.js';
import { submitRating, ValidationError, NotFoundError } from '../services/ratingService.js';

export const rateProfileRoute: RouteDef = {
  id: 'profiles.POST./profiles/:userId/rate',
  method: 'POST',
  path: '/profiles/:userId/rate',
  auth: Auth.user(),
  summary: 'Rate profile',
  tags: ['profiles'],
  handler: async (req, res) => {
    const raterUserId = req.ctx.userId!;
    const targetParsed = parsePositiveBigInt(req.params.userId, 'userId');
    if (!targetParsed.ok) return json(res, { error: targetParsed.error }, 400);
    const targetUserId = targetParsed.value;

    const { attractive, smart, funny, interesting } = (req.body ?? {}) as Record<string, unknown>;
    const toRating = (value: unknown) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return null;
      return Math.max(1, Math.min(10, Math.round(n)));
    };
    const attractiveValue = toRating(attractive);
    const smartValue = toRating(smart);
    const funnyValue = toRating(funny);
    const interestingValue = toRating(interesting);
    
    if ([attractiveValue, smartValue, funnyValue, interestingValue].some(v => v === null)) {
      return json(res, { error: 'Ratings must be numbers from 1 to 10' }, 400);
    }

    try {
      await submitRating(raterUserId, targetUserId, {
        attractive: attractiveValue as number,
        smart: smartValue as number,
        funny: funnyValue as number,
        interesting: interestingValue as number
      });
      return json(res, { ok: true });
    } catch (err) {
      if (err instanceof ValidationError) {
        return json(res, { error: err.message }, 400);
      }
      if (err instanceof NotFoundError) {
        return json(res, { error: err.message }, 404);
      }
      throw err;
    }
  }
};
