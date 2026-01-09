import { prisma } from '../lib/prisma/client.js';
import { runJob } from '../lib/jobs/runJob.js';

type UserAffinityJobConfig = {
  userBatchSize: number;
  pauseMs: number;
  lookbackDays: number;
  topCreatorsCount: number;
  topTopicsCount: number;
  algorithmVersion: string;
};

type UserAffinityJobOptions = Partial<UserAffinityJobConfig> & {
  userId?: bigint | null;
};

const DEFAULT_CONFIG: UserAffinityJobConfig = {
  userBatchSize: 100,
  pauseMs: 50,
  lookbackDays: 90,
  topCreatorsCount: 20,
  topTopicsCount: 30,
  algorithmVersion: 'v1'
};

export const AFFINITY_DEFAULTS = { ...DEFAULT_CONFIG };

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeCounts<T>(entries: Array<[T, number]>, maxItems: number) {
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (!total) return [];
  return entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxItems)
    .map(([key, count]) => ({ key, weight: count / total }));
}

export async function runUserAffinityJob(options: UserAffinityJobOptions = {}) {
  const config: UserAffinityJobConfig = { ...DEFAULT_CONFIG, ...options };
  const runForUserId = options.userId ?? null;

  return runJob(
    {
      jobName: 'user-affinity',
      trigger: runForUserId ? 'EVENT' : 'MANUAL',
      scope: runForUserId ? `user:${runForUserId}` : 'batch',
      algorithmVersion: config.algorithmVersion,
      metadata: {
        lookbackDays: config.lookbackDays,
        userBatchSize: config.userBatchSize
      }
    },
    async () => {
      const now = new Date();
      const cutoff = new Date(now.getTime() - config.lookbackDays * 24 * 60 * 60 * 1000);

      const userIds = runForUserId
        ? [runForUserId]
        : (
            await prisma.likedPost.groupBy({
              by: ['userId'],
              where: { createdAt: { gte: cutoff } }
            })
          ).map((row) => row.userId);

      for (let offset = 0; offset < userIds.length; offset += config.userBatchSize) {
        const batch = userIds.slice(offset, offset + config.userBatchSize);
        if (!batch.length) continue;

        const likes = await prisma.likedPost.findMany({
          where: {
            userId: { in: batch },
            createdAt: { gte: cutoff },
            post: { deletedAt: null, visibility: 'PUBLIC' }
          },
          select: {
            userId: true,
            postId: true,
            post: { select: { userId: true } }
          }
        });

        const likesByUser = new Map<bigint, typeof likes>();
        const postIds = new Set<bigint>();
        for (const like of likes) {
          postIds.add(like.postId);
          const list = likesByUser.get(like.userId);
          if (list) {
            list.push(like);
          } else {
            likesByUser.set(like.userId, [like]);
          }
        }

        const postIdList = Array.from(postIds);
        const featureRows = postIdList.length
          ? await prisma.postFeatures.findMany({
              where: { postId: { in: postIdList } },
              select: { postId: true, topics: true }
            })
          : [];
        const topicsByPostId = new Map<bigint, string[]>();
        for (const row of featureRows) {
          if (Array.isArray(row.topics)) {
            const topics = row.topics.filter((topic): topic is string => typeof topic === 'string');
            topicsByPostId.set(row.postId, topics);
          }
        }

        const mediaRows = postIdList.length
          ? await prisma.postMedia.findMany({
              where: { postId: { in: postIdList } },
              select: { postId: true, media: { select: { type: true } } }
            })
          : [];
        const mediaByPostId = new Map<bigint, { hasImage: boolean; hasVideo: boolean }>();
        for (const row of mediaRows) {
          const entry = mediaByPostId.get(row.postId) ?? { hasImage: false, hasVideo: false };
          if (row.media.type === 'IMAGE') entry.hasImage = true;
          if (row.media.type === 'VIDEO' || row.media.type === 'EMBED') entry.hasVideo = true;
          mediaByPostId.set(row.postId, entry);
        }

        const upserts = batch.map((userId) => {
          const userLikes = likesByUser.get(userId) ?? [];
          const totalLikes = userLikes.length;

          const creatorCounts = new Map<bigint, number>();
          const topicCounts = new Map<string, number>();
          const contentTypeCounts = { photos: 0, videos: 0, text: 0, polls: 0 };

          for (const like of userLikes) {
            const creatorId = like.post.userId;
            creatorCounts.set(creatorId, (creatorCounts.get(creatorId) ?? 0) + 1);

            const mediaFlags = mediaByPostId.get(like.postId);
            if (mediaFlags?.hasVideo) {
              contentTypeCounts.videos += 1;
            } else if (mediaFlags?.hasImage) {
              contentTypeCounts.photos += 1;
            } else {
              contentTypeCounts.text += 1;
            }

            const topics = topicsByPostId.get(like.postId) ?? [];
            for (const topic of topics) {
              topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
            }
          }

          const creatorEntries = normalizeCounts(Array.from(creatorCounts.entries()), config.topCreatorsCount).map(
            (entry) => ({ userId: String(entry.key), weight: entry.weight })
          );
          const topicEntries = normalizeCounts(Array.from(topicCounts.entries()), config.topTopicsCount).map(
            (entry) => ({ tag: entry.key, weight: entry.weight })
          );

          const contentTotal =
            contentTypeCounts.photos +
            contentTypeCounts.videos +
            contentTypeCounts.text +
            contentTypeCounts.polls;
          const contentTypePrefs =
            contentTotal > 0
              ? {
                  photos: contentTypeCounts.photos / contentTotal,
                  videos: contentTypeCounts.videos / contentTotal,
                  text: contentTypeCounts.text / contentTotal,
                  polls: contentTypeCounts.polls / contentTotal
                }
              : { photos: 0, videos: 0, text: 0, polls: 0 };

          const engagementVelocity = totalLikes / Math.max(1, config.lookbackDays);
          const explorationFactor = topicCounts.size
            ? clamp(topicCounts.size / config.topTopicsCount)
            : 0.5;

          return prisma.userAffinityProfile.upsert({
            where: { userId },
            update: {
              topCreators: creatorEntries,
              topTopics: topicEntries,
              contentTypePrefs,
              engagementVelocity,
              explorationFactor,
              computedAt: now
            },
            create: {
              userId,
              topCreators: creatorEntries,
              topTopics: topicEntries,
              contentTypePrefs,
              engagementVelocity,
              explorationFactor,
              computedAt: now
            }
          });
        });

        if (upserts.length) {
          await prisma.$transaction(upserts);
        }

        if (config.pauseMs > 0) {
          await sleep(config.pauseMs);
        }
      }
    }
  );
}
