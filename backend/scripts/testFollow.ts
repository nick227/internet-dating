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

async function cleanup(userIds: bigint[]) {
  if (!userIds.length) return;

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

  if (conversationIds.length > 0) {
    await prisma.messageReceipt.deleteMany({
      where: { message: { conversationId: { in: conversationIds } } }
    });

    await prisma.message.deleteMany({
      where: { conversationId: { in: conversationIds } }
    });
  }

  await prisma.profileAccess.deleteMany({
    where: {
      OR: [
        { ownerUserId: { in: userIds } },
        { viewerUserId: { in: userIds } }
      ]
    }
  });

  await prisma.conversation.deleteMany({
    where: {
      OR: [
        { userAId: { in: userIds } },
        { userBId: { in: userIds } }
      ]
    }
  });

  await prisma.profile.deleteMany({
    where: { userId: { in: userIds } }
  });

  await prisma.user.deleteMany({
    where: { id: { in: userIds } }
  });
}

async function main() {
  const testRunId = Date.now().toString(36);
  const emailA = `follow+a_${testRunId}@example.com`;
  const emailB = `follow+b_${testRunId}@example.com`;
  const password = 'Password123!';
  const cookieJarA = new Map<string, string>();
  const cookieJarB = new Map<string, string>();

  let userAId: string | null = null;
  let userBId: string | null = null;
  let requestId: string | null = null;
  let conversationId: string | null = null;

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
    await runStep('signup-user-a', async () => {
      const res = await apiRequest('POST', baseUrl, '/api/auth/signup', {
        body: { email: emailA, password, displayName: 'User A' },
        cookieJar: cookieJarA
      });
      if (!res.ok || !res.json?.userId) throw new Error(`Unexpected response: ${res.status}`);
      userAId = res.json.userId;
    });

    await runStep('signup-user-b', async () => {
      const res = await apiRequest('POST', baseUrl, '/api/auth/signup', {
        body: { email: emailB, password, displayName: 'User B' },
        cookieJar: cookieJarB
      });
      if (!res.ok || !res.json?.userId) throw new Error(`Unexpected response: ${res.status}`);
      userBId = res.json.userId;
    }, !userAId ? 'user A not created' : undefined);

    await runStep('request-follow', async () => {
      if (!userAId || !userBId) throw new Error('missing users');
      const res = await apiRequest('POST', baseUrl, `/api/profiles/${userBId}/access-requests`, {
        cookieJar: cookieJarA
      });
      if (!res.ok || res.json?.status !== 'PENDING') {
        throw new Error(`Unexpected response: ${res.status} - ${JSON.stringify(res.json)}`);
      }
      requestId = res.json?.requestId ?? null;
    }, !userAId || !userBId ? 'users not created' : undefined);

    await runStep('verify-conversation-created', async () => {
      if (!userAId || !userBId) throw new Error('missing users');
      const userIds = [BigInt(userAId), BigInt(userBId)];
      const [idA, idB] = userIds.sort((a, b) => (a < b ? -1 : 1));
      const conversation = await prisma.conversation.findUnique({
        where: { userAId_userBId: { userAId: idA, userBId: idB } },
        select: { id: true, matchId: true }
      });
      if (!conversation) throw new Error('Conversation not created');
      if (conversation.matchId !== null) throw new Error('Conversation should not have a match');
      conversationId = conversation.id.toString();
    }, !userAId || !userBId ? 'users not created' : undefined);

    await runStep('verify-system-message', async () => {
      if (!conversationId) throw new Error('missing conversation');
      const messages = await prisma.message.findMany({
        where: { conversationId: BigInt(conversationId) },
        select: { id: true, body: true, isSystem: true, senderId: true },
        orderBy: { createdAt: 'desc' }
      });
      if (messages.length === 0) throw new Error('No messages found');
      const lastMessage = messages[0];
      if (!lastMessage?.isSystem) throw new Error('Expected system message');
      if (!lastMessage.body.includes('wants to follow')) {
        throw new Error(`Unexpected message body: ${lastMessage.body}`);
      }
      if (lastMessage.senderId.toString() !== userAId) {
        throw new Error('Message sender mismatch');
      }
    }, !conversationId ? 'conversation not created' : undefined);

    await runStep('verify-inbox-shows-conversation', async () => {
      if (!userBId) throw new Error('missing user B');
      const res = await apiRequest('GET', baseUrl, '/api/inbox', {
        cookieJar: cookieJarB
      });
      if (!res.ok || !Array.isArray(res.json?.conversations)) {
        throw new Error(`Unexpected response: ${res.status}`);
      }
      const convos = res.json.conversations;
      const found = convos.find((c: any) => c.id === conversationId);
      if (!found) throw new Error('Conversation not found in inbox');
      if (!found.lastMessage?.isSystem) {
        throw new Error('Last message should be system message');
      }
    }, !userBId || !conversationId ? 'missing data' : undefined);

    await runStep('list-followers', async () => {
      if (!userBId) throw new Error('missing user B');
      const res = await apiRequest('GET', baseUrl, `/api/profiles/${userBId}/followers`, {
        cookieJar: cookieJarB
      });
      if (!res.ok || !Array.isArray(res.json?.followers)) {
        throw new Error(`Unexpected response: ${res.status}`);
      }
      const followers = res.json.followers;
      const found = followers.find((f: any) => f.userId === userAId && f.status === 'PENDING');
      if (!found) throw new Error('Follower not found in list');
      if (found.requestId !== requestId) {
        throw new Error('Request ID mismatch');
      }
    }, !userBId || !userAId ? 'missing users' : undefined);

    await runStep('list-following', async () => {
      if (!userAId) throw new Error('missing user A');
      const res = await apiRequest('GET', baseUrl, `/api/profiles/${userAId}/following`, {
        cookieJar: cookieJarA
      });
      if (!res.ok || !Array.isArray(res.json?.following)) {
        throw new Error(`Unexpected response: ${res.status}`);
      }
      const following = res.json.following;
      const found = following.find((f: any) => f.userId === userBId && f.status === 'PENDING');
      if (!found) throw new Error('Following entry not found');
    }, !userAId || !userBId ? 'missing users' : undefined);

    await runStep('approve-request', async () => {
      if (!requestId) throw new Error('missing request ID');
      const res = await apiRequest('POST', baseUrl, `/api/profiles/access-requests/${requestId}/approve`, {
        cookieJar: cookieJarB
      });
      if (!res.ok || res.json?.status !== 'GRANTED') {
        throw new Error(`Unexpected response: ${res.status} - ${JSON.stringify(res.json)}`);
      }
    }, !requestId || !userBId ? 'missing data' : undefined);

    await runStep('verify-approval-message', async () => {
      if (!conversationId) throw new Error('missing conversation');
      const messages = await prisma.message.findMany({
        where: { conversationId: BigInt(conversationId) },
        select: { id: true, body: true, isSystem: true, senderId: true },
        orderBy: { createdAt: 'desc' }
      });
      if (messages.length < 2) throw new Error('Expected at least 2 messages');
      const approvalMessage = messages[0];
      if (!approvalMessage?.isSystem) throw new Error('Expected system message');
      if (!approvalMessage.body.includes('approved')) {
        throw new Error(`Unexpected message body: ${approvalMessage.body}`);
      }
      if (approvalMessage.senderId.toString() !== userBId) {
        throw new Error('Approval message sender mismatch');
      }
    }, !conversationId || !userBId ? 'missing data' : undefined);

    await runStep('verify-follower-status-granted', async () => {
      if (!userBId) throw new Error('missing user B');
      const res = await apiRequest('GET', baseUrl, `/api/profiles/${userBId}/followers`, {
        cookieJar: cookieJarB
      });
      if (!res.ok) throw new Error(`Unexpected response: ${res.status}`);
      const followers = res.json.followers;
      const found = followers.find((f: any) => f.userId === userAId && f.status === 'GRANTED');
      if (!found) throw new Error('Follower status not updated to GRANTED');
    }, !userBId || !userAId ? 'missing users' : undefined);

  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    const userIds = [userAId, userBId].filter(Boolean).map(id => BigInt(id!));
    if (userIds.length > 0) {
      await cleanup(userIds);
    }
    await prisma.$disconnect();
  }

  const failed = results.filter(r => r.status === 'fail');
  const skipped = results.filter(r => r.status === 'skip');
  const ok = results.filter(r => r.status === 'ok');

  console.log('\nFollow system test results:');
  for (const r of results) {
    const line = `${r.status.toUpperCase().padEnd(4)} ${r.name}${r.info ? ` - ${r.info}` : ''}`;
    console.log(line);
  }
  console.log(`\nOK: ${ok.length}  FAIL: ${failed.length}  SKIP: ${skipped.length}`);

  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error('Follow test crashed:', err);
  process.exit(1);
});
