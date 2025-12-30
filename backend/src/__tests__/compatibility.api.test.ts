import { before, after, test } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';
import { createApp } from '../app/createApp.js';
import { prisma } from '../lib/prisma/client.js';
import { recomputeCompatibilityForUser } from '../jobs/compatibilityJob.js';

type JsonValue = Record<string, any> | Array<any> | string | number | boolean | null;

class CookieJar {
  private cookies = new Map<string, string>();

  updateFrom(response: Response) {
    const getSetCookie = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
    const setCookies = typeof getSetCookie === 'function' ? getSetCookie.call(response.headers) : null;
    const header = response.headers.get('set-cookie');
    const entries = setCookies ?? (header ? [header] : []);
    for (const entry of entries) {
      const [pair] = entry.split(';');
      if (!pair) continue;
      const eq = pair.indexOf('=');
      if (eq === -1) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (!name) continue;
      this.cookies.set(name, value);
    }
  }

  header() {
    if (!this.cookies.size) return '';
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }
}

type RequestOptions = {
  method?: string;
  body?: JsonValue;
  jar?: CookieJar;
};

let server: Server;
let baseUrl = '';

before(async () => {
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  const port = typeof addr === 'string' ? 80 : addr?.port;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

function uniqueKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function request(path: string, options: RequestOptions = {}) {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.jar) {
    const cookieHeader = options.jar.header();
    if (cookieHeader) headers['Cookie'] = cookieHeader;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? (options.body ? 'POST' : 'GET'),
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  if (options.jar) {
    options.jar.updateFrom(res);
  }

  const contentType = res.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json') ? await res.json() : await res.text();
  return { status: res.status, body };
}

async function signupUser(label: string) {
  const jar = new CookieJar();
  const email = `${uniqueKey(label)}@example.com`;
  const password = 'TestPass123!';
  const res = await request('/api/auth/signup', {
    method: 'POST',
    body: { email, password },
    jar
  });
  assert.strictEqual(res.status, 200);
  const userId = BigInt(res.body.userId);
  return { userId, jar, email, password };
}

async function seedQuizResults(userIds: bigint[]) {
  const quiz = await prisma.quiz.create({
    data: { slug: uniqueKey('compat-quiz'), title: 'Compatibility Quiz' }
  });

  await prisma.quizResult.createMany({
    data: userIds.map((userId, index) => ({
      userId,
      quizId: quiz.id,
      answers: { q1: index % 2 === 0 ? 'a' : 'b' },
      scoreVec: [0.4, 0.6]
    }))
  });

  return quiz.id;
}

async function safeDelete(promise: Promise<unknown>) {
  try {
    await promise;
  } catch {}
}

async function cleanupUsers(userIds: bigint[]) {
  if (!userIds.length) return;
  await safeDelete(prisma.messageReceipt.deleteMany({ where: { userId: { in: userIds } } }));
  await safeDelete(prisma.message.deleteMany({ where: { senderId: { in: userIds } } }));
  await safeDelete(
    prisma.conversation.deleteMany({
      where: { OR: [{ userAId: { in: userIds } }, { userBId: { in: userIds } }] }
    })
  );
  await safeDelete(
    prisma.match.deleteMany({
      where: { OR: [{ userAId: { in: userIds } }, { userBId: { in: userIds } }] }
    })
  );
  await safeDelete(
    prisma.like.deleteMany({
      where: { OR: [{ fromUserId: { in: userIds } }, { toUserId: { in: userIds } }] }
    })
  );
  await safeDelete(
    prisma.profileAccess.deleteMany({
      where: { OR: [{ ownerUserId: { in: userIds } }, { viewerUserId: { in: userIds } }] }
    })
  );
  await safeDelete(
    prisma.userCompatibility.deleteMany({
      where: { OR: [{ viewerUserId: { in: userIds } }, { targetUserId: { in: userIds } }] }
    })
  );
  await safeDelete(
    prisma.matchScore.deleteMany({
      where: { OR: [{ userId: { in: userIds } }, { candidateUserId: { in: userIds } }] }
    })
  );
  await safeDelete(prisma.quizResult.deleteMany({ where: { userId: { in: userIds } } }));
  await safeDelete(prisma.userInterest.deleteMany({ where: { userId: { in: userIds } } }));
  await safeDelete(prisma.profile.deleteMany({ where: { userId: { in: userIds } } }));
  await safeDelete(prisma.user.deleteMany({ where: { id: { in: userIds } } }));
}

test('profiles endpoint exposes compatibility summary', async () => {
  const created: bigint[] = [];
  let quizId: bigint | null = null;

  try {
    const viewer = await signupUser('compat-profile-viewer');
    const candidate = await signupUser('compat-profile-target');
    created.push(viewer.userId, candidate.userId);

    quizId = await seedQuizResults([viewer.userId, candidate.userId]);
    await prisma.matchScore.create({
      data: {
        userId: viewer.userId,
        candidateUserId: candidate.userId,
        score: 0.75,
        scoredAt: new Date()
      }
    });

    await recomputeCompatibilityForUser(viewer.userId);

    const res = await request(`/api/profiles/${candidate.userId}`, { jar: viewer.jar });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.compatibility?.status, 'READY');
    assert.ok(res.body.compatibility?.score != null);
  } finally {
    if (quizId) {
      await safeDelete(prisma.quiz.deleteMany({ where: { id: quizId } }));
    }
    await cleanupUsers(created);
  }
});

test('matches and inbox expose compatibility summaries', async () => {
  const created: bigint[] = [];
  let quizId: bigint | null = null;

  try {
    const viewer = await signupUser('compat-match-viewer');
    const candidate = await signupUser('compat-match-target');
    created.push(viewer.userId, candidate.userId);

    quizId = await seedQuizResults([viewer.userId, candidate.userId]);

    const likeA = await request('/api/likes', {
      method: 'POST',
      body: { toUserId: String(candidate.userId), action: 'LIKE' },
      jar: viewer.jar
    });
    assert.strictEqual(likeA.status, 200);

    const likeB = await request('/api/likes', {
      method: 'POST',
      body: { toUserId: String(viewer.userId), action: 'LIKE' },
      jar: candidate.jar
    });
    assert.strictEqual(likeB.status, 200);

    await recomputeCompatibilityForUser(viewer.userId);

    const matchesRes = await request('/api/matches', { jar: viewer.jar });
    assert.strictEqual(matchesRes.status, 200);
    const match = matchesRes.body.matches?.[0];
    const other = match.userA.id === String(viewer.userId) ? match.userB : match.userA;
    assert.strictEqual(other.compatibility?.status, 'READY');

    const inboxRes = await request('/api/inbox', { jar: viewer.jar });
    assert.strictEqual(inboxRes.status, 200);
    const convo = inboxRes.body.conversations?.[0];
    assert.strictEqual(convo.otherUser.compatibility?.status, 'READY');
  } finally {
    if (quizId) {
      await safeDelete(prisma.quiz.deleteMany({ where: { id: quizId } }));
    }
    await cleanupUsers(created);
  }
});

test('suggestions endpoint exposes compatibility summary', async () => {
  const created: bigint[] = [];
  let quizId: bigint | null = null;

  try {
    const viewer = await signupUser('compat-suggest-viewer');
    const candidate = await signupUser('compat-suggest-target');
    created.push(viewer.userId, candidate.userId);

    quizId = await seedQuizResults([viewer.userId, candidate.userId]);
    await prisma.matchScore.create({
      data: {
        userId: viewer.userId,
        candidateUserId: candidate.userId,
        score: 0.82,
        scoredAt: new Date()
      }
    });

    await recomputeCompatibilityForUser(viewer.userId);

    const suggestionsRes = await request('/api/suggestions', { jar: viewer.jar });
    assert.strictEqual(suggestionsRes.status, 200);
    const suggestion = suggestionsRes.body.suggestions?.find(
      (item: { userId?: string | number }) => String(item.userId) === String(candidate.userId)
    );
    assert.strictEqual(suggestion?.compatibility?.status, 'READY');
  } finally {
    if (quizId) {
      await safeDelete(prisma.quiz.deleteMany({ where: { id: quizId } }));
    }
    await cleanupUsers(created);
  }
});

test('followers and following endpoints expose compatibility summary', async () => {
  const created: bigint[] = [];
  let quizId: bigint | null = null;

  try {
    const follower = await signupUser('compat-follow-follower');
    const owner = await signupUser('compat-follow-owner');
    created.push(follower.userId, owner.userId);

    quizId = await seedQuizResults([follower.userId, owner.userId]);

    const requestRes = await request(`/api/profiles/${owner.userId}/access-requests`, {
      method: 'POST',
      jar: follower.jar
    });
    assert.strictEqual(requestRes.status, 200);
    const requestId = requestRes.body.requestId;

    const approveRes = await request(`/api/profiles/access-requests/${requestId}/approve`, {
      method: 'POST',
      jar: owner.jar
    });
    assert.strictEqual(approveRes.status, 200);

    await Promise.all([
      recomputeCompatibilityForUser(follower.userId),
      recomputeCompatibilityForUser(owner.userId)
    ]);

    const followingRes = await request(`/api/profiles/${follower.userId}/following`, { jar: follower.jar });
    assert.strictEqual(followingRes.status, 200);
    const followingEntry = followingRes.body.following?.find(
      (item: { userId?: string | number }) => String(item.userId) === String(owner.userId)
    );
    assert.strictEqual(followingEntry?.compatibility?.status, 'READY');

    const followersRes = await request(`/api/profiles/${owner.userId}/followers`, { jar: owner.jar });
    assert.strictEqual(followersRes.status, 200);
    const followerEntry = followersRes.body.followers?.find(
      (item: { userId?: string | number }) => String(item.userId) === String(follower.userId)
    );
    assert.strictEqual(followerEntry?.compatibility?.status, 'READY');
  } finally {
    if (quizId) {
      await safeDelete(prisma.quiz.deleteMany({ where: { id: quizId } }));
    }
    await cleanupUsers(created);
  }
});
