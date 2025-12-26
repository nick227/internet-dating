import type { DomainRegistry } from '../../types.js';
import { Auth } from '../../../lib/auth/rules.js';
import { prisma } from '../../../lib/prisma/client.js';
import { json } from '../../../lib/http/json.js';
import { parseOptionalBoolean, parseOptionalDate, parseOptionalNumber, parseOptionalPositiveBigInt, parsePositiveBigInt } from '../../../lib/http/parse.js';
import { toAvatarUrl, toPublicMedia } from '../../../services/media/presenter.js';
import { mediaService, MediaError } from '../../../services/media/mediaService.js';

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

        const posts = await prisma.post.findMany({
          where: {
            userId: targetUserId,
            deletedAt: null,
            ...(isOwner ? {} : { visibility: 'PUBLIC' })
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
          where: { targetUserId },
          _avg: { attractive: true, smart: true, funny: true, interesting: true },
          _count: { _all: true }
        });

        // viewer's rating (if logged in)
        let myRating = null as any;
        if (viewerId) {
          myRating = await prisma.profileRating.findUnique({
            where: { raterUserId_targetUserId: { raterUserId: viewerId, targetUserId } },
            select: { attractive: true, smart: true, funny: true, interesting: true, createdAt: true }
          });
        }

        const { avatarMedia, heroMedia, ...profileData } = profile;
        const avatarUrl = toAvatarUrl(avatarMedia);
        const heroUrl = toAvatarUrl(heroMedia);

        return json(res, {
          profile: { ...profileData, avatarUrl, heroUrl },
          posts: posts.map(p => ({
            ...p,
            media: p.media.map(m => ({ order: m.order, media: toPublicMedia(m.media) }))
          })),
          ratings: {
            count: ratingAgg._count._all,
            avg: ratingAgg._avg,
            mine: myRating
          }
        });
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
        const avatarParsed = hasAvatar ? parseOptionalPositiveBigInt(body.avatarMediaId, 'avatarMediaId') : { ok: true, value: undefined };
        if (!avatarParsed.ok) return json(res, { error: avatarParsed.error }, 400);
        const heroParsed = hasHero ? parseOptionalPositiveBigInt(body.heroMediaId, 'heroMediaId') : { ok: true, value: undefined };
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

        await prisma.profileRating.upsert({
          where: { raterUserId_targetUserId: { raterUserId, targetUserId } },
          update: data,
          create: { raterUserId, targetUserId, ...data }
        });

        return json(res, { ok: true });
      }
    }
  ]
};
