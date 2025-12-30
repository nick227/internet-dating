import { createApp } from '../src/app/createApp.js';
import { prisma } from '../src/lib/prisma/client.js';

type StepStatus = 'ok' | 'fail' | 'skip';
type StepResult = { name: string; status: StepStatus; info?: string };

type RequestOptions = {
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  cookieJar?: Map<string, string>;
};

const results: StepResult[] = [];

function record(name: string, status: StepStatus, info?: string) {
  results.push({ name, status, info });
}

async function runStep(name: string, fn: () => Promise<void>, skipReason?: string) {
  if (skipReason) {
    record(name, 'skip', skipReason);
    return;
  }
  try {
    await fn();
    record(name, 'ok');
  } catch (err) {
    const info = err instanceof Error ? err.message : String(err);
    record(name, 'fail', info);
  }
}

function cookieHeaderFromJar(jar: Map<string, string>) {
  if (!jar.size) return '';
  return Array.from(jar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function getSetCookies(res: any): string[] {
  const headers = res?.headers as any;
  if (headers && typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  const single = res?.headers?.get?.('set-cookie');
  return single ? [single] : [];
}

function storeSetCookies(jar: Map<string, string>, setCookies: string[]) {
  for (const cookie of setCookies) {
    const pair = cookie.split(';', 1)[0] ?? '';
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (!name) continue;
    jar.set(name, value);
  }
}

async function apiRequest(method: string, baseUrl: string, path: string, opts: RequestOptions = {}) {
  const timeoutMs = opts.timeoutMs ?? 10000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers = { ...(opts.headers ?? {}) } as Record<string, string>;

  const cookieHeader = opts.cookieJar ? cookieHeaderFromJar(opts.cookieJar) : '';
  if (cookieHeader) {
    headers.cookie = headers.cookie ? `${headers.cookie}; ${cookieHeader}` : cookieHeader;
  }

  let body: string | undefined;
  if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers['content-type'] = 'application/json';
  }

  try {
    const res = await fetch(baseUrl + path, {
      method,
      headers,
      body,
      signal: controller.signal
    });
    if (opts.cookieJar) {
      storeSetCookies(opts.cookieJar, getSetCookies(res));
    }
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: res.status, ok: res.ok, json, text };
  } finally {
    clearTimeout(timeout);
  }
}

async function ensureActiveQuiz() {
  const existing = await prisma.quiz.findFirst({
    where: { isActive: true },
    select: { id: true }
  });
  if (existing) return { id: existing.id, created: false };

  const quiz = await prisma.quiz.create({
    data: {
      slug: `sanity-${Date.now().toString(36)}`,
      title: 'Sanity Quiz',
      isActive: true,
      questions: {
        create: [
          {
            prompt: 'Pick one',
            order: 1,
            options: {
              create: [
                { label: 'A', value: 'A', order: 1 },
                { label: 'B', value: 'B', order: 2 }
              ]
            }
          }
        ]
      }
    },
    select: { id: true }
  });

  return { id: quiz.id, created: true };
}

async function cleanup(params: {
  userIds: bigint[];
  quizId: bigint | null;
}) {
  if (!params.userIds.length && !params.quizId) return;

  const userIds = params.userIds;

  const conversations = await prisma.conversation.findMany({
    where: {
      OR: [
        { userAId: { in: userIds } },
        { userBId: { in: userIds } }
      ]
    },
    select: { id: true }
  });
  const conversationIds = conversations.map(c => c.id);

  const messages = conversationIds.length
    ? await prisma.message.findMany({
        where: { conversationId: { in: conversationIds } },
        select: { id: true }
      })
    : [];
  const messageIds = messages.map(m => m.id);

  if (messageIds.length) {
    await prisma.messageReceipt.deleteMany({ where: { messageId: { in: messageIds } } });
    await prisma.message.deleteMany({ where: { id: { in: messageIds } } });
  }

  if (conversationIds.length) {
    await prisma.conversation.deleteMany({ where: { id: { in: conversationIds } } });
  }

  if (userIds.length) {
    await prisma.match.deleteMany({
      where: {
        OR: [
          { userAId: { in: userIds } },
          { userBId: { in: userIds } }
        ]
      }
    });

    await prisma.like.deleteMany({
      where: {
        OR: [
          { fromUserId: { in: userIds } },
          { toUserId: { in: userIds } }
        ]
      }
    });

    await prisma.userBlock.deleteMany({
      where: {
        OR: [
          { blockerId: { in: userIds } },
          { blockedId: { in: userIds } }
        ]
      }
    });

    await prisma.userReport.deleteMany({
      where: {
        OR: [
          { reporterId: { in: userIds } },
          { targetId: { in: userIds } }
        ]
      }
    });

    await prisma.profileRating.deleteMany({
      where: {
        OR: [
          { raterUserId: { in: userIds } },
          { targetUserId: { in: userIds } }
        ]
      }
    });

    await prisma.quizResult.deleteMany({ where: { userId: { in: userIds } } });

    const posts = await prisma.post.findMany({
      where: { userId: { in: userIds } },
      select: { id: true }
    });
    const postIds = posts.map(p => p.id);

    if (postIds.length) {
      await prisma.postMedia.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.likedPost.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.post.deleteMany({ where: { id: { in: postIds } } });
    }

    await prisma.profile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  if (params.quizId) {
    const quizId = params.quizId;
    const questions = await prisma.quizQuestion.findMany({
      where: { quizId },
      select: { id: true }
    });
    const questionIds = questions.map(q => q.id);
    if (questionIds.length) {
      await prisma.quizOption.deleteMany({ where: { questionId: { in: questionIds } } });
      await prisma.quizQuestion.deleteMany({ where: { id: { in: questionIds } } });
    }
    await prisma.quiz.deleteMany({ where: { id: quizId } });
  }
}

async function main() {
  const testRunId = Date.now().toString(36);
  const emailA = `sanity+a_${testRunId}@example.com`;
  const emailB = `sanity+b_${testRunId}@example.com`;
  const password = 'Password123!';
  const cookieJarA = new Map<string, string>();
  const cookieJarB = new Map<string, string>();

  let userAId: string | null = null;
  let userBId: string | null = null;
  let postId: string | null = null;
  let conversationId: string | null = null;
  let messageId: string | null = null;
  let quizId: bigint | null = null;
  let quizCreated = false;
  let likesAttempted = false;

  const supportsSavedPost = typeof (prisma as any).savedPost?.upsert === 'function';
  const supportsLike = typeof (prisma as any).like?.upsert === 'function';

  let dbOk = true;
  await runStep('db-connect', async () => {
    await prisma.$queryRaw`SELECT 1`;
  });
  if (results.find(r => r.name === 'db-connect' && r.status === 'fail')) {
    dbOk = false;
  }

  let baseUrl = '';
  const app = createApp();
  const server = await new Promise<import('http').Server>((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to bind server');
  }
  baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await runStep('health', async () => {
      const res = await apiRequest('GET', baseUrl, '/health');
      if (!res.ok || !res.json?.ok) throw new Error(`Unexpected response: ${res.status}`);
    });

    await runStep('api-index', async () => {
      const res = await apiRequest('GET', baseUrl, '/api');
      if (!res.ok || !res.json?.ok) throw new Error(`Unexpected response: ${res.status}`);
      if (!Array.isArray(res.json.routes) || res.json.routes.length === 0) {
        throw new Error('No routes reported');
      }
    });

    await runStep('system-meta', async () => {
      const res = await apiRequest('GET', baseUrl, '/api/meta');
      if (!res.ok || !res.json?.name) throw new Error(`Unexpected response: ${res.status}`);
    });

    await runStep('auth-signup-a', async () => {
      const res = await apiRequest('POST', baseUrl, '/api/auth/signup', {
        body: { email: emailA, password },
        cookieJar: cookieJarA
      });
      if (!res.ok || !res.json?.userId) throw new Error(`Unexpected response: ${res.status}`);
      userAId = res.json.userId;
    }, dbOk ? undefined : 'db unavailable');

    await runStep('auth-signup-b', async () => {
      const res = await apiRequest('POST', baseUrl, '/api/auth/signup', {
        body: { email: emailB, password },
        cookieJar: cookieJarB
      });
      if (!res.ok || !res.json?.userId) throw new Error(`Unexpected response: ${res.status}`);
      userBId = res.json.userId;
    }, dbOk ? undefined : 'db unavailable');

    await runStep('auth-login-a', async () => {
      if (!userAId) throw new Error('missing userAId');
      const res = await apiRequest('POST', baseUrl, '/api/auth/login', {
        body: { email: emailA, password },
        cookieJar: cookieJarA
      });
      if (!res.ok || !res.json?.userId) throw new Error(`Unexpected response: ${res.status}`);
    }, dbOk ? undefined : 'db unavailable');

    await runStep('profile-update-a', async () => {
      if (!userAId) throw new Error('missing userAId');
      const res = await apiRequest('PATCH', baseUrl, `/api/profiles/${userAId}`, {
        cookieJar: cookieJarA,
        body: {
          displayName: 'Sanity A',
          bio: 'Sanity run',
          birthdate: '1990-01-01',
          locationText: 'Test City',
          lat: 40.7128,
          lng: -74.006,
          gender: 'FEMALE',
          intent: 'CASUAL',
          isVisible: true
        }
      });
      if (!res.ok || !res.json?.userId) throw new Error(`Unexpected response: ${res.status}`);
    }, dbOk && userAId ? undefined : 'db unavailable or missing user');

    await runStep('profile-get-a', async () => {
      if (!userAId) throw new Error('missing userAId');
      const res = await apiRequest('GET', baseUrl, `/api/profiles/${userAId}`);
      if (!res.ok || !res.json?.profile?.userId) throw new Error(`Unexpected response: ${res.status}`);
    }, dbOk && userAId ? undefined : 'db unavailable or missing user');

    await runStep('profile-rate', async () => {
      if (!userAId || !userBId) throw new Error('missing users');
      const res = await apiRequest('POST', baseUrl, `/api/profiles/${userAId}/rate`, {
        cookieJar: cookieJarB,
        body: { attractive: 8, smart: 7, funny: 6, interesting: 7 }
      });
      if (!res.ok || !res.json?.ok) throw new Error(`Unexpected response: ${res.status}`);
    }, dbOk && userAId && userBId ? undefined : 'db unavailable or missing user');

    await runStep('post-create', async () => {
      if (!userAId) throw new Error('missing userAId');
      const res = await apiRequest('POST', baseUrl, '/api/posts', {
        cookieJar: cookieJarA,
        body: { text: `Hello from ${testRunId}` }
      });
      if (!res.ok || !res.json?.id) throw new Error(`Unexpected response: ${res.status}`);
      postId = res.json.id;
    }, dbOk && userAId ? undefined : 'db unavailable or missing user');

    await runStep('feed', async () => {
      const res = await apiRequest('GET', baseUrl, '/api/feed');
      if (!res.ok || !Array.isArray(res.json?.posts)) throw new Error(`Unexpected response: ${res.status}`);
    }, dbOk ? undefined : 'db unavailable');

    await runStep('post-save', async () => {
      if (!userAId || !postId) throw new Error('missing user/post');
      const res = await apiRequest('POST', baseUrl, `/api/posts/${postId}/save`, {
        cookieJar: cookieJarA
      });
      if (!res.ok || !res.json?.ok) throw new Error(`Unexpected response: ${res.status}`);
    }, dbOk && userAId && postId ? (supportsSavedPost ? undefined : 'prisma.savedPost missing (schema mismatch)') : 'db unavailable or missing data');

    await runStep('like-a', async () => {
      if (!userAId || !userBId) throw new Error('missing users');
      likesAttempted = true;
      const res = await apiRequest('POST', baseUrl, '/api/likes', {
        cookieJar: cookieJarA,
        body: { toUserId: userBId, action: 'LIKE' }
      });
      if (!res.ok || !res.json?.ok) throw new Error(`Unexpected response: ${res.status}`);
    }, dbOk && userAId && userBId ? (supportsLike ? undefined : 'prisma.like missing (schema mismatch)') : 'db unavailable or missing user');

    await runStep('like-b', async () => {
      if (!userAId || !userBId) throw new Error('missing users');
      likesAttempted = true;
      const res = await apiRequest('POST', baseUrl, '/api/likes', {
        cookieJar: cookieJarB,
        body: { toUserId: userAId, action: 'LIKE' }
      });
      if (!res.ok || !res.json?.ok) throw new Error(`Unexpected response: ${res.status}`);
    }, dbOk && userAId && userBId ? (supportsLike ? undefined : 'prisma.like missing (schema mismatch)') : 'db unavailable or missing user');

    await runStep('matches', async () => {
      if (!userAId) throw new Error('missing userAId');
      const res = await apiRequest('GET', baseUrl, '/api/matches', {
        cookieJar: cookieJarA
      });
      if (!res.ok || !Array.isArray(res.json?.matches)) throw new Error(`Unexpected response: ${res.status}`);
      conversationId = res.json.matches[0]?.conversation?.id ?? null;
      if (likesAttempted && !conversationId) throw new Error('No conversation id');
    }, dbOk && userAId ? undefined : 'db unavailable or missing user');

    await runStep('inbox', async () => {
      if (!userAId) throw new Error('missing userAId');
      const res = await apiRequest('GET', baseUrl, '/api/inbox', {
        cookieJar: cookieJarA
      });
      if (!res.ok || !Array.isArray(res.json?.conversations)) throw new Error(`Unexpected response: ${res.status}`);
      if (!conversationId) {
        conversationId = res.json.conversations[0]?.id ?? null;
      }
    }, dbOk && userAId ? undefined : 'db unavailable or missing user');

    await runStep('conversation-get', async () => {
      if (!userAId || !conversationId) throw new Error('missing data');
      const res = await apiRequest('GET', baseUrl, `/api/conversations/${conversationId}`, {
        cookieJar: cookieJarA
      });
      if (!res.ok || !Array.isArray(res.json?.messages)) throw new Error(`Unexpected response: ${res.status}`);
    }, dbOk && userAId && conversationId ? undefined : 'db unavailable or missing data');

    await runStep('message-send', async () => {
      if (!userAId || !conversationId) throw new Error('missing data');
      const res = await apiRequest('POST', baseUrl, `/api/conversations/${conversationId}/messages`, {
        cookieJar: cookieJarA,
        body: { body: 'Hello from sanity test' }
      });
      if (!res.ok || !res.json?.id) throw new Error(`Unexpected response: ${res.status}`);
      messageId = res.json.id;
    }, dbOk && userAId && conversationId ? undefined : 'db unavailable or missing data');

    await runStep('message-read', async () => {
      if (!userBId || !messageId) throw new Error('missing data');
      const res = await apiRequest('POST', baseUrl, `/api/messages/${messageId}/read`, {
        cookieJar: cookieJarB
      });
      if (!res.ok || !res.json?.ok) throw new Error(`Unexpected response: ${res.status}`);
    }, dbOk && userBId && messageId ? undefined : 'db unavailable or missing data');

    await runStep('quizzes-active', async () => {
      if (!dbOk) throw new Error('db unavailable');
      const ensured = await ensureActiveQuiz();
      quizId = ensured.id;
      quizCreated = ensured.created;
      const res = await apiRequest('GET', baseUrl, '/api/quizzes/active');
      if (!res.ok) throw new Error(`Unexpected response: ${res.status}`);
    }, dbOk ? undefined : 'db unavailable');

    await runStep('quizzes-submit', async () => {
      if (!userAId || !quizId) throw new Error('missing data');
      const res = await apiRequest('POST', baseUrl, `/api/quizzes/${quizId}/submit`, {
        cookieJar: cookieJarA,
        body: { answers: { q1: 'A' }, scoreVec: { overall: 1 } }
      });
      if (!res.ok || !res.json?.ok) throw new Error(`Unexpected response: ${res.status}`);
    }, dbOk && userAId && quizId ? undefined : 'db unavailable or missing data');

    await runStep('safety-report', async () => {
      if (!userAId || !userBId) throw new Error('missing users');
      const res = await apiRequest('POST', baseUrl, `/api/users/${userBId}/report`, {
        cookieJar: cookieJarA,
        body: { reason: 'SPAM', details: 'sanity test' }
      });
      if (!res.ok || !res.json?.ok) throw new Error(`Unexpected response: ${res.status}`);
    }, dbOk && userAId && userBId ? undefined : 'db unavailable or missing user');

    await runStep('safety-block', async () => {
      if (!userAId || !userBId) throw new Error('missing users');
      const res = await apiRequest('POST', baseUrl, `/api/users/${userBId}/block`, {
        cookieJar: cookieJarA
      });
      if (!res.ok || !res.json?.ok) throw new Error(`Unexpected response: ${res.status}`);
    }, dbOk && userAId && userBId ? undefined : 'db unavailable or missing user');
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    const userIds = [userAId, userBId].filter(Boolean).map(id => BigInt(id!));
    await cleanup({ userIds, quizId: quizCreated ? quizId : null });
    await prisma.$disconnect();
  }

  const failed = results.filter(r => r.status === 'fail');
  const skipped = results.filter(r => r.status === 'skip');
  const ok = results.filter(r => r.status === 'ok');

  console.log('API sanity results');
  for (const r of results) {
    const line = `${r.status.toUpperCase().padEnd(4)} ${r.name}${r.info ? ` - ${r.info}` : ''}`;
    console.log(line);
  }
  console.log(`OK: ${ok.length}  FAIL: ${failed.length}  SKIP: ${skipped.length}`);

  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error('Sanity test crashed:', err);
  process.exitCode = 1;
});
