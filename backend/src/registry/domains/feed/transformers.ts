// Feed item transformation functions
import type { FeedGridChildItem, FeedItemOrGrid } from './types.js';
import type { HydratedFeedItem } from './hydration/index.js';
import { FeedItemKind } from './constants.js';

export type Phase1LeafItem = {
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
    mode: 'single' | 'mosaic' | 'grid' | 'question' | 'highlight';
    accent?: 'match' | 'boost' | 'new' | null;
  } | null;
};

/**
 * Transform hydrated feed item to Phase-1 lite format
 * Centralizes the duplicate transformation logic
 */
export function toPhase1LeafItem(
  item: FeedItemOrGrid | HydratedFeedItem | FeedGridChildItem
): Phase1LeafItem {
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

export type Phase1Card = {
  cardType: 'single' | 'grid';
  presentation?: {
    mode: 'single' | 'mosaic' | 'grid' | 'question' | 'highlight';
    accent?: 'match' | 'boost' | 'new' | null;
  } | null;
  items: Phase1LeafItem[];
};

export function toPhase1Card(item: FeedItemOrGrid | HydratedFeedItem): Phase1Card {
  if (item.type === 'grid') {
    return {
      cardType: 'grid',
      presentation: item.presentation ?? { mode: 'grid' },
      items: item.grid.items.map((child) => toPhase1LeafItem(child)),
    };
  }

  const presentation =
    item.presentation ??
    item.post?.presentation ??
    item.suggestion?.presentation ??
    item.question?.presentation ??
    null;

  return {
    cardType: 'single',
    presentation,
    items: [toPhase1LeafItem(item)],
  };
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
// Cursor should always reflect the most recent post ID, never the grid wrapper.
export function getNextPostCursorId(
  items: Array<
    | { type: string; post?: { id: bigint } }
    | { items?: Array<{ type: string; post?: { id: bigint } }> }
  >
): string | null {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    if ('type' in item && item.type === 'post' && item.post) {
      return String(item.post.id);
    }
    if ('items' in item && item.items?.length) {
      for (let j = item.items.length - 1; j >= 0; j -= 1) {
        const child = item.items[j];
        if (child.type === 'post' && child.post) {
          return String(child.post.id);
        }
      }
    }
  }
  return null;
}
