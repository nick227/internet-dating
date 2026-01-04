import { prisma } from '../lib/prisma/client.js';

type SearchableUserJobOptions = {
  userBatchSize?: number;
  pauseMs?: number;
};

const DEFAULT_CONFIG = {
  userBatchSize: 100,
  pauseMs: 50
};

function sleep(ms: number) {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function buildSearchableUsers(options: SearchableUserJobOptions = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  
  // Get all visible, non-deleted profiles (viewer-agnostic)
  let skip = 0;
  let hasMore = true;
  
  while (hasMore) {
    const profiles = await prisma.profile.findMany({
      where: {
        isVisible: true,
        deletedAt: null,
        user: { deletedAt: null }
      },
      skip,
      take: config.userBatchSize,
      include: {
        user: true
      }
    });
    
    if (profiles.length === 0) {
      hasMore = false;
      break;
    }
    
    // Build searchable set (no block filtering here - viewer-agnostic)
    const searchable = profiles.map(p => ({
      userId: p.userId,
      isVisible: p.isVisible,
      isDeleted: p.user.deletedAt !== null
    }));
    
    // Upsert in batch
    await prisma.$transaction(
      searchable.map(s =>
        prisma.searchableUser.upsert({
          where: { userId: s.userId },
          create: s,
          update: s
        })
      )
    );
    
    skip += config.userBatchSize;
    await sleep(config.pauseMs);
  }
}

export async function buildSearchableUsersForAll(options: SearchableUserJobOptions = {}) {
  return buildSearchableUsers(options);
}
