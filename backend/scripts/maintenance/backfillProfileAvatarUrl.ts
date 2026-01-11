import { prisma } from '../../src/lib/prisma/client.js';
import { buildMediaUrls } from '../../src/services/media/urlBuilder.js';

const BATCH_SIZE = 200;
const PAUSE_MS = 50;

function sleep(ms: number) {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const cleared = await prisma.profile.updateMany({
    where: { avatarMediaId: null, avatarUrl: { not: null } },
    data: { avatarUrl: null }
  });
  if (cleared.count > 0) {
    console.log(`[backfill-avatar-url] Cleared ${cleared.count} stale avatarUrl values`);
  }

  let lastId: bigint | null = null;
  let updated = 0;

  for (;;) {
    const profiles = await prisma.profile.findMany({
      where: {
        avatarMediaId: { not: null },
        ...(lastId ? { id: { gt: lastId } } : {})
      },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      select: {
        id: true,
        avatarMediaId: true,
        avatarUrl: true,
        avatarMedia: {
          select: {
            id: true,
            type: true,
            storageKey: true,
            variants: true,
            url: true,
            thumbUrl: true,
            width: true,
            height: true,
            durationSec: true
          }
        }
      }
    });

    if (profiles.length === 0) break;
    lastId = profiles[profiles.length - 1]!.id;

    for (const profile of profiles) {
      const avatarMedia = profile.avatarMedia;
      if (!avatarMedia) {
        if (profile.avatarUrl !== null) {
          await prisma.profile.update({
            where: { id: profile.id },
            data: { avatarUrl: null }
          });
          updated += 1;
        }
        continue;
      }

      const urls = buildMediaUrls(avatarMedia);
      if (profile.avatarUrl !== urls.original) {
        await prisma.profile.update({
          where: { id: profile.id },
          data: { avatarUrl: urls.original }
        });
        updated += 1;
      }
    }

    await sleep(PAUSE_MS);
  }

  console.log(`[backfill-avatar-url] Updated ${updated} profiles`);
}

main()
  .catch((err) => {
    console.error('[backfill-avatar-url] Failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
