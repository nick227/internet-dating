import { prisma } from '../../../../lib/prisma/client.js';

export type RatingValues = {
  attractive: number;
  smart: number;
  funny: number;
  interesting: number;
};

export async function upsertRating(
  raterProfileId: bigint,
  targetProfileId: bigint,
  ratings: RatingValues
): Promise<void> {
  const defaultSums = {
    attractive: 0,
    smart: 0,
    funny: 0,
    interesting: 0
  };

  const normalizeSums = (value: unknown) => {
    if (!value || typeof value !== 'object') return { ...defaultSums };
    const record = value as Record<string, unknown>;
    return {
      attractive: typeof record.attractive === 'number' ? record.attractive : 0,
      smart: typeof record.smart === 'number' ? record.smart : 0,
      funny: typeof record.funny === 'number' ? record.funny : 0,
      interesting: typeof record.interesting === 'number' ? record.interesting : 0
    };
  };

  await prisma.$transaction(async (tx) => {
    const existing = await tx.profileRating.findUnique({
      where: { raterProfileId_targetProfileId: { raterProfileId, targetProfileId } },
      select: { attractive: true, smart: true, funny: true, interesting: true }
    });

    await tx.profileRating.upsert({
      where: { raterProfileId_targetProfileId: { raterProfileId, targetProfileId } },
      update: ratings,
      create: { raterProfileId, targetProfileId, ...ratings }
    });

    const delta = {
      attractive: ratings.attractive - (existing?.attractive ?? 0),
      smart: ratings.smart - (existing?.smart ?? 0),
      funny: ratings.funny - (existing?.funny ?? 0),
      interesting: ratings.interesting - (existing?.interesting ?? 0)
    };
    const ratingCountDelta = existing ? 0 : 1;

    const stats = await tx.profileStats.findUnique({
      where: { profileId: targetProfileId },
      select: { ratingCount: true, ratingSums: true }
    });
    const baseSums = normalizeSums(stats?.ratingSums);
    const nextSums = stats
      ? {
          attractive: baseSums.attractive + delta.attractive,
          smart: baseSums.smart + delta.smart,
          funny: baseSums.funny + delta.funny,
          interesting: baseSums.interesting + delta.interesting
        }
      : {
          attractive: ratings.attractive,
          smart: ratings.smart,
          funny: ratings.funny,
          interesting: ratings.interesting
        };

    if (stats) {
      await tx.profileStats.update({
        where: { profileId: targetProfileId },
        data: {
          ratingCount: ratingCountDelta ? { increment: ratingCountDelta } : undefined,
          ratingSums: nextSums
        }
      });
    } else {
      await tx.profileStats.create({
        data: {
          profileId: targetProfileId,
          ratingCount: ratingCountDelta || 1,
          ratingSums: nextSums
        }
      });
    }
  });
}
