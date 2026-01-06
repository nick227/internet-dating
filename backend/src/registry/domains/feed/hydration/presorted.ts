import { hydrateFeedItems, type HydratedFeedItem } from './index.js';
import type { ViewerContext } from '../types.js';
import type { PresortedFeedItem } from '../../../../services/feed/presortedFeedService.js';
import { prisma } from '../../../../lib/prisma/client.js';

/**
 * Hydrate presorted feed items (convert back to FeedItems format for hydration)
 */
export async function hydrateFeedItemsFromPresorted(
  ctx: ViewerContext,
  presortedItems: PresortedFeedItem[]
): Promise<HydratedFeedItem[]> {
  // Convert presorted items back to FeedItem format for hydration
  // This is a simplified version - in production, you'd want to optimize this
  const feedItems = await convertPresortedToFeedItems(presortedItems);

  // Use existing hydration logic
  return hydrateFeedItems(ctx, feedItems);
}

/**
 * Convert PresortedFeedItems back to FeedItems for hydration
 * This is a simplified conversion - in production, you might want to cache more data
 */
async function convertPresortedToFeedItems(
  presortedItems: PresortedFeedItem[]
): Promise<Array<{
  type: 'post' | 'suggestion' | 'question';
  post?: any;
  suggestion?: any;
  question?: any;
  actorId: bigint;
  source: 'post' | 'match' | 'suggested' | 'question';
  tier: 'everyone';
}>> {
  const postIds: bigint[] = [];
  const suggestionIds: bigint[] = [];
  const questionIds: bigint[] = [];

  for (const item of presortedItems) {
    if (item.type === 'post') {
      postIds.push(BigInt(item.id));
    } else if (item.type === 'suggestion') {
      suggestionIds.push(BigInt(item.id));
    } else if (item.type === 'question') {
      questionIds.push(BigInt(item.id));
    }
  }

  // Fetch full data in parallel
  const [posts, suggestions, questions] = await Promise.all([
    postIds.length > 0
      ? prisma.post.findMany({
          where: { id: { in: postIds } },
          select: {
            id: true,
            text: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                profile: {
                  select: {
                    displayName: true,
                  },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
    suggestionIds.length > 0
      ? prisma.profile.findMany({
          where: { userId: { in: suggestionIds } },
          select: {
            userId: true,
            displayName: true,
            bio: true,
            locationText: true,
            intent: true,
          },
        })
      : Promise.resolve([]),
    questionIds.length > 0
      ? prisma.quizQuestion.findMany({
          where: { id: { in: questionIds } },
          select: {
            id: true,
            quizId: true,
            prompt: true,
            order: true,
            quiz: {
              select: {
                title: true,
              },
            },
            options: {
              select: {
                id: true,
                label: true,
                value: true,
                order: true,
              },
              orderBy: { order: 'asc' },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  // Build maps for quick lookup
  const postMap = new Map(posts.map((p) => [p.id, p]));
  const suggestionMap = new Map(suggestions.map((s) => [s.userId, s]));
  const questionMap = new Map(questions.map((q) => [q.id, q]));

  // Convert to FeedItems
  const feedItems: Array<{
    type: 'post' | 'suggestion' | 'question';
    post?: any;
    suggestion?: any;
    question?: any;
    actorId: bigint;
    source: 'post' | 'match' | 'suggested' | 'question';
    tier: 'everyone';
  }> = [];
  for (const presorted of presortedItems) {
    if (presorted.type === 'post') {
      const post = postMap.get(BigInt(presorted.id));
      if (post) {
        feedItems.push({
          type: 'post' as const,
          post: {
            id: post.id,
            text: post.text,
            createdAt: post.createdAt,
            user: post.user,
            mediaType: presorted.mediaType,
            score: presorted.score,
            presentation: presorted.presentation,
          },
          actorId: presorted.actorId,
          source: presorted.source,
          tier: 'everyone',
        });
      }
    } else if (presorted.type === 'suggestion') {
      const suggestion = suggestionMap.get(BigInt(presorted.id));
      if (suggestion) {
        feedItems.push({
          type: 'suggestion' as const,
          suggestion: {
            userId: suggestion.userId,
            displayName: suggestion.displayName,
            bio: suggestion.bio,
            locationText: suggestion.locationText,
            intent: suggestion.intent,
            source: presorted.source,
            score: presorted.score,
            presentation: presorted.presentation,
          },
          actorId: presorted.actorId,
          source: presorted.source,
          tier: 'everyone',
        });
      }
    } else if (presorted.type === 'question') {
      const question = questionMap.get(BigInt(presorted.id));
      if (question) {
        feedItems.push({
          type: 'question' as const,
          question: {
            id: question.id,
            quizId: question.quizId,
            quizTitle: question.quiz.title,
            prompt: question.prompt,
            options: question.options,
            order: question.order,
            presentation: presorted.presentation,
          },
          actorId: presorted.actorId,
          source: 'question' as const,
          tier: 'everyone',
        });
      }
    }
  }

  return feedItems;
}
