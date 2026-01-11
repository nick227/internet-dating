import { getCompatibilityMap, resolveCompatibility } from '../../../../services/compatibility/compatibilityService.js';
import { toPublicMedia } from '../../../../services/media/presenter.js';
import type {
  FeedItem,
  FeedPostCandidate,
  FeedPresentation,
  FeedQuestionCandidate,
  FeedStats,
  FeedSuggestionCandidate,
  ViewerContext
} from '../types.js';
import { buildPostMedia, buildSuggestionMedia } from './media.js';
import { buildFeedStats } from './stats.js';
import { buildPostCommentPreviews } from './comments.js';

type HydratedPost = Omit<FeedPostCandidate, 'media'> & {
  media: Array<{ order: number; media: ReturnType<typeof toPublicMedia> }>;
  stats: FeedStats | null;
  comments: { preview: Array<{ id: bigint; text: string }> };
  question: null;
  presentation?: FeedPresentation;
};

type HydratedSuggestion = FeedSuggestionCandidate & {
  media: Array<ReturnType<typeof toPublicMedia>>;
  stats: FeedStats | null;
  presentation?: FeedPresentation;
};

export type HydratedFeedItem = {
  type: 'post' | 'suggestion' | 'question';
  post?: HydratedPost;
  suggestion?: HydratedSuggestion;
  question?: FeedQuestionCandidate & { presentation?: FeedPresentation };
  actorId: bigint;
  source: 'post' | 'match' | 'suggested' | 'question';
  tier: 'self' | 'following' | 'followers' | 'everyone';
  presentation?: FeedPresentation; // Flattened to top level for frontend
};

export async function hydrateFeedItems(ctx: ViewerContext, rankedItems: FeedItem[]): Promise<HydratedFeedItem[]> {
  // Extract all posts and suggestions for batch hydration
  const posts: FeedPostCandidate[] = [];
  const suggestions: FeedSuggestionCandidate[] = [];
  
  for (const item of rankedItems) {
    if (item.type === 'post' && item.post) {
      posts.push(item.post);
    } else if (item.type === 'suggestion' && item.suggestion) {
      suggestions.push(item.suggestion);
    }
  }
  
  const [statsResult, commentResult, postMediaResult, mediaResult, compatibilityResult] =
    await Promise.allSettled([
      buildFeedStats(posts, suggestions, ctx.userId),
      buildPostCommentPreviews(posts.map((post) => post.id)),
      buildPostMedia(posts),
      buildSuggestionMedia(suggestions),
      getCompatibilityMap(ctx.userId, suggestions.map((s) => s.userId))
    ]);

  const statsByUserId =
    statsResult.status === 'fulfilled'
      ? statsResult.value.statsByUserId
      : new Map<bigint, FeedStats>();
  const postStatsByPostId =
    statsResult.status === 'fulfilled'
      ? statsResult.value.postStatsByPostId
      : new Map<bigint, Pick<FeedStats, 'likeCount' | 'commentCount'>>();
  const commentPreviewByPostId =
    commentResult.status === 'fulfilled'
      ? commentResult.value
      : new Map<bigint, { preview: Array<{ id: bigint; text: string }> }>();
  const postMediaByPostId =
    postMediaResult.status === 'fulfilled'
      ? postMediaResult.value
      : new Map<bigint, Array<{ order: number; media: ReturnType<typeof toPublicMedia> }>>();
  const mediaByUserId =
    mediaResult.status === 'fulfilled'
      ? mediaResult.value
      : new Map<bigint, Array<ReturnType<typeof toPublicMedia>>>();
  const compatibilityByUserId =
    compatibilityResult.status === 'fulfilled'
      ? compatibilityResult.value
      : new Map<bigint, { score: number | null; status: 'READY' | 'INSUFFICIENT_DATA' }>();
  
  // Hydrate items in ranked order
  const hydrated: HydratedFeedItem[] = [];
  
  for (const item of rankedItems) {
    if (item.type === 'post' && item.post) {
      const { score: _score, ...postBase } = item.post;
      const actorStats = statsByUserId.get(item.post.user.id) ?? null;
      const postStats = postStatsByPostId.get(item.post.id);
      const stats =
        actorStats || postStats ? { ...(actorStats ?? {}), ...(postStats ?? {}) } : null;
      hydrated.push({
        type: 'post',
        actorId: item.actorId,
        source: item.source,
        tier: item.tier,
        post: {
          ...postBase,
          media: postMediaByPostId.get(item.post.id) ?? [],
          stats,
          comments: commentPreviewByPostId.get(item.post.id) ?? { preview: [] },
          question: null,
          presentation: item.presentation ?? postBase.presentation
        }
      });
    } else if (item.type === 'suggestion' && item.suggestion) {
      const { score: _score, matchScore: _matchScore, ...suggestionBase } = item.suggestion;
      hydrated.push({
        type: 'suggestion',
        actorId: item.actorId,
        source: item.source,
        tier: item.tier,
        suggestion: {
          ...suggestionBase,
          media: mediaByUserId.get(item.suggestion.userId) ?? [],
          stats: statsByUserId.get(item.suggestion.userId) ?? null,
          compatibility: resolveCompatibility(ctx.userId, compatibilityByUserId, item.suggestion.userId),
          presentation: item.presentation ?? suggestionBase.presentation
        }
      });
    } else if (item.type === 'question' && item.question) {
      hydrated.push({
        type: 'question',
        actorId: item.actorId,
        source: item.source,
        tier: item.tier,
        question: {
          ...item.question,
          presentation: item.presentation ?? item.question.presentation
        }
      });
    }
  }
  
  return hydrated;
}
