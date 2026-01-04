import type { DomainRegistry } from '../../types.js';
import { Auth } from '../../../lib/auth/rules.js';
import { prisma } from '../../../lib/prisma/client.js';
import { json } from '../../../lib/http/json.js';
import { getCompatibilityMap, resolveCompatibility } from '../../../services/compatibility/compatibilityService.js';
import { parseLimit, parseOptionalPositiveBigInt, parsePositiveBigInt } from '../../../lib/http/parse.js';
import { toAvatarUrl } from '../../../services/media/presenter.js';

function orderedPair(a: bigint, b: bigint) {
  return a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a };
}

type SuggestionSort =
  | 'overall'
  | 'ratings'
  | 'ratings.attractive'
  | 'ratings.smart'
  | 'ratings.funny'
  | 'ratings.interesting'
  | 'ratings.fit'
  | 'interests'
  | 'nearby'
  | 'new';

function normalizeSuggestionSort(value: unknown): SuggestionSort {
  if (typeof value !== 'string') return 'overall';
  switch (value) {
    case 'overall':
    case 'ratings':
    case 'ratings.attractive':
    case 'ratings.smart':
    case 'ratings.funny':
    case 'ratings.interesting':
    case 'ratings.fit':
    case 'interests':
    case 'nearby':
    case 'new':
      return value;
    default:
      return 'overall';
  }
}

function suggestionOrder(sort: SuggestionSort): Array<{ scoreRatingsQuality?: 'desc' | 'asc'; ratingAttractive?: 'desc' | 'asc'; ratingSmart?: 'desc' | 'asc'; ratingFunny?: 'desc' | 'asc'; ratingInteresting?: 'desc' | 'asc'; scoreRatingsFit?: 'desc' | 'asc'; scoreInterests?: 'desc' | 'asc'; distanceKm?: 'desc' | 'asc'; scoreNew?: 'desc' | 'asc'; score?: 'desc' | 'asc'; candidateUserId?: 'desc' | 'asc' }> {
  switch (sort) {
    case 'ratings':
      return [{ scoreRatingsQuality: 'desc' }, { score: 'desc' }, { candidateUserId: 'desc' }];
    case 'ratings.attractive':
      return [{ ratingAttractive: 'desc' }, { score: 'desc' }, { candidateUserId: 'desc' }];
    case 'ratings.smart':
      return [{ ratingSmart: 'desc' }, { score: 'desc' }, { candidateUserId: 'desc' }];
    case 'ratings.funny':
      return [{ ratingFunny: 'desc' }, { score: 'desc' }, { candidateUserId: 'desc' }];
    case 'ratings.interesting':
      return [{ ratingInteresting: 'desc' }, { score: 'desc' }, { candidateUserId: 'desc' }];
    case 'ratings.fit':
      return [{ scoreRatingsFit: 'desc' }, { score: 'desc' }, { candidateUserId: 'desc' }];
    case 'interests':
      return [{ scoreInterests: 'desc' }, { score: 'desc' }, { candidateUserId: 'desc' }];
    case 'nearby':
      return [{ distanceKm: 'asc' }, { score: 'desc' }, { candidateUserId: 'desc' }];
    case 'new':
      return [{ scoreNew: 'desc' }, { score: 'desc' }, { candidateUserId: 'desc' }];
    case 'overall':
    default:
      return [{ score: 'desc' }, { candidateUserId: 'desc' }];
  }
}

export const matchesDomain: DomainRegistry = {
  domain: 'matches',
  routes: [
    {
      id: 'matches.POST./likes',
      method: 'POST',
      path: '/likes',
      auth: Auth.user(),
      summary: 'Like / dislike / unlike',
      tags: ['matches'],
      handler: async (req, res) => {
        const fromUserId = req.ctx.userId!;
        const { toUserId, action } = (req.body ?? {}) as {
          toUserId?: string | number;
          action?: 'LIKE' | 'DISLIKE' | 'UNLIKE' | 'PASS';
        };
        const normalizedAction = action === 'PASS' ? 'DISLIKE' : action;
        if (!toUserId || (normalizedAction !== 'LIKE' && normalizedAction !== 'DISLIKE' && normalizedAction !== 'UNLIKE')) {
          return json(res, { error: 'toUserId and action required' }, 400);
        }

        const toParsed = parsePositiveBigInt(toUserId, 'toUserId');
        if (!toParsed.ok) return json(res, { error: toParsed.error }, 400);
        const toId = toParsed.value;
        if (toId === fromUserId) return json(res, { error: 'Cannot like or dislike yourself' }, 400);

        await prisma.$transaction(async (tx) => {
          const existing = await tx.like.findUnique({
            where: { fromUserId_toUserId: { fromUserId, toUserId: toId } },
            select: { action: true }
          });

          if (normalizedAction === 'UNLIKE') {
            if (existing) {
              await tx.like.delete({
                where: { fromUserId_toUserId: { fromUserId, toUserId: toId } }
              });
            }

            if (existing) {
              const targetProfile = await tx.profile.findFirst({
                where: { userId: toId, deletedAt: null },
                select: { id: true }
              });
              if (targetProfile) {
                const likeDelta = existing.action === 'LIKE' ? -1 : 0;
                const dislikeDelta = existing.action === 'DISLIKE' ? -1 : 0;
                if (likeDelta !== 0 || dislikeDelta !== 0) {
                  const stats = await tx.profileStats.findUnique({
                    where: { profileId: targetProfile.id },
                    select: { profileId: true }
                  });
                  if (stats) {
                    await tx.profileStats.update({
                      where: { profileId: targetProfile.id },
                      data: {
                        ...(likeDelta ? { likeCount: { increment: likeDelta } } : {}),
                        ...(dislikeDelta ? { dislikeCount: { increment: dislikeDelta } } : {})
                      }
                    });
                  }
                }
              }
            }
            return;
          }

          await tx.like.upsert({
            where: { fromUserId_toUserId: { fromUserId, toUserId: toId } },
            update: { action: normalizedAction },
            create: { fromUserId, toUserId: toId, action: normalizedAction }
          });

          if (existing?.action !== normalizedAction) {
            const targetProfile = await tx.profile.findFirst({
              where: { userId: toId, deletedAt: null },
              select: { id: true }
            });
            if (targetProfile) {
              const likeDelta =
                (normalizedAction === 'LIKE' ? 1 : 0) - (existing?.action === 'LIKE' ? 1 : 0);
              const dislikeDelta =
                (normalizedAction === 'DISLIKE' ? 1 : 0) -
                (existing?.action === 'DISLIKE' ? 1 : 0);

              if (likeDelta !== 0 || dislikeDelta !== 0) {
                await tx.profileStats.upsert({
                  where: { profileId: targetProfile.id },
                  update: {
                    ...(likeDelta ? { likeCount: { increment: likeDelta } } : {}),
                    ...(dislikeDelta ? { dislikeCount: { increment: dislikeDelta } } : {})
                  },
                  create: {
                    profileId: targetProfile.id,
                    likeCount: normalizedAction === 'LIKE' ? 1 : 0,
                    dislikeCount: normalizedAction === 'DISLIKE' ? 1 : 0,
                    ratingSums: {
                      attractive: 0,
                      smart: 0,
                      funny: 0,
                      interesting: 0
                    }
                  }
                });
              }
            }
          }
        });

        let matched = false;
        let matchId: bigint | null = null;

        if (normalizedAction === 'LIKE') {
          const reciprocal = await prisma.like.findUnique({
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
      id: 'matches.GET./likes',
      method: 'GET',
      path: '/likes',
      auth: Auth.user(),
      summary: 'List likes (profiles you liked, not yet matched)',
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

        const likes = await prisma.like.findMany({
          where: { fromUserId: me, action: 'LIKE' },
          orderBy: { createdAt: 'desc' },
          take: 100,
          select: {
            id: true,
            toUserId: true,
            createdAt: true,
            toUser: {
              select: {
                id: true,
                profile: {
                  select: {
                    displayName: true,
                    locationText: true,
                    intent: true,
                    avatarMedia: { select: mediaSelect }
                  }
                }
              }
            }
          }
        });

        const likedUserIds = likes.map((like) => like.toUserId);
        const matches = likedUserIds.length
          ? await prisma.match.findMany({
              where: {
                OR: [
                  { userAId: me, userBId: { in: likedUserIds } },
                  { userBId: me, userAId: { in: likedUserIds } }
                ]
              },
              select: { userAId: true, userBId: true }
            })
          : [];
        const matchedIds = new Set(
          matches.map((match) => (match.userAId === me ? match.userBId : match.userAId))
        );

        const filteredLikes = likes.filter((like) => !matchedIds.has(like.toUserId));
        const compatibilityMap = await getCompatibilityMap(me, filteredLikes.map((like) => like.toUserId));

        return json(res, {
          likes: filteredLikes.map((like) => {
            const profile = like.toUser.profile
              ? (() => {
                  const { avatarMedia, ...profileData } = like.toUser.profile!;
                  return { ...profileData, avatarUrl: toAvatarUrl(avatarMedia) };
                })()
              : null;

            return {
              id: like.id,
              userId: like.toUserId,
              likedAt: like.createdAt.toISOString(),
              profile,
              compatibility: resolveCompatibility(me, compatibilityMap, like.toUserId)
            };
          })
        });
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

        const otherUserIds = matches.map((m) => (m.userAId === me ? m.userBId : m.userAId));
        const compatibilityMap = await getCompatibilityMap(me, otherUserIds);

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
                : null,
              compatibility: m.userAId === me ? null : resolveCompatibility(me, compatibilityMap, m.userAId)
            },
            userB: {
              ...m.userB,
              profile: m.userB.profile
                ? (() => {
                    const { avatarMedia, ...profileData } = m.userB.profile;
                    return { ...profileData, avatarUrl: toAvatarUrl(avatarMedia) };
                  })()
                : null,
              compatibility: m.userBId === me ? null : resolveCompatibility(me, compatibilityMap, m.userBId)
            }
          }))
        });
      }
    },
    {
      id: 'matches.GET./suggestions',
      method: 'GET',
      path: '/suggestions',
      auth: Auth.user(),
      summary: 'List match suggestions',
      tags: ['matches'],
      handler: async (req, res) => {
        const me = req.ctx.userId!;
        const takeParsed = parseLimit(req.query.take, 20, 50);
        if (!takeParsed.ok) return json(res, { error: takeParsed.error }, 400);
        const cursorParsed = parseOptionalPositiveBigInt(req.query.cursorId, 'cursorId');
        if (!cursorParsed.ok) return json(res, { error: cursorParsed.error }, 400);

        const take = takeParsed.value;
        const cursorId = cursorParsed.value;
        const sort = normalizeSuggestionSort(req.query.type);
        const orderBy = suggestionOrder(sort);
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

        const suggestions = await prisma.matchScore.findMany({
          where: {
            userId: me,
            ...(sort === 'nearby' ? { distanceKm: { not: null } } : {})
          },
          orderBy,
          take,
          ...(cursorId
            ? { cursor: { userId_candidateUserId: { userId: me, candidateUserId: cursorId } }, skip: 1 }
            : {}),
          select: {
            candidateUserId: true,
            score: true,
            reasons: true,
            candidate: {
              select: {
                id: true,
                profile: {
                  select: {
                    displayName: true,
                    locationText: true,
                    intent: true,
                    avatarMedia: { select: mediaSelect }
                  }
                }
              }
            }
          }
        });

        const nextCursorId = suggestions.length === take ? suggestions[suggestions.length - 1]!.candidateUserId : null;
        const candidateIds = suggestions.map((s) => s.candidateUserId);
        const compatibilityMap = await getCompatibilityMap(me, candidateIds);

        return json(res, {
          suggestions: suggestions.map((s) => {
            const profile = s.candidate?.profile
              ? (() => {
                  const { avatarMedia, ...profileData } = s.candidate.profile;
                  return { ...profileData, avatarUrl: toAvatarUrl(avatarMedia) };
                })()
              : null;
            return {
              userId: s.candidateUserId,
              profile,
              score: s.score,
              reasons: s.reasons ?? null,
              compatibility: resolveCompatibility(me, compatibilityMap, s.candidateUserId)
            };
          }),
          nextCursorId
        });
      }
    }
  ]
};
