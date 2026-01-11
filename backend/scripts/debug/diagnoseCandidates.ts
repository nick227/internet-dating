
import { prisma } from '../../src/lib/prisma/client';
import { getPostCandidates } from '../../src/registry/domains/feed/candidates/posts';
import type { ViewerContext } from '../../src/registry/domains/feed/types';

async function diagnoseCandidates() {
  const userId = BigInt(293);
  console.log(`Diagnosing candidates for user ${userId}...`);

  const ctx: ViewerContext = {
    userId,
    take: 50,
    cursorId: null,
    debug: false,
    seed: null,
    markSeen: false
  };

  const result = await getPostCandidates(ctx);
  console.log(`Found ${result.items.length} candidates.`);
  
  const counts = {
    text: 0,
    image: 0,
    video: 0,
    mixed: 0,
    undefined: 0
  };

  result.items.forEach(p => {
    const type = p.mediaType || 'undefined';
    counts[type] = (counts[type] || 0) + 1;
    if (type !== 'text') {
      console.log(`Post ${p.id}: type=${p.mediaType}, mediaCount=${p.media?.length}`);
    }
  });

  console.log('Distribution:', counts);
}

diagnoseCandidates()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
