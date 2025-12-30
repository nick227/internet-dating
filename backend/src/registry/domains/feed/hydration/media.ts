import { Prisma } from '@prisma/client';
import { prisma } from '../../../../lib/prisma/client.js';
import { toPublicMedia } from '../../../../services/media/presenter.js';
import type { FeedPostCandidate, FeedSuggestionCandidate } from '../types.js';

const SUGGESTION_MEDIA_LIMIT = 6;

export async function buildPostMedia(posts: FeedPostCandidate[]) {
  if (!posts.length) {
    return new Map<bigint, Array<{ order: number; media: ReturnType<typeof toPublicMedia> }>>();
  }
  const postIds = posts.map((post) => post.id);

  const rows = await prisma.postMedia.findMany({
    where: {
      postId: { in: postIds },
      post: { deletedAt: null, visibility: 'PUBLIC' },
      media: { deletedAt: null, visibility: 'PUBLIC', status: 'READY' }
    },
    select: {
      postId: true,
      order: true,
      media: {
        select: {
          id: true,
          type: true,
          url: true,
          thumbUrl: true,
          width: true,
          height: true,
          durationSec: true,
          storageKey: true,
          variants: true
        }
      }
    },
    orderBy: [{ postId: 'asc' }, { order: 'asc' }]
  });

  const mediaByPostId = new Map<bigint, Array<{ order: number; media: ReturnType<typeof toPublicMedia> }>>();
  for (const row of rows) {
    const existing = mediaByPostId.get(row.postId);
    const next = existing ?? [];
    next.push({ order: row.order, media: toPublicMedia(row.media) });
    if (!existing) {
      mediaByPostId.set(row.postId, next);
    }
  }

  return mediaByPostId;
}

export async function buildSuggestionMedia(suggestions: FeedSuggestionCandidate[]) {
  if (!suggestions.length) return new Map<bigint, Array<ReturnType<typeof toPublicMedia>>>();
  const userIds = suggestions.map((s) => s.userId);

  type MediaRow = {
    id: bigint;
    ownerUserId: bigint;
    type: string;
    url: string | null;
    thumbUrl: string | null;
    width: number | null;
    height: number | null;
    durationSec: number | null;
    storageKey: string | null;
    variants: unknown;
    rn: number;
  };

  const media = await prisma.$queryRaw<MediaRow[]>(Prisma.sql`
    SELECT \`id\`, \`ownerUserId\`, \`type\`, \`url\`, \`thumbUrl\`, \`width\`, \`height\`, \`durationSec\`, \`storageKey\`, \`variants\`, \`rn\`
    FROM (
      SELECT \`id\`, \`ownerUserId\`, \`type\`, \`url\`, \`thumbUrl\`, \`width\`, \`height\`, \`durationSec\`, \`storageKey\`, \`variants\`,
        ROW_NUMBER() OVER (PARTITION BY \`ownerUserId\` ORDER BY \`createdAt\` DESC, \`id\` DESC) AS \`rn\`
      FROM \`Media\`
      WHERE \`ownerUserId\` IN (${Prisma.join(userIds)})
        AND \`deletedAt\` IS NULL
        AND \`visibility\` = 'PUBLIC'
        AND \`status\` = 'READY'
    ) ranked
    WHERE \`rn\` <= ${SUGGESTION_MEDIA_LIMIT}
    ORDER BY \`ownerUserId\` ASC, \`rn\` ASC
  `);

  const mediaByUserId = new Map<bigint, Array<ReturnType<typeof toPublicMedia>>>();
  for (const item of media) {
    const existing = mediaByUserId.get(item.ownerUserId);
    const next = existing ?? [];
    next.push(toPublicMedia(item));
    if (!existing) {
      mediaByUserId.set(item.ownerUserId, next);
    }
  }

  return mediaByUserId;
}
