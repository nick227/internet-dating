import type { DomainRegistry } from '../../types.js';
import { Auth } from '../../../lib/auth/rules.js';
import { prisma } from '../../../lib/prisma/client.js';
import { json } from '../../../lib/http/json.js';
import { parseOptionalBoolean, parseOptionalDate, parseOptionalNumber, parseOptionalPositiveBigInt, parsePositiveBigInt } from '../../../lib/http/parse.js';
import { toAvatarUrl, toPublicMedia } from '../../../services/media/presenter.js';
import { mediaService, MediaError } from '../../../services/media/mediaService.js';
import { getProfileAccessSummary } from '../../../services/access/profileAccessService.js';
import { getOrCreateFollowConversation, createFollowRequestMessage, createFollowResponseMessage } from '../../../services/access/followConversationService.js';
import { getCompatibilityMap, resolveCompatibility } from '../../../services/compatibility/compatibilityService.js';

export const profilesDomain: DomainRegistry = {
  domain: 'profiles',
  routes: [
    {
      id: 'profiles.GET./profiles/:userId',
      method: 'GET',
      path: '/profiles/:userId',
      auth: Auth.public(),
      summary: 'Get profile',
      tags: ['profiles'],
      handler: async (req, res) => {
        const userParsed = parsePositiveBigInt(req.params.userId, 'userId');
        if (!userParsed.ok) return json(res, { error: userParsed.error }, 400);
        const targetUserId = userParsed.value;
        const viewerId = req.ctx.userId ?? null;
        const accessSummary = await getProfileAccessSummary(targetUserId, viewerId);
        const canViewPrivate = accessSummary.status === 'GRANTED';
        const isOwner = viewerId === targetUserId;

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

        const profile = await prisma.profile.findFirst({
          where: {
            userId: targetUserId,
            deletedAt: null,
            user: { deletedAt: null },
            ...(isOwner ? {} : { isVisible: true })
          },
          select: {
            id: true,
            userId: true,
            displayName: true,
            bio: true,
            birthdate: true,
            locationText: true,
            gender: true,
            intent: true,
            isVisible: true,
            avatarMedia: { select: mediaSelect },
            heroMedia: { select: mediaSelect },
            top5Lists: {
              orderBy: { updatedAt: 'desc' },
              take: 10,
              select: { id: true, title: true, updatedAt: true, items: { orderBy: { order: 'asc' }, select: { order: true, text: true } } }
            }
          }
        });

        if (!profile) return json(res, { error: 'Profile not found' }, 404);
        const profileId = profile.id;

        const posts = await prisma.post.findMany({
          where: {
            userId: targetUserId,
            deletedAt: null,
            ...(canViewPrivate ? {} : { visibility: 'PUBLIC' })
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 30,
          select: {
            id: true,
            visibility: true,
            text: true,
            createdAt: true,
            media: { select: { order: true, media: { select: { id: true, type: true, url: true, thumbUrl: true, width: true, height: true, durationSec: true, storageKey: true, variants: true } } }, orderBy: { order: 'asc' } }
          }
        });

        // rating aggregates
        const ratingAgg = await prisma.profileRating.aggregate({
          where: { targetProfileId: profileId },
          _avg: { attractive: true, smart: true, funny: true, interesting: true },
          _count: { _all: true }
        });

        // viewer's rating (if logged in)
        let myRating = null as any;
        if (viewerId) {
          const viewerProfile = await prisma.profile.findUnique({
            where: { userId: viewerId },
            select: { id: true }
          });
          if (viewerProfile) {
            myRating = await prisma.profileRating.findUnique({
              where: {
                raterProfileId_targetProfileId: {
                  raterProfileId: viewerProfile.id,
                  targetProfileId: profileId
                }
              },
              select: { attractive: true, smart: true, funny: true, interesting: true, createdAt: true }
            });
          }
        }

        const [privatePost, privateMedia] = await Promise.all([
          prisma.post.findFirst({
            where: { userId: targetUserId, deletedAt: null, visibility: 'PRIVATE' },
            select: { id: true }
          }),
          prisma.media.findFirst({
            where: { ownerUserId: targetUserId, deletedAt: null, visibility: 'PRIVATE' },
            select: { id: true }
          })
        ]);

        const { id, avatarMedia, heroMedia, ...profileData } = profile;
        const avatarUrl = toAvatarUrl(avatarMedia);
        const heroUrl = toAvatarUrl(heroMedia);

        const compatibilityMap = await getCompatibilityMap(viewerId, viewerId ? [targetUserId] : []);
        const compatibility = resolveCompatibility(viewerId, compatibilityMap, targetUserId);

        return json(res, {
          profile: { ...profileData, avatarUrl, heroUrl },
          posts: posts.map(p => ({
            ...p,
            media: p.media.map(m => ({ order: m.order, media: toPublicMedia(m.media) }))
          })),
          access: {
            status: accessSummary.status,
            requestId: accessSummary.requestId,
            hasPrivatePosts: Boolean(privatePost),
            hasPrivateMedia: Boolean(privateMedia)
          },
          ratings: {
            count: ratingAgg._count._all,
            avg: ratingAgg._avg,
            mine: myRating
          },
          compatibility
        });
      }
    },
    {
      id: 'profiles.POST./profiles/:userId/access-requests',
      method: 'POST',
      path: '/profiles/:userId/access-requests',
      auth: Auth.user(),
      summary: 'Request access to private profile content',
      tags: ['profiles'],
      handler: async (req, res) => {
        const userParsed = parsePositiveBigInt(req.params.userId, 'userId');
        if (!userParsed.ok) return json(res, { error: userParsed.error }, 400);
        const targetUserId = userParsed.value;
        const viewerUserId = req.ctx.userId!;
        if (viewerUserId === targetUserId) {
          return json(res, { error: 'Cannot request access to your own profile' }, 400);
        }

        const targetProfile = await prisma.profile.findFirst({
          where: { userId: targetUserId, deletedAt: null, user: { deletedAt: null } },
          select: { userId: true }
        });
        if (!targetProfile) {
          return json(res, { error: 'Profile not found' }, 404);
        }

        const existing = await prisma.profileAccess.findUnique({
          where: { ownerUserId_viewerUserId: { ownerUserId: targetUserId, viewerUserId } },
          select: { id: true, status: true }
        });

        if (existing?.status === 'GRANTED') {
          return json(res, { status: 'GRANTED', requestId: existing.id });
        }
        if (existing?.status === 'PENDING') {
          return json(res, { status: 'PENDING', requestId: existing.id });
        }
        if (existing?.status === 'DENIED' || existing?.status === 'REVOKED') {
          return json(res, { error: 'Access request denied' }, 403);
        }

        const request = await prisma.profileAccess.upsert({
          where: { ownerUserId_viewerUserId: { ownerUserId: targetUserId, viewerUserId } },
          update: { status: 'PENDING' },
          create: { ownerUserId: targetUserId, viewerUserId, status: 'PENDING' },
          select: { id: true, status: true }
        });

        // Create or get conversation and add system message for follow request
        try {
          const conversationId = await getOrCreateFollowConversation(targetUserId, viewerUserId);
          await createFollowRequestMessage(conversationId, viewerUserId, targetUserId);
        } catch (err) {
          // Log error but don't fail the request - conversation creation is secondary
          console.error('Failed to create follow request conversation:', err);
        }

        return json(res, { status: 'PENDING', requestId: request.id });
      }
    },
    {
      id: 'profiles.POST./profiles/:userId/access-grants',
      method: 'POST',
      path: '/profiles/:userId/access-grants',
      auth: Auth.owner('userId'),
      summary: 'Grant access to private profile content',
      tags: ['profiles'],
      handler: async (req, res) => {
        const userParsed = parsePositiveBigInt(req.params.userId, 'userId');
        if (!userParsed.ok) return json(res, { error: userParsed.error }, 400);
        const targetUserId = userParsed.value;
        const viewerParsed = parsePositiveBigInt(req.body?.viewerUserId, 'viewerUserId');
        if (!viewerParsed.ok) return json(res, { error: viewerParsed.error }, 400);
        const viewerUserId = viewerParsed.value;
        if (viewerUserId === targetUserId) {
          return json(res, { error: 'Cannot grant access to yourself' }, 400);
        }

        const viewerExists = await prisma.user.findFirst({
          where: { id: viewerUserId, deletedAt: null },
          select: { id: true }
        });
        if (!viewerExists) {
          return json(res, { error: 'User not found' }, 404);
        }

        const request = await prisma.profileAccess.upsert({
          where: { ownerUserId_viewerUserId: { ownerUserId: targetUserId, viewerUserId } },
          update: { status: 'GRANTED' },
          create: { ownerUserId: targetUserId, viewerUserId, status: 'GRANTED' },
          select: { id: true, status: true }
        });

        return json(res, { status: 'GRANTED', requestId: request.id });
      }
    },
    {
      id: 'profiles.PATCH./profiles/:userId',
      method: 'PATCH',
      path: '/profiles/:userId',
      auth: Auth.owner('userId'),
      summary: 'Update own profile',
      tags: ['profiles'],
      handler: async (req, res) => {
        const userParsed = parsePositiveBigInt(req.params.userId, 'userId');
        if (!userParsed.ok) return json(res, { error: userParsed.error }, 400);
        const userId = userParsed.value;
        const body = (req.body ?? {}) as any;
        const { displayName, bio, birthdate, locationText, lat, lng, gender, intent, isVisible } = body;
        const hasAvatar = Object.prototype.hasOwnProperty.call(body, 'avatarMediaId');
        const hasHero = Object.prototype.hasOwnProperty.call(body, 'heroMediaId');
        const avatarParsed = hasAvatar ? parseOptionalPositiveBigInt(body.avatarMediaId, 'avatarMediaId') : { ok: true as const, value: undefined };
        if (!avatarParsed.ok) return json(res, { error: avatarParsed.error }, 400);
        const heroParsed = hasHero ? parseOptionalPositiveBigInt(body.heroMediaId, 'heroMediaId') : { ok: true as const, value: undefined };
        if (!heroParsed.ok) return json(res, { error: heroParsed.error }, 400);

        const birthdateParsed = parseOptionalDate(birthdate, 'birthdate');
        if (!birthdateParsed.ok) return json(res, { error: birthdateParsed.error }, 400);
        const latParsed = parseOptionalNumber(lat, 'lat');
        if (!latParsed.ok) return json(res, { error: latParsed.error }, 400);
        const lngParsed = parseOptionalNumber(lng, 'lng');
        if (!lngParsed.ok) return json(res, { error: lngParsed.error }, 400);
        const visibleParsed = parseOptionalBoolean(isVisible, 'isVisible');
        if (!visibleParsed.ok) return json(res, { error: visibleParsed.error }, 400);

        try {
          if (avatarParsed.value) {
            await mediaService.assertProfileMedia(avatarParsed.value, userId);
          }
          if (heroParsed.value) {
            await mediaService.assertProfileMedia(heroParsed.value, userId);
          }
        } catch (err) {
          if (err instanceof MediaError) {
            return json(res, { error: err.message }, err.status);
          }
          throw err;
        }

        const updated = await prisma.profile.update({
          where: { userId },
          data: {
            displayName: displayName ?? undefined,
            bio: bio ?? undefined,
            birthdate: birthdateParsed.value,
            locationText: locationText ?? undefined,
            lat: latParsed.value,
            lng: lngParsed.value,
            gender: gender ?? undefined,
            intent: intent ?? undefined,
            isVisible: visibleParsed.value,
            ...(hasAvatar ? { avatarMediaId: avatarParsed.value ?? null } : {}),
            ...(hasHero ? { heroMediaId: heroParsed.value ?? null } : {})
          },
          select: { userId: true, updatedAt: true }
        });

        return json(res, updated);
      }
    },
    {
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
        if (raterUserId === targetUserId) return json(res, { error: 'Cannot rate yourself' }, 400);

        const { attractive, smart, funny, interesting } = (req.body ?? {}) as any;
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
        const data = {
          attractive: attractiveValue as number,
          smart: smartValue as number,
          funny: funnyValue as number,
          interesting: interestingValue as number
        };

        const profiles = await prisma.profile.findMany({
          where: { userId: { in: [raterUserId, targetUserId] }, deletedAt: null },
          select: { id: true, userId: true }
        });
        const raterProfileId = profiles.find((p) => p.userId === raterUserId)?.id;
        const targetProfileId = profiles.find((p) => p.userId === targetUserId)?.id;
        if (!raterProfileId || !targetProfileId) {
          return json(res, { error: 'Profile not found' }, 404);
        }

        await prisma.profileRating.upsert({
          where: { raterProfileId_targetProfileId: { raterProfileId, targetProfileId } },
          update: data,
          create: { raterProfileId, targetProfileId, ...data }
        });

        return json(res, { ok: true });
      }
    },
    {
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
        
        // Only profile owners can see their followers
        if (targetUserId !== me) {
          return json(res, { error: 'Forbidden' }, 403);
        }

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

        const followers = await prisma.profileAccess.findMany({
          where: {
            ownerUserId: targetUserId,
            status: { in: ['PENDING', 'GRANTED'] }
          },
          orderBy: { updatedAt: 'desc' },
          take: 100,
          select: {
            id: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            viewer: {
              select: {
                id: true,
                profile: {
                  select: {
                    displayName: true,
                    avatarMedia: { select: mediaSelect }
                  }
                }
              }
            }
          }
        });

        const followerIds = followers.map((f) => f.viewer.id);
        const compatibilityMap = await getCompatibilityMap(me, followerIds);

        const result = followers.map(f => ({
          requestId: f.id,
          userId: f.viewer.id,
          name: f.viewer.profile?.displayName ?? `User ${f.viewer.id}`,
          avatarUrl: toAvatarUrl(f.viewer.profile?.avatarMedia),
          status: f.status,
          requestedAt: f.createdAt.toISOString(),
          updatedAt: f.updatedAt.toISOString(),
          compatibility: resolveCompatibility(me, compatibilityMap, f.viewer.id)
        }));

        return json(res, { followers: result });
      }
    },
    {
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
        
        // Only profile owners can see who they follow
        if (targetUserId !== me) {
          return json(res, { error: 'Forbidden' }, 403);
        }

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

        const following = await prisma.profileAccess.findMany({
          where: {
            viewerUserId: targetUserId,
            status: { in: ['PENDING', 'GRANTED'] }
          },
          orderBy: { updatedAt: 'desc' },
          take: 100,
          select: {
            id: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            owner: {
              select: {
                id: true,
                profile: {
                  select: {
                    displayName: true,
                    avatarMedia: { select: mediaSelect }
                  }
                }
              }
            }
          }
        });

        const followingIds = following.map((f) => f.owner.id);
        const compatibilityMap = await getCompatibilityMap(me, followingIds);

        const result = following.map(f => ({
          requestId: f.id,
          userId: f.owner.id,
          name: f.owner.profile?.displayName ?? `User ${f.owner.id}`,
          avatarUrl: toAvatarUrl(f.owner.profile?.avatarMedia),
          status: f.status,
          requestedAt: f.createdAt.toISOString(),
          updatedAt: f.updatedAt.toISOString(),
          compatibility: resolveCompatibility(me, compatibilityMap, f.owner.id)
        }));

        return json(res, { following: result });
      }
    },
    {
      id: 'profiles.POST./profiles/access-requests/:requestId/approve',
      method: 'POST',
      path: '/profiles/access-requests/:requestId/approve',
      auth: Auth.user(),
      summary: 'Approve a follow request',
      tags: ['profiles'],
      handler: async (req, res) => {
        const requestParsed = parsePositiveBigInt(req.params.requestId, 'requestId');
        if (!requestParsed.ok) return json(res, { error: requestParsed.error }, 400);
        const requestId = requestParsed.value;
        const me = req.ctx.userId!;

        const access = await prisma.profileAccess.findUnique({
          where: { id: requestId },
          select: { id: true, ownerUserId: true, viewerUserId: true, status: true }
        });

        if (!access) {
          return json(res, { error: 'Follow request not found' }, 404);
        }

        if (access.ownerUserId !== me) {
          return json(res, { error: 'Forbidden' }, 403);
        }

        if (access.status === 'GRANTED') {
          return json(res, { status: 'GRANTED', requestId: access.id });
        }

        if (access.status !== 'PENDING') {
          return json(res, { error: 'Request is not pending' }, 400);
        }

        const updated = await prisma.profileAccess.update({
          where: { id: requestId },
          data: { status: 'GRANTED' },
          select: { id: true, status: true }
        });

        // Create system message for approval
        try {
          const conversationId = await getOrCreateFollowConversation(access.ownerUserId, access.viewerUserId);
          await createFollowResponseMessage(conversationId, access.ownerUserId, access.viewerUserId, true);
        } catch (err) {
          console.error('Failed to create follow approval message:', err);
        }

        return json(res, { status: 'GRANTED', requestId: updated.id });
      }
    },
    {
      id: 'profiles.POST./profiles/access-requests/:requestId/deny',
      method: 'POST',
      path: '/profiles/access-requests/:requestId/deny',
      auth: Auth.user(),
      summary: 'Deny a follow request',
      tags: ['profiles'],
      handler: async (req, res) => {
        const requestParsed = parsePositiveBigInt(req.params.requestId, 'requestId');
        if (!requestParsed.ok) return json(res, { error: requestParsed.error }, 400);
        const requestId = requestParsed.value;
        const me = req.ctx.userId!;

        const access = await prisma.profileAccess.findUnique({
          where: { id: requestId },
          select: { id: true, ownerUserId: true, viewerUserId: true, status: true }
        });

        if (!access) {
          return json(res, { error: 'Follow request not found' }, 404);
        }

        if (access.ownerUserId !== me) {
          return json(res, { error: 'Forbidden' }, 403);
        }

        if (access.status === 'DENIED') {
          return json(res, { status: 'DENIED', requestId: access.id });
        }

        const updated = await prisma.profileAccess.update({
          where: { id: requestId },
          data: { status: 'DENIED' },
          select: { id: true, status: true }
        });

        // Create system message for denial
        try {
          const conversationId = await getOrCreateFollowConversation(access.ownerUserId, access.viewerUserId);
          await createFollowResponseMessage(conversationId, access.ownerUserId, access.viewerUserId, false);
        } catch (err) {
          console.error('Failed to create follow denial message:', err);
        }

        return json(res, { status: 'DENIED', requestId: updated.id });
      }
    }
  ]
};
