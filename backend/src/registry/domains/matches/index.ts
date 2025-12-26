import type { DomainRegistry } from '../../types.js';
import { Auth } from '../../../lib/auth/rules.js';
import { prisma } from '../../../lib/prisma/client.js';
import { json } from '../../../lib/http/json.js';
import { parsePositiveBigInt } from '../../../lib/http/parse.js';
import { toAvatarUrl } from '../../../services/media/presenter.js';

function orderedPair(a: bigint, b: bigint) {
  return a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a };
}

export const matchesDomain: DomainRegistry = {
  domain: 'matches',
  routes: [
    {
      id: 'matches.POST./swipes',
      method: 'POST',
      path: '/swipes',
      auth: Auth.user(),
      summary: 'Like / pass',
      tags: ['matches'],
      handler: async (req, res) => {
        const fromUserId = req.ctx.userId!;
        const { toUserId, action } = (req.body ?? {}) as { toUserId?: string|number; action?: 'LIKE'|'PASS' };
        if (!toUserId || (action !== 'LIKE' && action !== 'PASS')) return json(res, { error: 'toUserId and action required' }, 400);

        const toParsed = parsePositiveBigInt(toUserId, 'toUserId');
        if (!toParsed.ok) return json(res, { error: toParsed.error }, 400);
        const toId = toParsed.value;
        if (toId === fromUserId) return json(res, { error: 'Cannot swipe yourself' }, 400);

        await prisma.swipe.upsert({
          where: { fromUserId_toUserId: { fromUserId, toUserId: toId } },
          update: { action },
          create: { fromUserId, toUserId: toId, action }
        });

        let matched = false;
        let matchId: bigint | null = null;

        if (action === 'LIKE') {
          const reciprocal = await prisma.swipe.findUnique({
            where: { fromUserId_toUserId: { fromUserId: toId, toUserId: fromUserId } },
            select: { action: true }
          });

          if (reciprocal?.action === 'LIKE') {
            const pair = orderedPair(fromUserId, toId);
            const match = await prisma.match.upsert({
              where: { userAId_userBId: { userAId: pair.userAId, userBId: pair.userBId } },
              update: { state: 'ACTIVE' },
              create: { ...pair, state: 'ACTIVE' },
              select: { id: true }
            });
            matchId = match.id;
            matched = true;

            // ensure conversation exists
            await prisma.conversation.upsert({
              where: { matchId },
              update: {},
              create: { matchId, userAId: pair.userAId, userBId: pair.userBId }
            });
          }
        }

        return json(res, { ok: true, matched, matchId });
      }
    },
    {
      id: 'matches.GET./matches',
      method: 'GET',
      path: '/matches',
      auth: Auth.user(),
      summary: 'List matches',
      tags: ['matches'],
      handler: async (req, res) => {
        const me = req.ctx.userId!;
        const mediaSelect = {
          id: true,
          type: true,
          url: true,
          thumbUrl: true,
          width: true,
          height: true,
          durationSec: true,
          storageKey: true,
          variants: true
        };

        const matches = await prisma.match.findMany({
          where: {
            state: 'ACTIVE',
            OR: [{ userAId: me }, { userBId: me }]
          },
          orderBy: { updatedAt: 'desc' },
          take: 50,
          select: {
            id: true,
            userAId: true,
            userBId: true,
            updatedAt: true,
            conversation: { select: { id: true } },
            userA: { select: { id: true, profile: { select: { displayName: true, locationText: true, intent: true, avatarMedia: { select: mediaSelect } } } } },
            userB: { select: { id: true, profile: { select: { displayName: true, locationText: true, intent: true, avatarMedia: { select: mediaSelect } } } } }
          }
        });

        return json(res, {
          matches: matches.map(m => ({
            ...m,
            userA: {
              ...m.userA,
              profile: m.userA.profile
                ? (() => {
                    const { avatarMedia, ...profileData } = m.userA.profile;
                    return { ...profileData, avatarUrl: toAvatarUrl(avatarMedia) };
                  })()
                : null
            },
            userB: {
              ...m.userB,
              profile: m.userB.profile
                ? (() => {
                    const { avatarMedia, ...profileData } = m.userB.profile;
                    return { ...profileData, avatarUrl: toAvatarUrl(avatarMedia) };
                  })()
                : null
            }
          }))
        });
      }
    }
  ]
};
