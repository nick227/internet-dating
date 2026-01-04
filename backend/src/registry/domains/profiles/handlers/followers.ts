import { Auth } from '../../../../lib/auth/rules.js';
import { json } from '../../../../lib/http/json.js';
import { parsePositiveBigInt } from '../../../../lib/http/parse.js';
import type { RouteDef } from '../../../../registry/types.js';
import { getFollowers, getFollowing } from '../services/accessService.js';
import { serializeFollower } from '../presenters/followerPresenter.js';
import { ForbiddenError } from '../services/accessService.js';

export const getFollowersRoute: RouteDef = {
  id: 'profiles.GET./profiles/:userId/followers',
  method: 'GET',
  path: '/profiles/:userId/followers',
  auth: Auth.user(),
  summary: 'List followers (people following this profile)',
  tags: ['profiles'],
  handler: async (req, res) => {
    const userParsed = parsePositiveBigInt(req.params.userId, 'userId');
    if (!userParsed.ok) return json(res, { error: userParsed.error }, 400);
    
    const targetUserId = userParsed.value;
    const me = req.ctx.userId!;
    
    if (targetUserId !== me) {
      return json(res, { error: 'Forbidden' }, 403);
    }

    try {
      const result = await getFollowers(targetUserId, me);
      return json(res, { 
        followers: result.map(({ follower, compatibility }) => 
          serializeFollower(follower, compatibility)
        )
      });
    } catch (err) {
      if (err instanceof ForbiddenError) {
        return json(res, { error: err.message }, 403);
      }
      throw err;
    }
  }
};

export const getFollowingRoute: RouteDef = {
  id: 'profiles.GET./profiles/:userId/following',
  method: 'GET',
  path: '/profiles/:userId/following',
  auth: Auth.user(),
  summary: 'List following (people this profile follows)',
  tags: ['profiles'],
  handler: async (req, res) => {
    const userParsed = parsePositiveBigInt(req.params.userId, 'userId');
    if (!userParsed.ok) return json(res, { error: userParsed.error }, 400);
    
    const targetUserId = userParsed.value;
    const me = req.ctx.userId!;
    
    if (targetUserId !== me) {
      return json(res, { error: 'Forbidden' }, 403);
    }

    try {
      const result = await getFollowing(targetUserId);
      return json(res, { 
        following: result.map(({ follower, compatibility }) => 
          serializeFollower(follower, compatibility)
        )
      });
    } catch (err) {
      if (err instanceof ForbiddenError) {
        return json(res, { error: err.message }, 403);
      }
      throw err;
    }
  }
};
