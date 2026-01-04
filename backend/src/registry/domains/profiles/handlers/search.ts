import { Auth } from '../../../../lib/auth/rules.js';
import { json } from '../../../../lib/http/json.js';
import { parseLimit, parseOptionalNumber } from '../../../../lib/http/parse.js';
import { searchRateLimit } from '../../../../middleware/searchRateLimit.js';
import { ProfileSearchQueryBuilder, type SearchParams } from '../../../../services/search/profileSearchQueryBuilder.js';
import { prisma } from '../../../../lib/prisma/client.js';
import { toAvatarUrl } from '../presenters/mediaPresenter.js';
import { loadBlockedUserIds, loadSearchProfiles } from '../loaders/searchLoader.js';
import type { RouteDef } from '../../../../registry/types.js';

export const searchRoute: RouteDef = {
  id: 'profiles.GET./profiles/search',
  method: 'GET',
  path: '/profiles/search',
  auth: Auth.public(),
  summary: 'Search users for @mention autocomplete',
  tags: ['profiles'],
  handler: async (req, res) => {
    const viewerId = req.ctx.userId;
    const { q, limit } = req.query;

    if (!q || typeof q !== 'string' || q.trim().length < 2) {
      return json(res, { error: 'q parameter is required and must be at least 2 characters' }, 400);
    }

    const limitParsed = parseLimit(limit, 10, 20, 'limit');
    if (!limitParsed.ok) return json(res, { error: limitParsed.error }, 400);
    const take = limitParsed.value;

    const searchQuery = q.trim().toLowerCase();
    const blockedUserIds = await loadBlockedUserIds(viewerId);
    const profiles = await loadSearchProfiles(searchQuery, viewerId, blockedUserIds, take);

    const users = profiles.map(profile => ({
      id: String(profile.userId),
      name: profile.displayName ?? 'Anonymous',
      displayName: profile.displayName ?? '',
      avatarUrl: toAvatarUrl(profile.avatarMedia),
    }));

    return json(res, { users });
  }
};

export const advancedSearchRoute: RouteDef = {
  id: 'profiles.GET./profiles/advanced-search',
  method: 'GET',
  path: '/profiles/advanced-search',
  auth: Auth.public(),
  summary: 'Advanced profile search with multiple filters',
  tags: ['profiles'],
  handler: searchRateLimit(async (req, res) => {
    const viewerId = req.ctx.userId ?? undefined;
    const { q, gender, intent, ageMin, ageMax, location, interests, interestSubjects, traits, top5Query, top5Type, sort, limit, cursor } = req.query;
    
    const limitParsed = parseLimit(limit, 20, 50, 'limit');
    if (!limitParsed.ok) return json(res, { error: limitParsed.error }, 400);
    const take = limitParsed.value;
    
    const ageMinParsed = ageMin ? parseOptionalNumber(ageMin, 'ageMin') : { ok: true as const, value: undefined };
    const ageMaxParsed = ageMax ? parseOptionalNumber(ageMax, 'ageMax') : { ok: true as const, value: undefined };
    if (!ageMinParsed.ok) return json(res, { error: ageMinParsed.error }, 400);
    if (!ageMaxParsed.ok) return json(res, { error: ageMaxParsed.error }, 400);
    if (ageMinParsed.value !== undefined && ageMaxParsed.value !== undefined && ageMinParsed.value > ageMaxParsed.value) {
      return json(res, { error: 'ageMin must be <= ageMax' }, 400);
    }
    
    const sortValue = (sort as string) || 'newest';
    if (sortValue !== 'newest' && sortValue !== 'age') {
      return json(res, { error: 'Invalid sort value. Supported: newest, age' }, 400);
    }
    
    const genderArray = Array.isArray(gender) ? gender as string[] : gender ? [gender as string] : undefined;
    const intentArray = Array.isArray(intent) ? intent as string[] : intent ? [intent as string] : undefined;
    const interestsArray = Array.isArray(interests) ? interests.map(String) : interests ? [String(interests)] : undefined;
    const interestSubjectsArray = Array.isArray(interestSubjects) ? interestSubjects.map(String) : interestSubjects ? [String(interestSubjects)] : undefined;
    
    if (q && String(q).length > 100) {
      return json(res, { error: 'Text search query must be 100 characters or less' }, 400);
    }
    
    if (location && String(location).length > 100) {
      return json(res, { error: 'Location query must be 100 characters or less' }, 400);
    }
    
    if (interestsArray && interestsArray.length > 5) {
      return json(res, { error: 'Maximum 5 interest filters allowed' }, 400);
    }
    
    let traitsArray: Array<{ key: string; min?: number; max?: number; group?: string }> | undefined;
    if (traits) {
      try {
        let parsed: unknown;
        if (typeof traits === 'string' && traits.startsWith('ey')) {
          const decoded = Buffer.from(traits, 'base64').toString('utf-8');
          parsed = JSON.parse(decoded);
        } else if (Array.isArray(traits)) {
          parsed = traits;
        } else {
          parsed = JSON.parse(String(traits));
        }
        
        if (Array.isArray(parsed)) {
          if (parsed.length > 3) {
            return json(res, { error: 'Maximum 3 trait filters allowed' }, 400);
          }
          traitsArray = parsed.map((t: unknown) => {
            const tObj = t as Record<string, unknown>;
            return {
              key: String(tObj.key),
              min: tObj.min !== undefined ? Number(tObj.min) : undefined,
              max: tObj.max !== undefined ? Number(tObj.max) : undefined,
              group: tObj.group ? String(tObj.group) : undefined
            };
          });
        }
      } catch (e) {
        return json(res, { error: 'Invalid traits format' }, 400);
      }
    }
    
    const searchParams: SearchParams = {
      q: q ? String(q).trim() : undefined,
      gender: genderArray,
      intent: intentArray,
      ageMin: ageMinParsed.value,
      ageMax: ageMaxParsed.value,
      location: location ? String(location).trim() : undefined,
      interests: interestsArray,
      interestSubjects: interestSubjectsArray,
      traits: traitsArray,
      top5Query: top5Query ? String(top5Query).trim() : undefined,
      top5Type: top5Type as 'title' | 'item' | undefined,
      sort: sortValue as 'newest' | 'age',
      limit: take,
      cursor: cursor ? String(cursor) : undefined
    };
    
    const builder = new ProfileSearchQueryBuilder(searchParams, viewerId);
    await builder.initialize();
    
    if (viewerId) {
      const currentBaseIds = builder.getBaseUserIds();
      builder.setBaseUserIds(currentBaseIds.filter(id => id !== viewerId));
    }
    
    const queryArgs = await builder.build();
    const results = await prisma.profileSearchIndex.findMany(queryArgs);
    const hasMore = results.length > take;
    const profiles = hasMore ? results.slice(0, take) : results;
    
    const userIds = profiles.map(p => p.userId);
    const fullProfiles = await prisma.profile.findMany({
      where: {
        userId: { in: userIds },
        deletedAt: null,
        user: { deletedAt: null }
      },
      select: {
        userId: true,
        displayName: true,
        bio: true,
        locationText: true,
        birthdate: true,
        gender: true,
        intent: true,
        avatarMedia: {
          select: {
            id: true,
            type: true,
            storageKey: true,
            variants: true,
            url: true,
            thumbUrl: true
          }
        },
        heroMedia: {
          select: {
            id: true,
            type: true,
            storageKey: true,
            variants: true,
            url: true,
            thumbUrl: true
          }
        }
      }
    });
    
    const profileMap = new Map(fullProfiles.map(p => [p.userId, p]));
    const responseProfiles = profiles
      .filter(p => profileMap.has(p.userId))
      .map(p => {
        const profile = profileMap.get(p.userId)!;
        const matchReasons: string[] = [];
        
        if (searchParams.ageMin || searchParams.ageMax) {
          matchReasons.push(`Age: ${p.age ?? 'N/A'}`);
        }
        if (searchParams.interests && searchParams.interests.length > 0) {
          matchReasons.push(`Matches ${searchParams.interests.length} interest${searchParams.interests.length > 1 ? 's' : ''}`);
        }
        if (searchParams.location) {
          matchReasons.push(`Location: ${p.locationText ?? 'N/A'}`);
        }
        
        return {
          userId: String(p.userId),
          displayName: p.displayName,
          bio: p.bio,
          avatarUrl: toAvatarUrl(profile.avatarMedia),
          heroUrl: toAvatarUrl(profile.heroMedia),
          locationText: p.locationText,
          age: p.age,
          gender: p.gender,
          intent: p.intent,
          matchReasons: matchReasons.length > 0 ? matchReasons : undefined
        };
      });
    
    const nextCursor = hasMore && profiles.length > 0
      ? builder.encodeCursor(profiles[profiles.length - 1].userId)
      : null;
    
    return json(res, {
      profiles: responseProfiles,
      nextCursor
    });
  })
};

export const traitsRoute: RouteDef = {
  id: 'profiles.GET./profiles/search/traits',
  method: 'GET',
  path: '/profiles/search/traits',
  auth: Auth.public(),
  summary: 'Get available trait keys for search filters',
  tags: ['profiles'],
  handler: async (req, res) => {
    const ALLOWED_PREFIXES = ['personality', 'values'];
    
    const traits = await prisma.userTrait.groupBy({
      by: ['traitKey'],
      _count: { traitKey: true },
      orderBy: { traitKey: 'asc' }
    });
    
    const filtered = traits.filter(t => {
      const prefix = t.traitKey.split('.')[0];
      return ALLOWED_PREFIXES.includes(prefix);
    });
    
    const grouped = filtered.reduce((acc, t) => {
      const prefix = t.traitKey.split('.')[0];
      if (!acc[prefix]) acc[prefix] = [];
      acc[prefix].push({
        key: t.traitKey,
        count: t._count.traitKey
      });
      return acc;
    }, {} as Record<string, Array<{ key: string; count: number }>>);
    
    return json(res, { traits: grouped });
  }
};
