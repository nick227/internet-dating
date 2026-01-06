import { prisma } from '../lib/prisma/client.js';
import { runJob } from '../lib/jobs/runJob.js';

type StatsReconcileConfig = {
  batchSize: number;
  pauseMs: number;
  lookbackHours: number;
  algorithmVersion: string;
};

type StatsReconcileOptions = Partial<StatsReconcileConfig> & {
  full?: boolean;
};

const DEFAULT_CONFIG: StatsReconcileConfig = {
  batchSize: 200,
  pauseMs: 50,
  lookbackHours: 24,
  algorithmVersion: 'v1'
};

const EMPTY_RATING_SUMS = {
  attractive: 0,
  smart: 0,
  funny: 0,
  interesting: 0
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uniqueBigInts(values: bigint[]) {
  return Array.from(new Set(values));
}

async function reconcilePostStats(postIds: bigint[]) {
  if (postIds.length === 0) return 0;

  const [commentAgg, likeAgg] = await Promise.all([
    prisma.comment.groupBy({
      by: ['targetId'],
      where: {
        targetKind: 'POST',
        targetId: { in: postIds },
        status: 'ACTIVE'
      },
      _count: { _all: true },
      _max: { createdAt: true }
    }),
    prisma.likedPost.groupBy({
      by: ['postId'],
      where: { postId: { in: postIds } },
      _count: { _all: true },
      _max: { createdAt: true }
    })
  ]);

  const commentByPostId = new Map<bigint, { count: number; lastAt: Date | null }>();
  for (const row of commentAgg) {
    commentByPostId.set(row.targetId, {
      count: row._count._all,
      lastAt: row._max.createdAt ?? null
    });
  }

  const likeByPostId = new Map<bigint, { count: number; lastAt: Date | null }>();
  for (const row of likeAgg) {
    likeByPostId.set(row.postId, {
      count: row._count._all,
      lastAt: row._max.createdAt ?? null
    });
  }

  const updates = postIds.map((postId) => {
    const comment = commentByPostId.get(postId);
    const like = likeByPostId.get(postId);
    return prisma.postStats.upsert({
      where: { postId },
      update: {
        commentCount: comment?.count ?? 0,
        likeCount: like?.count ?? 0,
        lastCommentAt: comment?.lastAt ?? null,
        lastLikeAt: like?.lastAt ?? null
      },
      create: {
        postId,
        commentCount: comment?.count ?? 0,
        likeCount: like?.count ?? 0,
        lastCommentAt: comment?.lastAt ?? null,
        lastLikeAt: like?.lastAt ?? null
      }
    });
  });

  await prisma.$transaction(updates);
  return postIds.length;
}

async function reconcileProfileStats(profileIds: bigint[]) {
  if (profileIds.length === 0) return 0;

  const profiles = await prisma.profile.findMany({
    where: { id: { in: profileIds }, deletedAt: null },
    select: { id: true, userId: true }
  });
  if (!profiles.length) return 0;

  const userIds = profiles.map((profile) => profile.userId);

  const [likeAgg, ratingAgg] = await Promise.all([
    prisma.like.groupBy({
      by: ['toUserId', 'action'],
      where: { toUserId: { in: userIds } },
      _count: { _all: true }
    }),
    prisma.profileRating.groupBy({
      by: ['targetProfileId'],
      where: { targetProfileId: { in: profileIds } },
      _count: { _all: true },
      _sum: { attractive: true, smart: true, funny: true, interesting: true }
    })
  ]);

  const likeByUserId = new Map<bigint, { likeCount: number; dislikeCount: number }>();
  for (const row of likeAgg) {
    const current = likeByUserId.get(row.toUserId) ?? { likeCount: 0, dislikeCount: 0 };
    if (row.action === 'LIKE') {
      current.likeCount += row._count._all;
    } else {
      current.dislikeCount += row._count._all;
    }
    likeByUserId.set(row.toUserId, current);
  }

  const ratingByProfileId = new Map<
    bigint,
    { ratingCount: number; ratingSums: typeof EMPTY_RATING_SUMS }
  >();
  for (const row of ratingAgg) {
    ratingByProfileId.set(row.targetProfileId, {
      ratingCount: row._count._all,
      ratingSums: {
        attractive: row._sum.attractive ?? 0,
        smart: row._sum.smart ?? 0,
        funny: row._sum.funny ?? 0,
        interesting: row._sum.interesting ?? 0
      }
    });
  }

  const updates = profiles.map((profile) => {
    const like = likeByUserId.get(profile.userId) ?? { likeCount: 0, dislikeCount: 0 };
    const rating = ratingByProfileId.get(profile.id) ?? {
      ratingCount: 0,
      ratingSums: { ...EMPTY_RATING_SUMS }
    };
    return prisma.profileStats.upsert({
      where: { profileId: profile.id },
      update: {
        likeCount: like.likeCount,
        dislikeCount: like.dislikeCount,
        ratingCount: rating.ratingCount,
        ratingSums: rating.ratingSums
      },
      create: {
        profileId: profile.id,
        likeCount: like.likeCount,
        dislikeCount: like.dislikeCount,
        ratingCount: rating.ratingCount,
        ratingSums: rating.ratingSums
      }
    });
  });

  await prisma.$transaction(updates);
  return profiles.length;
}

async function reconcilePostStatsFull(config: StatsReconcileConfig) {
  let cursorId: bigint | null = null;
  let updated = 0;
  while (true) {
    const posts: Array<{ id: bigint }> = await prisma.post.findMany({
      where: {
        deletedAt: null,
        ...(cursorId ? { id: { lt: cursorId } } : {})
      },
      orderBy: { id: 'desc' },
      take: config.batchSize,
      select: { id: true }
    });
    if (!posts.length) break;
    updated += await reconcilePostStats(posts.map((post) => post.id));
    cursorId = posts[posts.length - 1]!.id;
    if (config.pauseMs > 0) await sleep(config.pauseMs);
  }
  return updated;
}

async function reconcileProfileStatsFull(config: StatsReconcileConfig) {
  let cursorId: bigint | null = null;
  let updated = 0;
  while (true) {
    const profiles: Array<{ id: bigint }> = await prisma.profile.findMany({
      where: {
        deletedAt: null,
        ...(cursorId ? { id: { lt: cursorId } } : {})
      },
      orderBy: { id: 'desc' },
      take: config.batchSize,
      select: { id: true }
    });
    if (!profiles.length) break;
    updated += await reconcileProfileStats(profiles.map((profile) => profile.id));
    cursorId = profiles[profiles.length - 1]!.id;
    if (config.pauseMs > 0) await sleep(config.pauseMs);
  }
  return updated;
}

async function reconcilePostStatsSince(config: StatsReconcileConfig, cutoff: Date) {
  const [commentTargets, likeTargets] = await Promise.all([
    prisma.comment.findMany({
      where: {
        targetKind: 'POST',
        updatedAt: { gte: cutoff }
      },
      distinct: ['targetId'],
      select: { targetId: true }
    }),
    prisma.likedPost.findMany({
      where: { createdAt: { gte: cutoff } },
      distinct: ['postId'],
      select: { postId: true }
    })
  ]);

  const postIds = uniqueBigInts([
    ...commentTargets.map((row) => row.targetId),
    ...likeTargets.map((row) => row.postId)
  ]);

  let updated = 0;
  for (let i = 0; i < postIds.length; i += config.batchSize) {
    const batch = postIds.slice(i, i + config.batchSize);
    updated += await reconcilePostStats(batch);
    if (config.pauseMs > 0) await sleep(config.pauseMs);
  }
  return updated;
}

async function reconcileProfileStatsSince(config: StatsReconcileConfig, cutoff: Date) {
  const [likeTargets, ratingTargets] = await Promise.all([
    prisma.like.findMany({
      where: { createdAt: { gte: cutoff } },
      distinct: ['toUserId'],
      select: { toUserId: true }
    }),
    prisma.profileRating.findMany({
      where: { createdAt: { gte: cutoff } },
      distinct: ['targetProfileId'],
      select: { targetProfileId: true }
    })
  ]);

  const userIds = likeTargets.map((row) => row.toUserId);
  const profilesFromLikes = userIds.length
    ? await prisma.profile.findMany({
        where: { userId: { in: userIds }, deletedAt: null },
        select: { id: true }
      })
    : [];

  const profileIds = uniqueBigInts([
    ...profilesFromLikes.map((row) => row.id),
    ...ratingTargets.map((row) => row.targetProfileId)
  ]);

  let updated = 0;
  for (let i = 0; i < profileIds.length; i += config.batchSize) {
    const batch = profileIds.slice(i, i + config.batchSize);
    updated += await reconcileProfileStats(batch);
    if (config.pauseMs > 0) await sleep(config.pauseMs);
  }
  return updated;
}

export async function reconcileStats(options: StatsReconcileOptions = {}) {
  const config: StatsReconcileConfig = { ...DEFAULT_CONFIG, ...options };
  const isFull = Boolean(options.full);
  const cutoff = new Date(Date.now() - config.lookbackHours * 60 * 60 * 1000);

  const postUpdated = isFull
    ? await reconcilePostStatsFull(config)
    : await reconcilePostStatsSince(config, cutoff);

  const profileUpdated = isFull
    ? await reconcileProfileStatsFull(config)
    : await reconcileProfileStatsSince(config, cutoff);

  return { postUpdated, profileUpdated };
}

export async function runStatsReconcileJob(options: StatsReconcileOptions = {}) {
  const config: StatsReconcileConfig = { ...DEFAULT_CONFIG, ...options };
  const isFull = Boolean(options.full);
  const scope = isFull ? 'full' : `lookback:${config.lookbackHours}h`;

  return runJob(
    {
      jobName: 'stats-reconcile',
      trigger: isFull ? 'MANUAL' : 'CRON',
      scope,
      algorithmVersion: config.algorithmVersion,
      metadata: {
        batchSize: config.batchSize,
        pauseMs: config.pauseMs,
        lookbackHours: config.lookbackHours,
        full: isFull
      }
    },
    () => reconcileStats({ ...config, full: isFull })
  );
}
