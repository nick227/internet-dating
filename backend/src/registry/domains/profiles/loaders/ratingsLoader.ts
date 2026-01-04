import { prisma } from '../../../../lib/prisma/client.js';
import type { RatingData } from '../types/contracts.js';

export async function loadProfileRatings(
  profileId: bigint,
  viewerProfileId?: bigint | null
): Promise<RatingData> {
  const ratingAgg = await prisma.profileRating.aggregate({
    where: { targetProfileId: profileId },
    _avg: { attractive: true, smart: true, funny: true, interesting: true },
    _count: { _all: true }
  });

  let myRating = null as {
    attractive: number;
    smart: number;
    funny: number;
    interesting: number;
    createdAt: Date;
  } | null;

  if (viewerProfileId) {
    const rating = await prisma.profileRating.findUnique({
      where: {
        raterProfileId_targetProfileId: {
          raterProfileId: viewerProfileId,
          targetProfileId: profileId
        }
      },
      select: { attractive: true, smart: true, funny: true, interesting: true, createdAt: true }
    });
    myRating = rating;
  }

  return {
    count: ratingAgg._count._all,
    avg: {
      attractive: ratingAgg._avg.attractive,
      smart: ratingAgg._avg.smart,
      funny: ratingAgg._avg.funny,
      interesting: ratingAgg._avg.interesting
    },
    mine: myRating
  };
}
