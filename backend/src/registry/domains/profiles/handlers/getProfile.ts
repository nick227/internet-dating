import { Auth } from '../../../../lib/auth/rules.js';
import { json } from '../../../../lib/http/json.js';
import { parsePositiveBigInt } from '../../../../lib/http/parse.js';
import type { RouteDef } from '../../../../registry/types.js';
import { getProfileView } from '../services/profileService.js';
import { serializeProfile, serializePost } from '../presenters/index.js';
import type { ProfileResponse } from '../types/dto.js';

class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export const getProfileRoute: RouteDef = {
  id: 'profiles.GET./profiles/:userId',
  method: 'GET',
  path: '/profiles/:userId',
  auth: Auth.public(),
  summary: 'Get profile',
  tags: ['profiles'],
  handler: async (req, res) => {
    // 1. Parse and validate input
    const userIdParsed = parsePositiveBigInt(req.params.userId, 'userId');
    if (!userIdParsed.ok) return json(res, { error: userIdParsed.error }, 400);

    const viewerId = req.ctx.userId ?? null;

    try {
      // 2. Call service (business logic)
      const result = await getProfileView({
        targetUserId: userIdParsed.value,
        viewerId
      });

      // 3. Transform to API response format using presenters
      const response: ProfileResponse = {
        profile: serializeProfile(result.profile),
        posts: result.posts.map(serializePost),
        ratings: {
          count: result.ratings.count,
          avg: result.ratings.avg,
          mine: result.ratings.mine ? {
            attractive: result.ratings.mine.attractive,
            smart: result.ratings.mine.smart,
            funny: result.ratings.mine.funny,
            interesting: result.ratings.mine.interesting,
            createdAt: result.ratings.mine.createdAt.toISOString()
          } : null
        },
        access: {
          status: result.access.status,
          requestId: result.access.requestId ? String(result.access.requestId) : null,
          hasPrivatePosts: result.access.hasPrivatePosts,
          hasPrivateMedia: result.access.hasPrivateMedia
        },
        compatibility: result.compatibility
      };

      // 4. Return HTTP response
      return json(res, response);
    } catch (err) {
      if (err instanceof NotFoundError) {
        return json(res, { error: err.message }, 404);
      }
      throw err;
    }
  }
};
