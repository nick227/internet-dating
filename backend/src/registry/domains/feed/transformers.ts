// Feed item transformation functions
import type { FeedItem } from './types.js';
import type { HydratedFeedItem } from './hydration/index.js';
import { FeedItemKind } from './constants.js';

export type Phase1Item = {
  id: string;
  kind: 'post' | 'profile' | 'question';
  actor: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
  textPreview: string | null;
  createdAt: number;
  presentation: {
    mode: 'single' | 'mosaic' | 'question' | 'highlight';
    accent?: 'match' | 'boost' | 'new' | null;
  } | null;
};

/**
 * Transform hydrated feed item to Phase-1 lite format
 * Centralizes the duplicate transformation logic
 */
export function toPhase1Item(item: FeedItem | HydratedFeedItem): Phase1Item {
  if (item.type === 'post' && item.post) {
    return {
      id: String(item.post.id),
      kind: FeedItemKind.POST,
      actor: {
        id: String(item.post.user.id),
        name: item.post.user.profile?.displayName ?? 'User',
        avatarUrl: null,
      },
      textPreview: truncateText(item.post.text, 150),
      createdAt: new Date(item.post.createdAt).getTime(),
      presentation: item.post.presentation ?? null,
    };
  }

  if (item.type === 'suggestion' && item.suggestion) {
    return {
      id: String(item.suggestion.userId),
      kind: FeedItemKind.PROFILE,
      actor: {
        id: String(item.suggestion.userId),
        name: item.suggestion.displayName ?? 'User',
        avatarUrl: null,
      },
      textPreview: truncateText(item.suggestion.bio, 150),
      createdAt: Date.now(),
      presentation: item.suggestion.presentation ?? null,
    };
  }

  if (item.type === 'question' && item.question) {
    return {
      id: String(item.question.id),
      kind: FeedItemKind.QUESTION,
      actor: {
        id: '0',
        name: 'System',
        avatarUrl: null,
      },
      textPreview: item.question.prompt ?? null,
      createdAt: Date.now(),
      presentation: item.question.presentation ?? { mode: 'question' },
    };
  }

  throw new Error(`Unknown item type: ${(item as { type: string }).type}`);
}

/**
 * Truncate text to specified length with ellipsis
 */
function truncateText(text: string | null | undefined, maxLength: number): string | null {
  if (!text) return null;
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

/**
 * Extract next post cursor from items
 */
export function getNextPostCursorId(
  items: Array<{ type: string; post?: { id: bigint } }>
): string | null {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (item.type === 'post' && item.post) {
      return String(item.post.id);
    }
  }
  return null;
}
