
import { prisma } from '../../src/lib/prisma/client';

async function inspectFeed() {
  const userId = BigInt(293);
  console.log(`Inspecting feed for user ${userId}...`);

  const segment = await prisma.presortedFeedSegment.findUnique({
    where: {
      userId_segmentIndex: {
        userId,
        segmentIndex: 0
      }
    }
  });

  if (!segment) {
    console.log('No feed segment found for user.');
    return;
  }

  console.log(`Segment found. Computed at: ${segment.computedAt}, Version: ${segment.algorithmVersion}`);
  const items = segment.items as any[];
  console.log(`Total items: ${items.length}`);
  
  items.slice(0, 10).forEach((item, idx) => {
    let details = '';
    if (item.type === 'post') {
        details = `MediaType: ${item.post?.mediaType}`;
    }
    console.log(`[${idx}] Type: ${item.type}, Pres: ${item.presentation?.mode || 'default'}, Source: ${item.source} (${details})`);
  });
}

inspectFeed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
