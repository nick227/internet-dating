import { prisma } from '../prisma/client.js';

export async function assertConversationParticipant(conversationId: bigint, userId: bigint) {
  const c = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, userAId: true, userBId: true, match: { select: { state: true } } }
  });
  if (!c) return { ok: false as const, status: 404 as const, error: 'Conversation not found' };
  const ok = c.userAId === userId || c.userBId === userId;
  if (!ok) return { ok: false as const, status: 403 as const, error: 'Forbidden' };
  if (c.match.state !== 'ACTIVE') return { ok: false as const, status: 403 as const, error: 'Conversation not active' };
  return { ok: true as const, conversation: c };
}
