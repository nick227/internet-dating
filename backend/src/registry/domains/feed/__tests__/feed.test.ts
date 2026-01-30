import { test } from 'node:test';
import assert from 'node:assert';
import { prisma } from '../../../../lib/prisma/client.js';
import { buildViewerContext } from '../context.js';
import { getCandidates } from '../candidates/index.js';
import { scoreCandidates } from '../scoring/index.js';
import { mergeAndRank } from '../ranking/index.js';
import { hydrateFeedItems } from '../hydration/index.js';
import { FEED_CONFIG_VERSION } from '../config.js';
import { FEED_PRESORT_MIN_SEGMENT_ITEMS } from '../constants.js';
import { feedDomain } from '../index.js';
import { invalidateAllSegmentsForUser, storePresortedSegment } from '../../../../services/feed/presortedFeedService.js';
import type { ViewerContext } from '../types.js';
import type { Request, Response } from 'express';

// Helper to create mock request
function createMockRequest(userId: bigint | null, take = 20, cursorId: bigint | null = null): Request {
  return {
    ctx: { userId },
    query: {
      take: String(take),
      ...(cursorId ? { cursorId: String(cursorId) } : {})
    }
  } as unknown as Request;
}

function collectPostIds(
  items: Array<{
    cardType?: string;
    items?: Array<{ type: string; post?: { id: string | bigint } }>;
    type?: string;
    post?: { id: string | bigint };
    grid?: { items: Array<{ type: string; post?: { id: string | bigint } }> };
  }>
): string[] {
  const ids: string[] = [];
  for (const item of items) {
    if (item.items?.length) {
      for (const child of item.items) {
        if (child.type === 'post' && child.post?.id != null) {
          ids.push(String(child.post.id));
        }
      }
      continue;
    }
    if (item.type === 'post' && item.post?.id != null) {
      ids.push(String(item.post.id));
      continue;
    }
    if (item.type === 'grid' && item.grid?.items?.length) {
      for (const child of item.grid.items) {
        if (child.type === 'post' && child.post?.id != null) {
          ids.push(String(child.post.id));
        }
      }
    }
  }
  return ids;
}

async function createVideoPost(params: {
  userId: bigint;
  text: string;
  visibility: 'PUBLIC' | 'PRIVATE';
}) {
  const post = await prisma.post.create({
    data: {
      userId: params.userId,
      text: params.text,
      visibility: params.visibility
    }
  });

  const media = await prisma.media.create({
    data: {
      userId: params.userId,
      ownerUserId: params.userId,
      type: 'VIDEO',
      status: 'READY',
      visibility: 'PUBLIC',
      url: `https://example.com/${post.id}.mp4`
    }
  });

  await prisma.postMedia.create({
    data: {
      postId: post.id,
      mediaId: media.id,
      order: 0
    }
  });

  return post;
}

async function cleanupUsers(userIds: bigint[]) {
  if (!userIds.length) return;

  const [posts, profiles, conversations, top5Lists] = await Promise.all([
    prisma.post.findMany({
      where: { userId: { in: userIds } },
      select: { id: true }
    }),
    prisma.profile.findMany({
      where: { userId: { in: userIds } },
      select: { id: true }
    }),
    prisma.conversation.findMany({
      where: {
        OR: [{ userAId: { in: userIds } }, { userBId: { in: userIds } }]
      },
      select: { id: true }
    }),
    prisma.top5List.findMany({
      where: { profile: { userId: { in: userIds } } },
      select: { id: true }
    })
  ]);
  const postIds = posts.map((post) => post.id);
  const profileIds = profiles.map((profile) => profile.id);
  const conversationIds = conversations.map((conversation) => conversation.id);
  const top5ListIds = top5Lists.map((list) => list.id);

  await prisma.feedSeen.deleteMany({
    where: {
      OR: [
        { viewerUserId: { in: userIds } },
        ...(userIds.length ? [{ itemId: { in: userIds } }] : []),
        ...(postIds.length ? [{ itemId: { in: postIds } }] : [])
      ]
    }
  });
  await prisma.presortedFeedSegment.deleteMany({
    where: { userId: { in: userIds } }
  });
  await prisma.matchScore.deleteMany({
    where: {
      OR: [{ userId: { in: userIds } }, { candidateUserId: { in: userIds } }]
    }
  });
  await prisma.userCompatibility.deleteMany({
    where: {
      OR: [{ viewerUserId: { in: userIds } }, { targetUserId: { in: userIds } }]
    }
  });
  await prisma.userInterest.deleteMany({
    where: { userId: { in: userIds } }
  });
  await prisma.quizResult.deleteMany({
    where: { userId: { in: userIds } }
  });
  await prisma.userPreference.deleteMany({
    where: { userId: { in: userIds } }
  });
  await prisma.userAffinityProfile.deleteMany({
    where: { userId: { in: userIds } }
  });
  await prisma.userBlock.deleteMany({
    where: {
      OR: [{ blockerId: { in: userIds } }, { blockedId: { in: userIds } }]
    }
  });
  await prisma.userReport.deleteMany({
    where: {
      OR: [{ reporterId: { in: userIds } }, { targetId: { in: userIds } }]
    }
  });
  await prisma.profileAccess.deleteMany({
    where: {
      OR: [{ ownerUserId: { in: userIds } }, { viewerUserId: { in: userIds } }]
    }
  });
  await prisma.messageReceipt.deleteMany({
    where: { userId: { in: userIds } }
  });
  await prisma.like.deleteMany({
    where: {
      OR: [{ fromUserId: { in: userIds } }, { toUserId: { in: userIds } }]
    }
  });

  if (conversationIds.length) {
    const messages = await prisma.message.findMany({
      where: { conversationId: { in: conversationIds } },
      select: { id: true }
    });
    const messageIds = messages.map((message) => message.id);

    await prisma.messageReceipt.deleteMany({
      where: {
        OR: [
          { userId: { in: userIds } },
          ...(messageIds.length ? [{ messageId: { in: messageIds } }] : [])
        ]
      }
    });
    await prisma.message.deleteMany({
      where: {
        OR: [
          { senderId: { in: userIds } },
          { conversationId: { in: conversationIds } }
        ]
      }
    });
    await prisma.conversation.deleteMany({
      where: { id: { in: conversationIds } }
    });
  }
  await prisma.match.deleteMany({
    where: {
      OR: [{ userAId: { in: userIds } }, { userBId: { in: userIds } }]
    }
  });

  await prisma.likedPost.deleteMany({
    where: {
      OR: [
        { userId: { in: userIds } },
        ...(postIds.length ? [{ postId: { in: postIds } }] : [])
      ]
    }
  });
  if (postIds.length) {
    await prisma.postFeatures.deleteMany({ where: { postId: { in: postIds } } });
    await prisma.trendingScore.deleteMany({ where: { postId: { in: postIds } } });
    await prisma.postMedia.deleteMany({ where: { postId: { in: postIds } } });
    await prisma.postStats.deleteMany({ where: { postId: { in: postIds } } });
  }
  await prisma.comment.deleteMany({ where: { authorId: { in: userIds } } });
  await prisma.post.deleteMany({ where: { userId: { in: userIds } } });
  if (top5ListIds.length) {
    await prisma.top5Item.deleteMany({ where: { listId: { in: top5ListIds } } });
    await prisma.top5List.deleteMany({ where: { id: { in: top5ListIds } } });
  }
  if (profileIds.length) {
    await prisma.profileRating.deleteMany({
      where: {
        OR: [{ raterProfileId: { in: profileIds } }, { targetProfileId: { in: profileIds } }]
      }
    });
    await prisma.profileStats.deleteMany({ where: { profileId: { in: profileIds } } });
  }
  await prisma.profile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.media.deleteMany({
    where: {
      OR: [{ userId: { in: userIds } }, { ownerUserId: { in: userIds } }]
    }
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await prisma.presortedFeedSegment.deleteMany({
        where: { userId: { in: userIds } }
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      break;
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

function createMockResponse() {
  let statusCode = 200;
  let body = '';
  const res = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    type() {
      return res;
    },
    send(payload: string) {
      body = payload;
      return res;
    },
    getBody() {
      return body;
    },
    getStatus() {
      return statusCode;
    }
  };
  return res as unknown as Response & { getBody: () => string; getStatus: () => number };
}

async function callFeed(userId: bigint | null, query: Record<string, string>) {
  const route = feedDomain.routes.find((r) => r.id === 'feed.GET./feed');
  if (!route) throw new Error('Feed route not found');
  const req = { ctx: { userId }, query } as unknown as Request;
  const res = createMockResponse();
  await route.handler(req, res, () => undefined);
  return { status: res.getStatus(), body: JSON.parse(res.getBody()) };
}

test('Feed retrieval - basic functionality', async () => {
  // Create test users
  const user1 = await prisma.user.create({
    data: {
      email: `test-feed-${Date.now()}-1@example.com`,
      passwordHash: 'hash',
      profile: {
        create: {
          displayName: 'Test User 1',
          isVisible: true
        }
      }
    }
  });

  const user2 = await prisma.user.create({
    data: {
      email: `test-feed-${Date.now()}-2@example.com`,
      passwordHash: 'hash',
      profile: {
        create: {
          displayName: 'Test User 2',
          isVisible: true
        }
      }
    }
  });

  try {
    // Create PUBLIC posts
    const post1 = await createVideoPost({
      userId: user1.id,
      text: 'First post',
      visibility: 'PUBLIC'
    });

    const post2 = await createVideoPost({
      userId: user2.id,
      text: 'Second post',
      visibility: 'PUBLIC'
    });

    // Test feed retrieval
    const req = createMockRequest(null, 20);
    const ctxResult = buildViewerContext(req);
    assert.ok(ctxResult.ok, 'Context should build successfully');
    const ctx = ctxResult.value;

    const candidates = await getCandidates(ctx);
    const scored = await scoreCandidates(ctx, candidates);
    const ranked = mergeAndRank(ctx, scored);
    const hydrated = await hydrateFeedItems(ctx, ranked);

    // Verify posts are included (top-level or grid children)
    const postIds = collectPostIds(hydrated as Array<{ type: string; post?: { id: bigint } }>);
    assert.ok(postIds.length >= 2, 'Should include at least 2 posts');
    assert.ok(postIds.includes(String(post1.id)), 'Should include post1');
    assert.ok(postIds.includes(String(post2.id)), 'Should include post2');

  } finally {
    await cleanupUsers([user1.id, user2.id]);
  }
});

test('Feed ranking - sequence order respects counts', async () => {
  const ctx: ViewerContext = {
    userId: null,
    take: 10,
    cursorId: null,
    debug: false,
    seed: null,
    markSeen: false
  };
  const candidates = {
    posts: Array.from({ length: 6 }, (_, i) => ({
      id: BigInt(i + 1),
      text: `Post ${i + 1}`,
      createdAt: new Date(),
      user: { id: BigInt(100 + i), profile: { displayName: `User ${i + 1}` } },
      mediaType: 'video' as const
    })),
    suggestions: [
      {
        userId: BigInt(201),
        displayName: 'Suggest 1',
        bio: null,
        locationText: null,
        intent: null,
        source: 'suggested' as const,
        matchScore: 0.8,
        score: 0.8
      }
    ],
    questions: [
      {
        id: BigInt(301),
        quizId: BigInt(401),
        quizTitle: 'Quiz',
        prompt: 'Question 1?',
        order: 1,
        options: [{ id: BigInt(501), label: 'A', value: 'a', order: 1 }]
      }
    ]
  };

  const ranked = mergeAndRank(ctx, candidates);
  const types = ranked.map(item => item.type);

  assert.deepStrictEqual(
    types.slice(0, 5),
    ['post', 'suggestion', 'grid', 'post', 'post'],
    'Sequence should emit post -> suggestion -> grid -> post -> post'
  );
});

test('Feed ranking - grid slot emits composite item when size met', async () => {
  const ctx: ViewerContext = {
    userId: null,
    take: 10,
    cursorId: null,
    debug: false,
    seed: null,
    markSeen: false
  };
  const candidates = {
    posts: Array.from({ length: 5 }, (_, i) => ({
      id: BigInt(i + 10),
      text: `Post ${i + 1}`,
      createdAt: new Date(),
      user: { id: BigInt(100 + i), profile: { displayName: `User ${i + 1}` } },
      mediaType: 'text' as const
    })),
    suggestions: [],
    questions: []
  };

  const ranked = mergeAndRank(ctx, candidates);
  const gridItem = ranked.find((item) => item.type === 'grid') as
    | { type: 'grid'; grid: { items: Array<{ actorId: bigint }> } }
    | undefined;

  assert.ok(gridItem, 'Grid slot should emit a composite item when size is met');
  assert.strictEqual(gridItem.grid.items.length, 4, 'Grid should include 4 items');
  const actorIds = new Set(gridItem.grid.items.map((item) => item.actorId.toString()));
  assert.strictEqual(actorIds.size, 4, 'Grid items should have distinct actors');
});

test('Feed ranking - maxPerActor enforcement', async () => {
  const user = await prisma.user.create({
    data: {
      email: `test-actor-${Date.now()}@example.com`,
      passwordHash: 'hash',
      profile: { create: { displayName: 'User', isVisible: true } }
    }
  });

  try {
    // Create many posts from same user
    const posts = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        createVideoPost({
          userId: user.id,
          text: `Post ${i}`,
          visibility: 'PUBLIC'
        })
      )
    );

    const req = createMockRequest(null, 20);
    const ctxResult = buildViewerContext(req);
    assert.ok(ctxResult.ok);
    const ctx = ctxResult.value;

    const candidates = await getCandidates(ctx);
    const scored = await scoreCandidates(ctx, candidates);
    const ranked = mergeAndRank(ctx, scored);

    // Count posts from same actor
    const actorCount = ranked.filter(
      item => item.type === 'post' && item.actorId === user.id
    ).length;

    assert.ok(
      actorCount <= 3,
      `Should not have more than 3 posts from same actor, got ${actorCount}`
    );

  } finally {
    await cleanupUsers([user.id]);
  }
});

test('Feed blocking - posts from blocked users are excluded', async () => {
  const blocker = await prisma.user.create({
    data: {
      email: `test-blocker-${Date.now()}@example.com`,
      passwordHash: 'hash',
      profile: { create: { displayName: 'Blocker', isVisible: true } }
    }
  });

  const blocked = await prisma.user.create({
    data: {
      email: `test-blocked-${Date.now()}@example.com`,
      passwordHash: 'hash',
      profile: { create: { displayName: 'Blocked', isVisible: true } }
    }
  });
  let otherUser: { id: bigint } | null = null;

  try {
    // Create block relationship
    await prisma.userBlock.create({
      data: {
        blockerId: blocker.id,
        blockedId: blocked.id
      }
    });

    // Create post from blocked user
    const blockedPost = await createVideoPost({
      userId: blocked.id,
      text: 'Blocked post',
      visibility: 'PUBLIC'
    });

    // Create post from non-blocked user
    otherUser = await prisma.user.create({
      data: {
        email: `test-other-${Date.now()}@example.com`,
        passwordHash: 'hash',
        profile: { create: { displayName: 'Other', isVisible: true } }
      }
    });

    const otherPost = await createVideoPost({
      userId: otherUser.id,
      text: 'Other post',
      visibility: 'PUBLIC'
    });

    // Test feed retrieval as blocker
    const req = createMockRequest(blocker.id, 20);
    const ctxResult = buildViewerContext(req);
    assert.ok(ctxResult.ok);
    const ctx = ctxResult.value;

    const candidates = await getCandidates(ctx);
    const scored = await scoreCandidates(ctx, candidates);
    const ranked = mergeAndRank(ctx, scored);
    const hydrated = await hydrateFeedItems(ctx, ranked);

    // Verify blocked post is excluded (top-level or grid children)
    const postIds = collectPostIds(hydrated as Array<{ type: string; post?: { id: bigint } }>);

    assert.ok(
      !postIds.includes(String(blockedPost.id)),
      'Should exclude post from blocked user'
    );
    assert.ok(
      postIds.includes(String(otherPost.id)),
      'Should include post from non-blocked user'
    );

  } finally {
    await cleanupUsers([
      blocker.id,
      blocked.id,
      ...(otherUser ? [otherUser.id] : [])
    ]);
  }
});

test('Feed pagination - cursor uses last post in response order', async () => {
  const user = await prisma.user.create({
    data: {
      email: `test-pagination-${Date.now()}@example.com`,
      passwordHash: 'hash',
      profile: { create: { displayName: 'User', isVisible: true } }
    }
  });

  try {
    // Create multiple posts with delays to ensure different timestamps
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay
      await createVideoPost({
        userId: user.id,
        text: `Post ${i}`,
        visibility: 'PUBLIC'
      });
    }

    const firstPage = await callFeed(user.id, { take: '5' });
    assert.strictEqual(firstPage.status, 200);
    const firstPostIds = collectPostIds(firstPage.body.items as Array<{ type: string; post?: { id: string } }>);
    assert.ok(firstPostIds.length > 0, 'First page should have at least 1 post');
    assert.ok(firstPage.body.nextCursorId, 'Should have next cursor');
    assert.strictEqual(
      firstPage.body.nextCursorId,
      firstPostIds[firstPostIds.length - 1],
      'Cursor should match last post ID in response order'
    );

    const secondPage = await callFeed(user.id, {
      take: '5',
      cursorId: String(firstPage.body.nextCursorId)
    });
    assert.strictEqual(secondPage.status, 200);
    const secondPostIds = collectPostIds(secondPage.body.items as Array<{ type: string; post?: { id: string } }>);

    const overlap = firstPostIds.filter((id) => secondPostIds.includes(id));
    assert.strictEqual(overlap.length, 0, 'Pages should not overlap');

  } finally {
    await cleanupUsers([user.id]);
  }
});

test('Feed suggestions - freshness contract (24 hour limit)', async () => {
  const viewer = await prisma.user.create({
    data: {
      email: `test-freshness-${Date.now()}-viewer@example.com`,
      passwordHash: 'hash',
      profile: { create: { displayName: 'Viewer', isVisible: true } }
    }
  });

  const candidate = await prisma.user.create({
    data: {
      email: `test-freshness-${Date.now()}-candidate@example.com`,
      passwordHash: 'hash',
      profile: { create: { displayName: 'Candidate', isVisible: true } }
    }
  });
  const staleCandidate = await prisma.user.create({
    data: {
      email: `test-freshness-${Date.now()}-stale@example.com`,
      passwordHash: 'hash',
      profile: { create: { displayName: 'Stale Candidate', isVisible: true } }
    }
  });

  try {
    // Create fresh score (within 24 hours)
    await prisma.matchScore.create({
      data: {
        userId: viewer.id,
        candidateUserId: candidate.id,
        score: 0.9,
        scoredAt: new Date() // Fresh
      }
    });

    // Create stale score (older than 24 hours)
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 2); // 2 days ago
    
    await prisma.matchScore.create({
      data: {
        userId: viewer.id,
        candidateUserId: staleCandidate.id,
        score: 0.5,
        scoredAt: staleDate // Stale
      }
    });

    // Test feed retrieval
    const req = createMockRequest(viewer.id, 20);
    const ctxResult = buildViewerContext(req);
    assert.ok(ctxResult.ok);
    const ctx = ctxResult.value;

    const candidates = await getCandidates(ctx);
    
    // Verify only fresh suggestions are included
    // (The candidate should appear if fresh score is used, but implementation
    // may filter by scoredAt in the query)
    const suggestionUserIds = candidates.suggestions.map(s => s.userId);
    
    // The candidate should appear if there's a fresh score
    // Note: actual implementation filters in profiles.ts query
    assert.ok(
      suggestionUserIds.includes(candidate.id),
      'Fresh candidate should be included'
    );
    assert.ok(
      !suggestionUserIds.includes(staleCandidate.id),
      'Stale candidate should be excluded'
    );

    // Cleanup
    await prisma.matchScore.deleteMany({
      where: {
        userId: viewer.id,
        candidateUserId: candidate.id
      }
    });
  } finally {
    await cleanupUsers([viewer.id, candidate.id, staleCandidate.id]);
  }
});

test('Feed response - returns items array with correct structure', async () => {
  const user = await prisma.user.create({
    data: {
      email: `test-structure-${Date.now()}@example.com`,
      passwordHash: 'hash',
      profile: { create: { displayName: 'User', isVisible: true } }
    }
  });

  try {
    const post = await createVideoPost({
      userId: user.id,
      text: 'Test post',
      visibility: 'PUBLIC'
    });

    const req = createMockRequest(null, 20);
    const ctxResult = buildViewerContext(req);
    assert.ok(ctxResult.ok);
    const ctx = ctxResult.value;

    const candidates = await getCandidates(ctx);
    const scored = await scoreCandidates(ctx, candidates);
    const ranked = mergeAndRank(ctx, scored);
    const hydrated = await hydrateFeedItems(ctx, ranked);

    // Verify structure
    assert.ok(Array.isArray(hydrated), 'Should return array');
    
    for (const item of hydrated) {
      assert.ok(
        ['post', 'suggestion', 'question', 'grid'].includes(item.type),
        'Item should have valid type'
      );

      if (item.type === 'grid') {
        assert.ok(item.grid?.items?.length, 'Grid item should have children');
        for (const child of item.grid.items) {
          assert.ok(['post', 'suggestion', 'question'].includes(child.type), 'Grid child type should be valid');
          if (child.type === 'post') {
            assert.ok(child.post !== undefined, 'Grid post should have post data');
          } else if (child.type === 'suggestion') {
            assert.ok(child.suggestion !== undefined, 'Grid suggestion should have suggestion data');
          } else {
            assert.ok(child.question !== undefined, 'Grid question should have question data');
          }
        }
        continue;
      }

      if (item.type === 'post') {
        assert.ok(item.post !== undefined, 'Post item should have post data');
        assert.ok(item.suggestion === undefined, 'Post item should not have suggestion data');
      } else if (item.type === 'suggestion') {
        assert.ok(item.suggestion !== undefined, 'Suggestion item should have suggestion data');
        assert.ok(item.post === undefined, 'Suggestion item should not have post data');
      } else {
        assert.ok(item.question !== undefined, 'Question item should have question data');
      }
    }

  } finally {
    await cleanupUsers([user.id]);
  }
});

test('Feed tiers - ordering and visibility', async () => {
  const viewer = await prisma.user.create({
    data: {
      email: `test-tier-${Date.now()}-viewer@example.com`,
      passwordHash: 'hash',
      profile: { create: { displayName: 'Viewer', isVisible: true } }
    }
  });
  const following = await prisma.user.create({
    data: {
      email: `test-tier-${Date.now()}-following@example.com`,
      passwordHash: 'hash',
      profile: { create: { displayName: 'Following', isVisible: true } }
    }
  });
  const follower = await prisma.user.create({
    data: {
      email: `test-tier-${Date.now()}-follower@example.com`,
      passwordHash: 'hash',
      profile: { create: { displayName: 'Follower', isVisible: true } }
    }
  });
  const stranger = await prisma.user.create({
    data: {
      email: `test-tier-${Date.now()}-stranger@example.com`,
      passwordHash: 'hash',
      profile: { create: { displayName: 'Stranger', isVisible: true } }
    }
  });

  try {
    await prisma.profileAccess.create({
      data: {
        ownerUserId: following.id,
        viewerUserId: viewer.id,
        status: 'GRANTED'
      }
    });
    await prisma.profileAccess.create({
      data: {
        ownerUserId: viewer.id,
        viewerUserId: follower.id,
        status: 'GRANTED'
      }
    });

    const selfPost = await createVideoPost({
      userId: viewer.id,
      text: 'Self post',
      visibility: 'PRIVATE'
    });
    const followingPost = await createVideoPost({
      userId: following.id,
      text: 'Following post',
      visibility: 'PRIVATE'
    });
    const followerPrivate = await createVideoPost({
      userId: follower.id,
      text: 'Follower private',
      visibility: 'PRIVATE'
    });
    const followerPublic = await createVideoPost({
      userId: follower.id,
      text: 'Follower public',
      visibility: 'PUBLIC'
    });
    const strangerPost = await createVideoPost({
      userId: stranger.id,
      text: 'Stranger post',
      visibility: 'PUBLIC'
    });

    const res = await callFeed(viewer.id, { take: '10' });
    assert.strictEqual(res.status, 200);
    const items = res.body.items as Array<{
      cardType?: string;
      items?: Array<{ type: string; post?: { id: string; user?: { id: string } } }>;
    }>;

    assert.ok(items.length >= 3, 'Should return feed items');
    const firstThree = items.slice(0, 3).map((card) => card.items?.[0]).filter(Boolean);
    assert.strictEqual(firstThree[0]?.type, 'post');
    assert.strictEqual(firstThree[0]?.post?.user?.id, String(viewer.id));
    assert.strictEqual(firstThree[1]?.type, 'post');
    assert.strictEqual(firstThree[1]?.post?.user?.id, String(following.id));
    assert.strictEqual(firstThree[2]?.type, 'post');
    assert.strictEqual(firstThree[2]?.post?.user?.id, String(follower.id));

    const postIds = collectPostIds(items as Array<{ items?: Array<{ type: string; post?: { id: string } }> }>);

    assert.ok(postIds.includes(String(selfPost.id)), 'Self post should appear');
    assert.ok(postIds.includes(String(followingPost.id)), 'Following private post should appear');
    assert.ok(postIds.includes(String(followerPublic.id)), 'Follower public post should appear');
    assert.ok(postIds.includes(String(strangerPost.id)), 'Everyone post should appear');
    assert.ok(!postIds.includes(String(followerPrivate.id)), 'Follower private post should be excluded');
  } finally {
    await cleanupUsers([viewer.id, following.id, follower.id, stranger.id]);
  }
});

test('Feed presort - bypass when cursorId provided', async () => {
  const user = await prisma.user.create({
    data: {
      email: `test-presort-${Date.now()}@example.com`,
      passwordHash: 'hash',
      profile: { create: { displayName: 'Presort User', isVisible: true } }
    }
  });

  try {
    const post = await prisma.post.create({
      data: {
        userId: user.id,
        text: 'Presort post',
        visibility: 'PUBLIC'
      }
    });

    const presortedItems = Array.from({ length: FEED_PRESORT_MIN_SEGMENT_ITEMS }, () => ({
      type: 'post' as const,
      id: String(post.id),
      score: 1,
      actorId: user.id,
      source: 'post' as const,
      createdAt: Date.now(),
      actorName: 'Presort User',
      actorAvatarUrl: null,
      textPreview: 'Presort post'
    }));

    await storePresortedSegment({
      userId: user.id,
      segmentIndex: 0,
      items: presortedItems,
      phase1Json: null,
      algorithmVersion: FEED_CONFIG_VERSION,
      expiresAt: new Date(Date.now() + 60_000)
    });

    const res = await callFeed(user.id, { take: '10', cursorId: String(post.id) });
    assert.strictEqual(res.status, 200);
    const postIds = collectPostIds(res.body.items as Array<{ type: string; post?: { id: string } }>);
    assert.ok(!postIds.includes(String(post.id)), 'Cursor should bypass presort posts');
  } finally {
    await invalidateAllSegmentsForUser(user.id);
    await cleanupUsers([user.id]);
  }
});

test('Feed presort - records seen entries', async () => {
  const viewer = await prisma.user.create({
    data: {
      email: `test-presort-seen-${Date.now()}-viewer@example.com`,
      passwordHash: 'hash',
      profile: { create: { displayName: 'Viewer', isVisible: true } }
    }
  });
  const author = await prisma.user.create({
    data: {
      email: `test-presort-seen-${Date.now()}-author@example.com`,
      passwordHash: 'hash',
      profile: { create: { displayName: 'Author', isVisible: true } }
    }
  });
  const suggester = await prisma.user.create({
    data: {
      email: `test-presort-seen-${Date.now()}-suggester@example.com`,
      passwordHash: 'hash',
      profile: { create: { displayName: 'Suggester', isVisible: true } }
    }
  });

  try {
    const post = await prisma.post.create({
      data: {
        userId: author.id,
        text: 'Seen post',
        visibility: 'PUBLIC'
      }
    });

    const phase1Json = JSON.stringify({
      items: [
        {
          cardType: 'grid',
          items: [
            {
              id: String(post.id),
              kind: 'post',
              actor: { id: String(author.id), name: 'Author', avatarUrl: null },
              textPreview: 'Seen post',
              createdAt: Date.now()
            },
            {
              id: String(suggester.id),
              kind: 'profile',
              actor: { id: String(suggester.id), name: 'Suggester', avatarUrl: null },
              textPreview: null,
              createdAt: Date.now()
            }
          ]
        }
      ],
      nextCursorId: null
    });

    const basePostItem = {
      type: 'post' as const,
      id: String(post.id),
      score: 1,
      actorId: author.id,
      source: 'post' as const,
      createdAt: Date.now(),
      actorName: 'Author',
      actorAvatarUrl: null,
      textPreview: 'Seen post'
    };

    const gridItem = {
      type: 'grid' as const,
      id: `grid:post:${post.id}|suggestion:${suggester.id}`,
      score: 1,
      actorId: 0n,
      source: 'grid' as const,
      presentation: { mode: 'grid' as const },
      items: [
        basePostItem,
        {
          type: 'suggestion' as const,
          id: String(suggester.id),
          score: 1,
          actorId: suggester.id,
          source: 'suggested' as const,
          createdAt: Date.now(),
          actorName: 'Suggester',
          actorAvatarUrl: null,
          textPreview: null
        }
      ]
    };

    const presortedItems = Array.from({ length: FEED_PRESORT_MIN_SEGMENT_ITEMS - 1 }, () => basePostItem);
    presortedItems.unshift(gridItem);

    await storePresortedSegment({
      userId: viewer.id,
      segmentIndex: 0,
      items: presortedItems,
      phase1Json,
      algorithmVersion: FEED_CONFIG_VERSION,
      expiresAt: new Date(Date.now() + 60_000)
    });

    const res = await callFeed(viewer.id, { take: '2', lite: '1' });
    assert.strictEqual(res.status, 200);

    const seenPost = await prisma.feedSeen.findFirst({
      where: {
        viewerUserId: viewer.id,
        itemType: 'POST',
        itemId: post.id
      }
    });
    const seenSuggestion = await prisma.feedSeen.findFirst({
      where: {
        viewerUserId: viewer.id,
        itemType: 'SUGGESTION',
        itemId: suggester.id
      }
    });
    assert.ok(seenPost, 'Seen record should be created for grid post child');
    assert.ok(seenSuggestion, 'Seen record should be created for grid suggestion child');
  } finally {
    await invalidateAllSegmentsForUser(viewer.id);
    await cleanupUsers([viewer.id, author.id, suggester.id]);
  }
});
