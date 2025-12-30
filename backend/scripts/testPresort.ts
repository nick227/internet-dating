import { prisma } from '../src/lib/prisma/client.js';

async function main() {
  console.log('Checking presorted feed segments...\n');

  // Check for segments
  const segments = await prisma.presortedFeedSegment.findMany({
    take: 5,
    orderBy: { computedAt: 'desc' },
    select: {
      id: true,
      userId: true,
      segmentIndex: true,
      algorithmVersion: true,
      computedAt: true,
      expiresAt: true,
    },
  });

  console.log(`Found ${segments.length} segment(s):\n`);
  for (const seg of segments) {
    console.log(`Segment ID: ${seg.id}`);
    console.log(`  User ID: ${seg.userId}`);
    console.log(`  Segment Index: ${seg.segmentIndex}`);
    console.log(`  Algorithm Version: ${seg.algorithmVersion}`);
    console.log(`  Computed At: ${seg.computedAt.toISOString()}`);
    console.log(`  Expires At: ${seg.expiresAt.toISOString()}`);
    console.log(`  Is Expired: ${seg.expiresAt < new Date()}`);
    console.log('');
  }

  // Check specific user segment
  if (segments.length > 0) {
    const userId = segments[0]!.userId;
    const segment = await prisma.presortedFeedSegment.findFirst({
      where: { userId, segmentIndex: 0 },
      select: {
        id: true,
        items: true,
        phase1Json: true,
      },
    });

    if (segment) {
      const items = segment.items as unknown[];
      console.log(`\nSegment 0 for user ${userId}:`);
      console.log(`  Items count: ${Array.isArray(items) ? items.length : 'N/A'}`);
      console.log(`  Phase1 JSON length: ${segment.phase1Json?.length ?? 0} bytes`);
      if (segment.phase1Json) {
        try {
          const parsed = JSON.parse(segment.phase1Json);
          console.log(`  Phase1 JSON items: ${parsed.items?.length ?? 0}`);
          console.log(`  Phase1 JSON preview: ${JSON.stringify(parsed).substring(0, 200)}...`);
        } catch (e) {
          console.log(`  Phase1 JSON parse error: ${e}`);
        }
      }
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
