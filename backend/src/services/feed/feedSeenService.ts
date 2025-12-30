import { prisma } from '../../lib/prisma/client.js';

export type FeedSeenItem = {
  itemType: 'POST' | 'SUGGESTION';
  itemId: bigint;
};

export async function fetchFeedSeen(
  viewerUserId: bigint,
  itemType: FeedSeenItem['itemType'],
  itemIds: bigint[]
): Promise<Map<bigint, Date>> {
  if (!itemIds.length) return new Map();
  const rows = await prisma.feedSeen.findMany({
    where: { viewerUserId, itemType, itemId: { in: itemIds } },
    select: { itemId: true, seenAt: true }
  });
  const map = new Map<bigint, Date>();
  for (const row of rows) {
    map.set(row.itemId, row.seenAt);
  }
  return map;
}

export async function recordFeedSeen(viewerUserId: bigint, items: FeedSeenItem[]) {
  if (!items.length) return;
  const seenAt = new Date();
  const idsByType = new Map<FeedSeenItem['itemType'], Set<bigint>>();
  for (const item of items) {
    const set = idsByType.get(item.itemType);
    if (set) {
      set.add(item.itemId);
    } else {
      idsByType.set(item.itemType, new Set([item.itemId]));
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const [itemType, idSet] of idsByType) {
      const itemIds = Array.from(idSet);
      if (!itemIds.length) continue;

      await tx.feedSeen.createMany({
        data: itemIds.map((itemId) => ({ viewerUserId, itemType, itemId, seenAt })),
        skipDuplicates: true
      });

      await tx.feedSeen.updateMany({
        where: { viewerUserId, itemType, itemId: { in: itemIds } },
        data: { seenAt }
      });
    }
  });
}
