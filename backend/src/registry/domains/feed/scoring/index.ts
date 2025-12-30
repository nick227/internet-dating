import { feedConfig } from '../config.js';
import { prisma } from '../../../../lib/prisma/client.js';
import { fetchFeedSeen } from '../../../../services/feed/feedSeenService.js';
import type { FeedCandidateSet, FeedDebugSummary, ViewerContext } from '../types.js';

const SCORE_WEIGHTS = feedConfig.scoring.weights;

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function recencyScore(createdAt: Date) {
  const hours = Math.max(0, (Date.now() - createdAt.getTime()) / (1000 * 60 * 60));
  // 1 / log(2 + hours) keeps score in (0,1] without infinity at t=0.
  const score = 1 / Math.log(2 + hours);
  return clampScore(score);
}

async function fetchPostMediaTypes(postIds: bigint[]) {
  if (!postIds.length) return new Map<bigint, 'text' | 'image' | 'video' | 'mixed'>();
  const rows = await prisma.postMedia.findMany({
    where: { postId: { in: postIds } },
    select: { postId: true, media: { select: { type: true } } }
  });

  const flagsByPostId = new Map<bigint, { hasImage: boolean; hasVideo: boolean }>();
  for (const row of rows) {
    const flags = flagsByPostId.get(row.postId) ?? { hasImage: false, hasVideo: false };
    if (row.media.type === 'VIDEO') flags.hasVideo = true;
    if (row.media.type === 'IMAGE') flags.hasImage = true;
    flagsByPostId.set(row.postId, flags);
  }

  const typeByPostId = new Map<bigint, 'text' | 'image' | 'video' | 'mixed'>();
  for (const postId of postIds) {
    const flags = flagsByPostId.get(postId);
    if (!flags) {
      typeByPostId.set(postId, 'text');
    } else if (flags.hasVideo && flags.hasImage) {
      typeByPostId.set(postId, 'mixed');
    } else if (flags.hasVideo) {
      typeByPostId.set(postId, 'video');
    } else if (flags.hasImage) {
      typeByPostId.set(postId, 'image');
    } else {
      typeByPostId.set(postId, 'text');
    }
  }

  return typeByPostId;
}

function buildDebugSummary(candidates: FeedCandidateSet): FeedDebugSummary {
  const questions = candidates.questions ?? [];
  return {
    seed: null,
    candidates: {
      postIds: candidates.posts.map((post) => String(post.id)),
      suggestionUserIds: candidates.suggestions.map((suggestion) => String(suggestion.userId)),
      questionIds: questions.map((question) => String(question.id)),
      counts: {
        posts: candidates.posts.length,
        suggestions: candidates.suggestions.length,
        questions: questions.length
      }
    },
    dedupe: {
      postDuplicates: 0,
      suggestionDuplicates: 0,
      questionDuplicates: 0,
      crossSourceRemoved: 0
    },
    seen: {
      windowHours: feedConfig.seenWindowHours,
      demotedPosts: 0,
      demotedSuggestions: 0
    }
  };
}

function dedupeCandidates(candidates: FeedCandidateSet, debug: FeedDebugSummary | null) {
  const questionItems = candidates.questions ?? [];
  const dedupedPosts: FeedCandidateSet['posts'] = [];
  const seenPostIds = new Set<bigint>();
  const postActorIds = new Set<bigint>();

  for (const post of candidates.posts) {
    if (seenPostIds.has(post.id)) {
      if (debug) debug.dedupe.postDuplicates += 1;
      continue;
    }
    seenPostIds.add(post.id);
    postActorIds.add(post.user.id);
    dedupedPosts.push(post);
  }

  const dedupedSuggestions: FeedCandidateSet['suggestions'] = [];
  const seenSuggestionIds = new Set<bigint>();
  for (const suggestion of candidates.suggestions) {
    if (postActorIds.has(suggestion.userId)) {
      if (debug) debug.dedupe.crossSourceRemoved += 1;
      continue;
    }
    if (seenSuggestionIds.has(suggestion.userId)) {
      if (debug) debug.dedupe.suggestionDuplicates += 1;
      continue;
    }
    seenSuggestionIds.add(suggestion.userId);
    dedupedSuggestions.push(suggestion);
  }

  const dedupedQuestions: FeedCandidateSet['questions'] = [];
  const seenQuestionIds = new Set<bigint>();
  for (const question of questionItems) {
    if (seenQuestionIds.has(question.id)) {
      if (debug && debug.dedupe.questionDuplicates != null) {
        debug.dedupe.questionDuplicates += 1;
      }
      continue;
    }
    seenQuestionIds.add(question.id);
    dedupedQuestions.push(question);
  }

  if (debug) {
    debug.candidates.postIds = dedupedPosts.map((post) => String(post.id));
    debug.candidates.suggestionUserIds = dedupedSuggestions.map((suggestion) => String(suggestion.userId));
    debug.candidates.questionIds = dedupedQuestions.map((question) => String(question.id));
    debug.candidates.counts = {
      posts: dedupedPosts.length,
      suggestions: dedupedSuggestions.length,
      questions: dedupedQuestions.length
    };
  }

  return { posts: dedupedPosts, suggestions: dedupedSuggestions, questions: dedupedQuestions };
}

async function fetchSeenMaps(ctx: ViewerContext, candidates: FeedCandidateSet) {
  if (!ctx.userId) {
    return {
      postSeenMap: new Map<bigint, Date>(),
      suggestionSeenMap: new Map<bigint, Date>()
    };
  }

  const postIds = candidates.posts.map((post) => post.id);
  const suggestionIds = candidates.suggestions.map((suggestion) => suggestion.userId);
  const [postSeenMap, suggestionSeenMap] = await Promise.all([
    fetchFeedSeen(ctx.userId, 'POST', postIds),
    fetchFeedSeen(ctx.userId, 'SUGGESTION', suggestionIds)
  ]);

  return { postSeenMap, suggestionSeenMap };
}

export async function scoreCandidates(ctx: ViewerContext, candidates: FeedCandidateSet): Promise<FeedCandidateSet> {
  const debug = ctx.debug ? buildDebugSummary(candidates) : null;
  if (debug) {
    debug.seed = ctx.seed ?? null;
  }

  const deduped = dedupeCandidates(candidates, debug);
  const { postSeenMap, suggestionSeenMap } = await fetchSeenMaps(ctx, deduped);
  const postMediaTypes = await fetchPostMediaTypes(deduped.posts.map((post) => post.id));
  const cutoff = Date.now() - feedConfig.seenWindowHours * 60 * 60 * 1000;

  const scoredPosts = deduped.posts
    .map((post) => {
      const recency = recencyScore(post.createdAt);
      const affinity = 0;
      const quality = 0;
      const seenAt = postSeenMap.get(post.id);
      const isSeen = Boolean(seenAt && seenAt.getTime() >= cutoff);
      const seenPenalty = isSeen ? 1 : 0;
      if (debug && isSeen) debug.seen.demotedPosts += 1;
      const mediaType = postMediaTypes.get(post.id) ?? 'text';
      const score =
        recency * SCORE_WEIGHTS.recency +
        affinity * SCORE_WEIGHTS.affinity +
        quality * SCORE_WEIGHTS.quality -
        seenPenalty * SCORE_WEIGHTS.seenPenalty;

      return { ...post, mediaType, score: clampScore(score) };
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const scoredSuggestions = deduped.suggestions
    .map((suggestion) => {
      const recency = 0;
      const affinity = suggestion.source === 'match' ? 1 : suggestion.matchScore ?? 0;
      const quality = 0;
      const seenAt = suggestionSeenMap.get(suggestion.userId);
      const isSeen = Boolean(seenAt && seenAt.getTime() >= cutoff);
      const seenPenalty = isSeen ? 1 : 0;
      if (debug && isSeen) debug.seen.demotedSuggestions += 1;
      const score =
        recency * SCORE_WEIGHTS.recency +
        affinity * SCORE_WEIGHTS.affinity +
        quality * SCORE_WEIGHTS.quality -
        seenPenalty * SCORE_WEIGHTS.seenPenalty;

      return { ...suggestion, score: clampScore(score) };
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  if (ctx.debug && debug) {
    return { posts: scoredPosts, suggestions: scoredSuggestions, questions: deduped.questions, debug };
  }

  return { posts: scoredPosts, suggestions: scoredSuggestions, questions: deduped.questions };
}
