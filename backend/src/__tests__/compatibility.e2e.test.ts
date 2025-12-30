import { test } from 'node:test';
import assert from 'node:assert';
import { prisma } from '../lib/prisma/client.js';
import { recomputeCompatibilityForUser } from '../jobs/compatibilityJob.js';
import { buildViewerContext } from '../registry/domains/feed/context.js';
import { getCandidates } from '../registry/domains/feed/candidates/index.js';
import { scoreCandidates } from '../registry/domains/feed/scoring/index.js';
import { mergeAndRank } from '../registry/domains/feed/ranking/index.js';
import { hydrateFeedItems } from '../registry/domains/feed/hydration/index.js';
import type { Request } from 'express';

function uniqueKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createMockRequest(userId: bigint | null, take = 20): Request {
  return {
    ctx: { userId },
    query: { take: String(take) }
  } as unknown as Request;
}

async function safeDelete(promise: Promise<unknown>) {
  try {
    await promise;
  } catch {}
}

test('Compatibility job computes READY score when signals exist', async () => {
  let viewerId: bigint | null = null;
  let candidateId: bigint | null = null;
  let quizId: bigint | null = null;
  let subjectId: bigint | null = null;
  let interestId: bigint | null = null;

  try {
    const viewer = await prisma.user.create({
      data: {
        email: `${uniqueKey('compat-ready-viewer')}@example.com`,
        passwordHash: 'hash',
        profile: { create: { displayName: 'Viewer', isVisible: true } }
      }
    });
    const candidate = await prisma.user.create({
      data: {
        email: `${uniqueKey('compat-ready-candidate')}@example.com`,
        passwordHash: 'hash',
        profile: { create: { displayName: 'Candidate', isVisible: true } }
      }
    });

    viewerId = viewer.id;
    candidateId = candidate.id;

    const quiz = await prisma.quiz.create({
      data: { slug: uniqueKey('compat-quiz'), title: 'Compatibility Quiz' }
    });
    quizId = quiz.id;

    await prisma.quizResult.createMany({
      data: [
        { userId: viewer.id, quizId: quiz.id, answers: { q1: 'a' }, scoreVec: [0.4, 0.6] },
        { userId: candidate.id, quizId: quiz.id, answers: { q1: 'a' }, scoreVec: [0.5, 0.5] }
      ]
    });

    const subject = await prisma.interestSubject.create({
      data: { key: uniqueKey('subject'), label: 'Music' }
    });
    subjectId = subject.id;
    const interest = await prisma.interest.create({
      data: { subjectId: subject.id, key: uniqueKey('interest'), label: 'Jazz' }
    });
    interestId = interest.id;

    await prisma.userInterest.createMany({
      data: [
        { userId: viewer.id, subjectId: subject.id, interestId: interest.id },
        { userId: candidate.id, subjectId: subject.id, interestId: interest.id }
      ]
    });

    await prisma.matchScore.create({
      data: { userId: viewer.id, candidateUserId: candidate.id, score: 0.8 }
    });

    await recomputeCompatibilityForUser(viewer.id);

    const row = await prisma.userCompatibility.findUnique({
      where: { viewerUserId_targetUserId: { viewerUserId: viewer.id, targetUserId: candidate.id } }
    });

    assert.ok(row, 'Compatibility row should exist');
    assert.strictEqual(row?.status, 'READY');
    assert.ok(row?.score !== null, 'Score should be populated');
  } finally {
    if (viewerId && candidateId) {
      await safeDelete(prisma.userCompatibility.deleteMany({ where: { viewerUserId: viewerId } }));
      await safeDelete(prisma.matchScore.deleteMany({ where: { userId: viewerId } }));
      await safeDelete(prisma.quizResult.deleteMany({ where: { userId: { in: [viewerId, candidateId] } } }));
      await safeDelete(prisma.userInterest.deleteMany({ where: { userId: { in: [viewerId, candidateId] } } }));
      await safeDelete(prisma.profile.deleteMany({ where: { userId: { in: [viewerId, candidateId] } } }));
      await safeDelete(prisma.user.deleteMany({ where: { id: { in: [viewerId, candidateId] } } }));
    }
    if (interestId) {
      await safeDelete(prisma.interest.deleteMany({ where: { id: interestId } }));
    }
    if (subjectId) {
      await safeDelete(prisma.interestSubject.deleteMany({ where: { id: subjectId } }));
    }
    if (quizId) {
      await safeDelete(prisma.quiz.deleteMany({ where: { id: quizId } }));
    }
  }
});

test('Compatibility job marks INSUFFICIENT_DATA when signals are missing', async () => {
  let viewerId: bigint | null = null;
  let candidateId: bigint | null = null;

  try {
    const viewer = await prisma.user.create({
      data: {
        email: `${uniqueKey('compat-missing-viewer')}@example.com`,
        passwordHash: 'hash',
        profile: { create: { displayName: 'Viewer', isVisible: true } }
      }
    });
    const candidate = await prisma.user.create({
      data: {
        email: `${uniqueKey('compat-missing-candidate')}@example.com`,
        passwordHash: 'hash',
        profile: { create: { displayName: 'Candidate', isVisible: true } }
      }
    });

    viewerId = viewer.id;
    candidateId = candidate.id;

    await prisma.matchScore.create({
      data: { userId: viewer.id, candidateUserId: candidate.id, score: 0.4 }
    });

    await recomputeCompatibilityForUser(viewer.id);

    const row = await prisma.userCompatibility.findUnique({
      where: { viewerUserId_targetUserId: { viewerUserId: viewer.id, targetUserId: candidate.id } }
    });

    assert.ok(row, 'Compatibility row should exist');
    assert.strictEqual(row?.status, 'INSUFFICIENT_DATA');
    assert.strictEqual(row?.score, null);
  } finally {
    if (viewerId && candidateId) {
      await safeDelete(prisma.userCompatibility.deleteMany({ where: { viewerUserId: viewerId } }));
      await safeDelete(prisma.matchScore.deleteMany({ where: { userId: viewerId } }));
      await safeDelete(prisma.profile.deleteMany({ where: { userId: { in: [viewerId, candidateId] } } }));
      await safeDelete(prisma.user.deleteMany({ where: { id: { in: [viewerId, candidateId] } } }));
    }
  }
});

test('Feed suggestions include compatibility summary', async () => {
  let viewerId: bigint | null = null;
  let candidateId: bigint | null = null;
  let quizId: bigint | null = null;

  try {
    const viewer = await prisma.user.create({
      data: {
        email: `${uniqueKey('compat-feed-viewer')}@example.com`,
        passwordHash: 'hash',
        profile: { create: { displayName: 'Viewer', isVisible: true } }
      }
    });
    const candidate = await prisma.user.create({
      data: {
        email: `${uniqueKey('compat-feed-candidate')}@example.com`,
        passwordHash: 'hash',
        profile: { create: { displayName: 'Candidate', isVisible: true } }
      }
    });

    viewerId = viewer.id;
    candidateId = candidate.id;

    const quiz = await prisma.quiz.create({
      data: { slug: uniqueKey('compat-feed-quiz'), title: 'Compatibility Quiz' }
    });
    quizId = quiz.id;

    await prisma.quizResult.createMany({
      data: [
        { userId: viewer.id, quizId: quiz.id, answers: { q1: 'a' }, scoreVec: [0.4, 0.6] },
        { userId: candidate.id, quizId: quiz.id, answers: { q1: 'a' }, scoreVec: [0.5, 0.5] }
      ]
    });

    await prisma.matchScore.create({
      data: { userId: viewer.id, candidateUserId: candidate.id, score: 0.7, scoredAt: new Date() }
    });

    await recomputeCompatibilityForUser(viewer.id);

    const req = createMockRequest(viewer.id, 10);
    const ctxResult = buildViewerContext(req);
    assert.ok(ctxResult.ok);
    const ctx = ctxResult.value;

    const candidates = await getCandidates(ctx);
    const scored = await scoreCandidates(ctx, candidates);
    const ranked = mergeAndRank(ctx, scored);
    const hydrated = await hydrateFeedItems(ctx, ranked);

    const suggestion = hydrated.find(
      (item) => item.type === 'suggestion' && item.suggestion?.userId === candidate.id
    );

    assert.ok(suggestion?.suggestion?.compatibility, 'Compatibility should be hydrated on suggestion');
    assert.strictEqual(suggestion?.suggestion?.compatibility?.status, 'READY');
  } finally {
    if (viewerId && candidateId) {
      await safeDelete(prisma.userCompatibility.deleteMany({ where: { viewerUserId: viewerId } }));
      await safeDelete(prisma.matchScore.deleteMany({ where: { userId: viewerId } }));
      await safeDelete(prisma.quizResult.deleteMany({ where: { userId: { in: [viewerId, candidateId] } } }));
      await safeDelete(prisma.profile.deleteMany({ where: { userId: { in: [viewerId, candidateId] } } }));
      await safeDelete(prisma.user.deleteMany({ where: { id: { in: [viewerId, candidateId] } } }));
    }
    if (quizId) {
      await safeDelete(prisma.quiz.deleteMany({ where: { id: quizId } }));
    }
  }
});
