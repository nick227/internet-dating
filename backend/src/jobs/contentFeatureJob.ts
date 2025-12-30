import { prisma } from '../lib/prisma/client.js';
import { runJob } from '../lib/jobs/runJob.js';

type ContentFeatureJobConfig = {
  batchSize: number;
  pauseMs: number;
  maxLookbackDays: number;
  maxTopics: number;
  algorithmVersion: string;
};

type ContentFeatureJobOptions = Partial<ContentFeatureJobConfig> & {
  postId?: bigint | null;
};

const DEFAULT_CONFIG: ContentFeatureJobConfig = {
  batchSize: 50,
  pauseMs: 50,
  maxLookbackDays: 7,
  maxTopics: 8,
  algorithmVersion: 'v1'
};

export const CONTENT_FEATURE_DEFAULTS = { ...DEFAULT_CONFIG };

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function extractTopics(text: string | null, maxTopics: number) {
  if (!text) return [];
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);

  const unique = Array.from(new Set(tokens));
  return unique.slice(0, maxTopics);
}

function computeQuality(text: string | null, mediaCount: number) {
  const textScore = text ? clamp(text.trim().length / 280) : 0;
  const mediaScore = clamp(mediaCount / 4);
  return clamp(textScore * 0.6 + mediaScore * 0.4);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runContentFeatureJob(options: ContentFeatureJobOptions = {}) {
  const config: ContentFeatureJobConfig = { ...DEFAULT_CONFIG, ...options };
  const runForPostId = options.postId ?? null;

  return runJob(
    {
      jobName: 'content-features',
      trigger: runForPostId ? 'EVENT' : 'MANUAL',
      scope: runForPostId ? `post:${runForPostId}` : 'batch',
      algorithmVersion: config.algorithmVersion,
      metadata: {
        batchSize: config.batchSize,
        maxLookbackDays: config.maxLookbackDays
      }
    },
    async () => {
      const now = new Date();
      const cutoff =
        config.maxLookbackDays > 0
          ? new Date(now.getTime() - config.maxLookbackDays * 24 * 60 * 60 * 1000)
          : null;

      if (runForPostId) {
        const post = await prisma.post.findFirst({
          where: { id: runForPostId, deletedAt: null },
          select: { id: true, text: true }
        });
        if (!post) return;

        const mediaCount = await prisma.postMedia.count({ where: { postId: post.id } });
        const topics = extractTopics(post.text, config.maxTopics);
        const quality = computeQuality(post.text, mediaCount);

        await prisma.postFeatures.upsert({
          where: { postId: post.id },
          update: { topics, quality, nsfw: false, computedAt: now },
          create: { postId: post.id, topics, quality, nsfw: false, computedAt: now }
        });
        return;
      }

      let cursorId: bigint | null = null;
      while (true) {
        const posts: Array<{ id: bigint; text: string | null }> = await prisma.post.findMany({
          where: {
            deletedAt: null,
            ...(cutoff ? { createdAt: { gte: cutoff } } : {}),
            ...(cursorId ? { id: { lt: cursorId } } : {})
          },
          orderBy: { id: 'desc' },
          take: config.batchSize,
          select: { id: true, text: true }
        });

        if (!posts.length) break;

        const postIds = posts.map((post: { id: bigint; text: string | null }) => post.id);
        const mediaCounts = await prisma.postMedia.groupBy({
          by: ['postId'],
          where: { postId: { in: postIds } },
          _count: { _all: true }
        });
        const mediaCountByPostId = new Map<bigint, number>();
        for (const row of mediaCounts) {
          mediaCountByPostId.set(row.postId, row._count._all);
        }

        await prisma.$transaction(
          posts.map((post: { id: bigint; text: string | null }) => {
            const mediaCount = mediaCountByPostId.get(post.id) ?? 0;
            const topics = extractTopics(post.text, config.maxTopics);
            const quality = computeQuality(post.text, mediaCount);
            return prisma.postFeatures.upsert({
              where: { postId: post.id },
              update: { topics, quality, nsfw: false, computedAt: now },
              create: { postId: post.id, topics, quality, nsfw: false, computedAt: now }
            });
          })
        );

        cursorId = posts[posts.length - 1]!.id;
        if (config.pauseMs > 0) {
          await sleep(config.pauseMs);
        }
      }
    }
  );
}
