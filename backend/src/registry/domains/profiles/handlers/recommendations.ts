import { Auth } from '../../../../lib/auth/rules.js';
import { json } from '../../../../lib/http/json.js';
import { parseLimit, parseOptionalNumber } from '../../../../lib/http/parse.js';
import { prisma } from '../../../../lib/prisma/client.js';
import { toAvatarUrl } from '../presenters/mediaPresenter.js';
import { loadBlockedUserIds } from '../loaders/searchLoader.js';
import { 
  loadMatchScoreCursor, 
  loadRecentMatchScores, 
  loadRecommendationProfiles,
  checkMatchScoresExist
} from '../loaders/recommendationsLoader.js';
import { computeLightweightScores } from '../services/lightweightScoring.js';
import { runMatchScoreJob } from '../../../../jobs/matchScoreJob.js';
import type { RouteDef } from '../../../../registry/types.js';

const CURRENT_ALGORITHM_VERSION = 'v1';

export const recommendationsRoute: RouteDef = {
  id: 'profiles.GET./profiles/recommendations',
  method: 'GET',
  path: '/profiles/recommendations',
  auth: Auth.user(),
  summary: 'Get personalized profile recommendations based on MatchScore',
  tags: ['profiles'],
  handler: async (req, res) => {
    try {
      // Ensure userId is set and valid
      if (!req.ctx?.userId) {
        return json(res, { error: 'Authentication required' }, 401);
      }
      
      // Validate userId is a valid bigint
      const viewerId = req.ctx.userId;
      if (typeof viewerId !== 'bigint' || viewerId <= 0n) {
        return json(res, { error: 'Invalid user ID' }, 401);
      }
      
      const { limit, cursor, radiusKm } = req.query;
      
      const limitParsed = parseLimit(limit, 20, 50, 'limit');
      if (!limitParsed.ok) {
        return json(res, { error: limitParsed.error }, 400);
      }
      const take = limitParsed.value;
      
      // Parse and validate radiusKm parameter
      const radiusKmParsed = parseOptionalNumber(radiusKm, 'radiusKm');
      if (!radiusKmParsed.ok) {
        return json(res, { error: radiusKmParsed.error }, 400);
      }
      const maxDistanceKm = radiusKmParsed.value;
      
      // Require viewer location when radiusKm is set
      if (maxDistanceKm !== undefined) {
        if (maxDistanceKm <= 0) {
          return json(res, { error: 'radiusKm must be greater than 0' }, 400);
        }
        
        const viewerProfile = await prisma.profile.findUnique({
          where: { userId: viewerId },
          select: { lat: true, lng: true }
        });
        
        if (!viewerProfile?.lat || !viewerProfile?.lng) {
          return json(res, { 
            error: 'Viewer location required for radiusKm. Please set your location in your profile.' 
          }, 400);
        }
      }
      
      // Over-fetch to account for filtering (blocked users, visibility, deleted, etc.)
      // Use 3x multiplier to handle >50% loss from filtering
      const fetchLimit = take * 3 + 1;
      
      // Parse cursor for pagination
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
        } catch (err) {
          // Invalid cursor, ignore (log at debug level in development)
          if (process.env.NODE_ENV === 'development') {
            console.debug('[recommendations] Invalid cursor format', { cursor, error: err });
          }
        }
      }
      
      if (cursorUserId && cursorScore === undefined) {
        const score = await loadMatchScoreCursor(viewerId, cursorUserId);
        cursorScore = score ?? undefined;
      }
      
      // TIERED FALLBACK: Try 7 days → 30 days → unlimited
      // ALGORITHM VERSION GATING: Prefer current version, fallback to any version
      let scoreRows: Array<{
        candidateUserId: bigint;
        score: number;
        reasons: unknown;
        distanceKm: number | null;
        algorithmVersion?: string | null;
      }> = [];
      let stale = false;
      let algorithmVersion: string | null = CURRENT_ALGORITHM_VERSION;
      
      // Tier 1: 7 days, current algorithm version
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      scoreRows = await loadRecentMatchScores(viewerId, {
        limit: fetchLimit,
        cursorUserId,
        cursorScore,
        minAge: sevenDaysAgo,
        algorithmVersion: CURRENT_ALGORITHM_VERSION,
        maxDistanceKm
      });
      
      // Tier 2: 30 days, current algorithm version
      if (scoreRows.length === 0) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        scoreRows = await loadRecentMatchScores(viewerId, {
          limit: fetchLimit,
          cursorUserId,
          cursorScore,
          minAge: thirtyDaysAgo,
          algorithmVersion: CURRENT_ALGORITHM_VERSION,
          maxDistanceKm
        });
        stale = true;
      }
      
      // Tier 3: Unlimited time, current algorithm version
      if (scoreRows.length === 0) {
        scoreRows = await loadRecentMatchScores(viewerId, {
          limit: fetchLimit,
          cursorUserId,
          cursorScore,
          minAge: undefined,
          algorithmVersion: CURRENT_ALGORITHM_VERSION,
          maxDistanceKm
        });
        stale = true;
      }
      
      // Tier 4: Unlimited time, any algorithm version (fallback)
      if (scoreRows.length === 0) {
        scoreRows = await loadRecentMatchScores(viewerId, {
          limit: fetchLimit,
          cursorUserId,
          cursorScore,
          minAge: undefined,
          algorithmVersion: undefined,
          maxDistanceKm
        });
        stale = true;
        algorithmVersion = scoreRows.length > 0 
          ? (scoreRows[0]?.algorithmVersion ?? 'mixed')
          : 'mixed';
      }
      
      // Observability: Log once per request
      const totalScoresFound = scoreRows.length;
      console.log('[recommendations] Scores loaded', {
        viewerId: viewerId.toString(),
        totalScoresFound,
        stale,
        algorithmVersion,
        window: stale ? 'expanded' : '7-day'
      });
      
      // NEW-USER ESCAPE HATCH: If no MatchScore rows exist at all, compute lightweight scores
      if (scoreRows.length === 0) {
        const scoresExist = await checkMatchScoresExist(viewerId);
        
        if (!scoresExist) {
          console.log('[recommendations] No match scores exist, computing lightweight scores', {
            viewerId: viewerId.toString()
          });
          
          // Compute lightweight scores (quiz + distance only)
          const lightweightScores = await computeLightweightScores(viewerId, fetchLimit);
          
          // Filter by distance if radiusKm is set
          let filteredLightweightScores = lightweightScores;
          if (maxDistanceKm !== undefined) {
            filteredLightweightScores = lightweightScores.filter(score => 
              score.distanceKm !== null && score.distanceKm <= maxDistanceKm
            );
          }
          
          // Enqueue full job async (don't wait)
          runMatchScoreJob({ userId: viewerId }).catch(err => {
            console.error('[recommendations] Failed to enqueue match score job', {
              viewerId: viewerId.toString(),
              error: err
            });
          });
          
          // Use lightweight scores (add source marker to reasons)
          scoreRows = filteredLightweightScores.map(score => ({
            candidateUserId: score.candidateUserId,
            score: score.score,
            reasons: {
              ...score.reasons,
              source: 'lightweight'
            },
            distanceKm: score.distanceKm,
            algorithmVersion: 'lightweight'
          }));
          stale = true;
          algorithmVersion = 'lightweight';
        }
      }
      
      // Determine page size and hasMore from the extra row we fetched
      const pageSize = take * 3;
      const hasMore = scoreRows.length > pageSize;
      const scoreRowsToUse = scoreRows.slice(0, pageSize);
      const candidateIds = scoreRowsToUse.map(row => row.candidateUserId);
      const scoreByUserId = new Map(scoreRowsToUse.map(row => [row.candidateUserId, row]));
      
      // Filter: blocked users and self
      const blockedUserIds = await loadBlockedUserIds(viewerId);
      const blockedSet = new Set(blockedUserIds);
      const filteredCandidateIds = candidateIds.filter(id => id !== viewerId && !blockedSet.has(id));
      
      // Observability: Log filtering results
      console.log('[recommendations] Filtering', {
        viewerId: viewerId.toString(),
        afterFreshnessFilter: candidateIds.length,
        blockedCount: blockedUserIds.length,
        selfFiltered: candidateIds.filter(id => id === viewerId).length,
        afterBlockFilter: filteredCandidateIds.length
      });
      
      // Load profiles (filters: deleted, visibility, etc.)
      const profiles = await loadRecommendationProfiles(filteredCandidateIds, viewerId);
      const profileMap = new Map(profiles.map(p => [p.userId, p]));
      const likedRows = await prisma.like.findMany({
        where: {
          fromUserId: viewerId,
          toUserId: { in: candidateIds },
          action: 'LIKE'
        },
        select: { toUserId: true }
      });
      const likedSet = new Set(likedRows.map(row => row.toUserId));
      
      // Observability: Log final results
      console.log('[recommendations] Final results', {
        viewerId: viewerId.toString(),
        afterVisibilityFilter: profiles.length,
        requestedProfiles: filteredCandidateIds.length
      });
      
      // Build response profiles
      const responseProfiles = candidateIds
        .filter(id => profileMap.has(id))
        .slice(0, take) // Final slice to requested limit
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
          
          // Add distance reason (guard against duplication with stricter check)
          if (scoreData?.distanceKm !== null && scoreData?.distanceKm !== undefined) {
            const distance = Math.round(scoreData.distanceKm);
            const distanceReason = `${distance} km away`;
            const hasDistance = matchReasons.some(r => /\bkm away\b/.test(r));
            if (!hasDistance) {
              matchReasons.push(distanceReason);
            }
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
            liked: likedSet.has(candidateId),
            matchReasons: matchReasons.length > 0 ? matchReasons : undefined
          };
        });
      
      // Determine the last scored row we actually served (in score order)
      // This ensures cursor continuity even if visibility changes between requests
      const servedIds = new Set(responseProfiles.map(p => BigInt(p.userId)));
      let lastServedRow: { candidateUserId: bigint; score: number } | null = null;
      for (const row of scoreRowsToUse) {
        if (servedIds.has(row.candidateUserId)) {
          lastServedRow = row;
        }
      }
      
      const nextCursor = hasMore && lastServedRow
        ? Buffer.from(JSON.stringify({ 
            userId: lastServedRow.candidateUserId.toString(),
            score: lastServedRow.score
          })).toString('base64')
        : null;
      
      return json(res, {
        profiles: responseProfiles,
        nextCursor,
        stale: stale || undefined // Only include if true
      });
    } catch (err) {
      console.error('[recommendations] Unexpected error', { 
        error: err,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined
      });
      return json(res, { error: 'Internal server error' }, 500);
    }
  }
};
