import { prisma } from '../lib/prisma/client.js';
import { runJob } from '../lib/jobs/runJob.js';

type TrendingJobConfig = {
  windowHours: number;
  expiryHours: number;
  minEngagements: number;
  algorithmVersion: string;
};

type TrendingJobOptions = Partial<TrendingJobConfig>;

const DEFAULT_CONFIG: TrendingJobConfig = {
  windowHours: 48,
  expiryHours: 48,
  minEngagements: 5,
  algorithmVersion: 'v1'
};

export const TRENDING_DEFAULTS = { ...DEFAULT_CONFIG };

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function ageDecay(hours: number) {
  return clamp(1 / Math.log(2 + Math.max(0, hours)));
}

export async function runTrendingJob(options: TrendingJobOptions = {}) {
  const config: TrendingJobConfig = { ...DEFAULT_CONFIG, ...options };

  return runJob(
    {
      jobName: 'trending',
      trigger: 'MANUAL',
      scope: 'window',
      algorithmVersion: config.algorithmVersion,
      metadata: {
        windowHours: config.windowHours,
        minEngagements: config.minEngagements
      }
    },
    async () => {
      const now = new Date();
      const cutoff = new Date(now.getTime() - config.windowHours * 60 * 60 * 1000);

      const likeAgg = await prisma.likedPost.groupBy({
        by: ['postId'],
        where: {
          createdAt: { gte: cutoff },
          post: {
            deletedAt: null,
            visibility: 'PUBLIC',
            createdAt: { gte: cutoff }
          }
        },
        _count: { _all: true }
      });

      const candidates = likeAgg.filter((row) => row._count._all >= config.minEngagements);
      if (!candidates.length) {
        await prisma.trendingScore.deleteMany({ where: { expiresAt: { lt: now } } });
        return;
      }

      const postIds = candidates.map((row) => row.postId);
      const posts = await prisma.post.findMany({
        where: { id: { in: postIds } },
        select: { id: true, createdAt: true }
      });
      const postById = new Map<bigint, { createdAt: Date }>();
      for (const post of posts) {
        postById.set(post.id, { createdAt: post.createdAt });
      }

      const expiresAt = new Date(now.getTime() + config.expiryHours * 60 * 60 * 1000);

      await prisma.$transaction(async (tx) => {
        await tx.trendingScore.deleteMany({ where: { expiresAt: { lt: now } } });

        for (const candidate of candidates) {
          const post = postById.get(candidate.postId);
          if (!post) continue;
          const ageHours = Math.max(1 / 60, (now.getTime() - post.createdAt.getTime()) / (1000 * 60 * 60));
          const likes = candidate._count._all;
          const popularity = likes * ageDecay(ageHours);
          const velocity = likes / ageHours;

          await tx.trendingScore.upsert({
            where: { postId: candidate.postId },
            update: {
              popularity,
              velocity,
              peakTime: now,
              computedAt: now,
              expiresAt
            },
            create: {
              postId: candidate.postId,
              popularity,
              velocity,
              peakTime: now,
              computedAt: now,
              expiresAt
            }
          });
        }
      });
    }
  );
}
