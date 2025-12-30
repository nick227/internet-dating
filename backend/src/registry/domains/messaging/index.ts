import type { DomainRegistry } from '../../types.js';
import { Auth } from '../../../lib/auth/rules.js';
import { prisma } from '../../../lib/prisma/client.js';
import { json } from '../../../lib/http/json.js';
import { assertConversationParticipant } from '../../../lib/auth/guards.js';
import { parseLimit, parseOptionalPositiveBigInt, parsePositiveBigInt } from '../../../lib/http/parse.js';
import { toAvatarUrl } from '../../../services/media/presenter.js';
import { getCompatibilityMap, resolveCompatibility } from '../../../services/compatibility/compatibilityService.js';

export const messagingDomain: DomainRegistry = {
  domain: 'messaging',
  routes: [
    {
      id: 'messaging.GET./inbox',
      method: 'GET',
      path: '/inbox',
      auth: Auth.user(),
      summary: 'Inbox list',
      tags: ['messaging'],
      handler: async (req, res) => {
        const me = req.ctx.userId!;

        const mediaSelect = {
          id: true,
          type: true,
          url: true,
          thumbUrl: true,
          width: true,
          height: true,
          durationSec: true,
          storageKey: true,
          variants: true
        };

        const convos = await prisma.conversation.findMany({
          where: {
            AND: [
              { OR: [{ userAId: me }, { userBId: me }] },
              { OR: [{ match: { state: 'ACTIVE' } }, { matchId: null }] }
            ]
          },
          orderBy: { updatedAt: 'desc' },
          take: 50,
          select: {
            id: true,
            updatedAt: true,
            userAId: true,
            userBId: true,
            userA: { select: { id: true, profile: { select: { displayName: true, avatarMedia: { select: mediaSelect } } } } },
            userB: { select: { id: true, profile: { select: { displayName: true, avatarMedia: { select: mediaSelect } } } } },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { id: true, body: true, createdAt: true, senderId: true, isSystem: true }
            }
          }
        });

        const convoIds = convos.map(c => c.id);
        const unreadCounts = await prisma.messageReceipt.findMany({
          where: { userId: me, readAt: null, message: { conversationId: { in: convoIds } } },
          select: { message: { select: { conversationId: true } } }
        });
        const map: Record<string, number> = {};
        for (const r of unreadCounts) {
          const k = r.message.conversationId.toString();
          map[k] = (map[k] ?? 0) + 1;
        }

        const otherUserIds = convos.map((c) => (c.userAId === me ? c.userBId : c.userAId));
        const compatibilityMap = await getCompatibilityMap(me, otherUserIds);

        return json(res, {
          conversations: convos.map(c => {
            const rawOther = c.userAId === me ? c.userB : c.userA;
            const otherProfile = rawOther.profile
              ? (() => {
                  const { avatarMedia, ...profileData } = rawOther.profile;
                  return { ...profileData, avatarUrl: toAvatarUrl(avatarMedia) };
                })()
              : null;
            const otherUser = {
              ...rawOther,
              profile: otherProfile,
              compatibility: resolveCompatibility(me, compatibilityMap, rawOther.id)
            };
            return {
              id: c.id,
              updatedAt: c.updatedAt,
              otherUser,
              lastMessage: c.messages[0] ?? null,
              unreadCount: map[c.id.toString()] ?? 0
            };
          })
        });
      }
    },
    {
      id: 'messaging.GET./conversations/:conversationId',
      method: 'GET',
      path: '/conversations/:conversationId',
      auth: Auth.user(),
      summary: 'Get conversation',
      tags: ['messaging'],
      handler: async (req, res) => {
        const me = req.ctx.userId!;
        const convoParsed = parsePositiveBigInt(req.params.conversationId, 'conversationId');
        if (!convoParsed.ok) return json(res, { error: convoParsed.error }, 400);
        const conversationId = convoParsed.value;

        const guard = await assertConversationParticipant(conversationId, me);
        if (!guard.ok) return json(res, { error: guard.error }, guard.status);

        const takeParsed = parseLimit(req.query.take, 50, 200);
        if (!takeParsed.ok) return json(res, { error: takeParsed.error }, 400);
        const cursorParsed = parseOptionalPositiveBigInt(req.query.cursorId, 'cursorId');
        if (!cursorParsed.ok) return json(res, { error: cursorParsed.error }, 400);

        const take = takeParsed.value;
        const cursorId = cursorParsed.value;

        const messages = await prisma.message.findMany({
          where: { conversationId, deletedAt: null },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take,
          ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
          select: {
            id: true,
            body: true,
            senderId: true,
            createdAt: true,
            isSystem: true
          }
        });

        const nextCursorId = messages.length === take ? messages[messages.length - 1]!.id : null;

        return json(res, { conversationId, messages, nextCursorId });
      }
    },
    {
      id: 'messaging.POST./conversations/:conversationId/messages',
      method: 'POST',
      path: '/conversations/:conversationId/messages',
      auth: Auth.user(),
      summary: 'Send message',
      tags: ['messaging'],
      handler: async (req, res) => {
        const me = req.ctx.userId!;
        const convoParsed = parsePositiveBigInt(req.params.conversationId, 'conversationId');
        if (!convoParsed.ok) return json(res, { error: convoParsed.error }, 400);
        const conversationId = convoParsed.value;
        const { body } = (req.body ?? {}) as { body?: string };
        if (!body || !body.trim()) return json(res, { error: 'body required' }, 400);

        const guard = await assertConversationParticipant(conversationId, me);
        if (!guard.ok) return json(res, { error: guard.error }, guard.status);

        const otherUserId = guard.conversation.userAId === me ? guard.conversation.userBId : guard.conversation.userAId;

        const msg = await prisma.message.create({
          data: {
            conversationId,
            senderId: me,
            body: body.trim(),
            receipts: {
              create: [
                { userId: otherUserId, readAt: null },
                { userId: me, readAt: new Date() }
              ]
            }
          },
          select: { id: true, createdAt: true }
        });

        // bump conversation updatedAt
        await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

        return json(res, msg, 201);
      }
    },
    {
      id: 'messaging.POST./messages/:messageId/read',
      method: 'POST',
      path: '/messages/:messageId/read',
      auth: Auth.user(),
      summary: 'Mark read',
      tags: ['messaging'],
      handler: async (req, res) => {
        const me = req.ctx.userId!;
        const msgParsed = parsePositiveBigInt(req.params.messageId, 'messageId');
        if (!msgParsed.ok) return json(res, { error: msgParsed.error }, 400);
        const messageId = msgParsed.value;

        const message = await prisma.message.findUnique({
          where: { id: messageId },
          select: { id: true, conversationId: true }
        });
        if (!message) return json(res, { error: 'Message not found' }, 404);

        const guard = await assertConversationParticipant(message.conversationId, me);
        if (!guard.ok) return json(res, { error: guard.error }, guard.status);

        await prisma.messageReceipt.update({
          where: { messageId_userId: { messageId, userId: me } },
          data: { readAt: new Date() }
        }).catch(() => null);

        return json(res, { ok: true });
      }
    }
  ]
};
