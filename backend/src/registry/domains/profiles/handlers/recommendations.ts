import { Auth } from '../../../../lib/auth/rules.js';
import { json } from '../../../../lib/http/json.js';
import { parseLimit } from '../../../../lib/http/parse.js';
import { toAvatarUrl } from '../presenters/mediaPresenter.js';
import { loadBlockedUserIds } from '../loaders/searchLoader.js';
import { 
  loadMatchScoreCursor, 
  loadRecentMatchScores, 
  loadRecommendationProfiles 
} from '../loaders/recommendationsLoader.js';
import type { RouteDef } from '../../../../registry/types.js';

export const recommendationsRoute: RouteDef = {
  id: 'profiles.GET./profiles/recommendations',
  method: 'GET',
  path: '/profiles/recommendations',
  auth: Auth.user(),
  summary: 'Get personalized profile recommendations based on MatchScore',
  tags: ['profiles'],
  handler: async (req, res) => {
    const viewerId = req.ctx.userId!;
    const { limit, cursor } = req.query;
    
    const limitParsed = parseLimit(limit, 20, 50, 'limit');
    if (!limitParsed.ok) return json(res, { error: limitParsed.error }, 400);
    const take = limitParsed.value;
    
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    
    let cursorUserId: bigint | undefined;
    let cursorScore: number | undefined;
    if (cursor && typeof cursor === 'string') {
      try {
        const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
        const parsed = JSON.parse(decoded) as { userId: string; score?: number };
        if (parsed.userId) {
          cursorUserId = BigInt(parsed.userId);
          cursorScore = parsed.score;
        }
      } catch {
        // Invalid cursor, ignore
      }
    }
    
    if (cursorUserId && cursorScore === undefined) {
      const score = await loadMatchScoreCursor(viewerId, cursorUserId);
      cursorScore = score ?? undefined;
    }
    
    const scored = await loadRecentMatchScores(viewerId, {
      limit: take,
      cursorUserId,
      cursorScore,
      minAge: oneDayAgo
    });
    
    const hasMore = scored.length > take;
    const scoreRows = hasMore ? scored.slice(0, take) : scored;
    
    if (scoreRows.length === 0) {
      return json(res, {
        profiles: [],
        nextCursor: null
      });
    }
    
    const candidateIds = scoreRows.map(row => row.candidateUserId);
    const scoreByUserId = new Map(scoreRows.map(row => [row.candidateUserId, row]));
    
    const blockedUserIds = await loadBlockedUserIds(viewerId);
    const blockedSet = new Set(blockedUserIds);
    const filteredCandidateIds = candidateIds.filter(id => id !== viewerId && !blockedSet.has(id));
    
    const profiles = await loadRecommendationProfiles(filteredCandidateIds, viewerId);
    const profileMap = new Map(profiles.map(p => [p.userId, p]));
    const responseProfiles = candidateIds
      .filter(id => profileMap.has(id))
      .map(candidateId => {
        const profile = profileMap.get(candidateId)!;
        const scoreData = scoreByUserId.get(candidateId);
        const matchReasons: string[] = [];
        
        if (scoreData?.reasons && typeof scoreData.reasons === 'object') {
          const reasons = scoreData.reasons as Record<string, unknown>;
          if (Array.isArray(reasons.reasons)) {
            matchReasons.push(...reasons.reasons.map(String));
          } else if (typeof reasons.reasons === 'string') {
            matchReasons.push(reasons.reasons);
          }
        }
        
        if (scoreData?.distanceKm !== null && scoreData?.distanceKm !== undefined) {
          const distance = Math.round(scoreData.distanceKm);
          matchReasons.push(`${distance} km away`);
        }
        
        return {
          userId: String(profile.userId),
          displayName: profile.displayName,
          bio: profile.bio,
          avatarUrl: toAvatarUrl(profile.avatarMedia),
          heroUrl: toAvatarUrl(profile.heroMedia),
          locationText: profile.locationText,
          age: profile.birthdate ? (() => {
            const today = new Date();
            const birth = new Date(profile.birthdate);
            let age = today.getFullYear() - birth.getFullYear();
            const monthDiff = today.getMonth() - birth.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
              age--;
            }
            return age > 0 ? age : null;
          })() : null,
          gender: profile.gender,
          intent: profile.intent,
          matchReasons: matchReasons.length > 0 ? matchReasons : undefined
        };
      });
    
    const nextCursor = hasMore && scoreRows.length > 0
      ? Buffer.from(JSON.stringify({ 
          userId: scoreRows[scoreRows.length - 1].candidateUserId.toString(),
          score: scoreRows[scoreRows.length - 1].score
        })).toString('base64')
      : null;
    
    return json(res, {
      profiles: responseProfiles,
      nextCursor
    });
  }
};
