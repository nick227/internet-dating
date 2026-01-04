import type { DomainRegistry } from '../../types.js';
import { Auth } from '../../../lib/auth/rules.js';
import { prisma } from '../../../lib/prisma/client.js';
import { json } from '../../../lib/http/json.js';
import { assertConversationParticipant } from '../../../lib/auth/guards.js';
import { parseLimit, parseOptionalPositiveBigInt, parsePositiveBigInt } from '../../../lib/http/parse.js';
import { toAvatarUrl } from '../../../services/media/presenter.js';
import { getCompatibilityMap, resolveCompatibility } from '../../../services/compatibility/compatibilityService.js';
import { notify } from '../../../ws/notify.js';
import type { WsMessage, WsSubscribeTopic } from '@app/shared/ws/contracts';
import type { ServerEventType, WsEvents } from '@app/shared/ws/contracts';

export const messagingDomain: DomainRegistry = {
  domain: 'messaging',
  routes: [
    {
      id: 'messaging.GET./inbox',
      method: 'GET',
      path: '/inbox',
      auth: Auth.user(),
      summary: 'Inbox conversations',
      tags: ['messaging'],
      handler: async (req, res) => {
        const me = req.ctx.userId!;
        const takeParsed = parseLimit(req.query.take, 50, 200);
        if (!takeParsed.ok) return json(res, { error: takeParsed.error }, 400);
        const cursorParsed = parseOptionalPositiveBigInt(req.query.cursorId, 'cursorId');
        if (!cursorParsed.ok) return json(res, { error: cursorParsed.error }, 400);

        const take = takeParsed.value;
        const cursorId = cursorParsed.value;
        const fetchTake = Math.min(take * 3, 150);

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

        let cursorFilter: Record<string, unknown> | null = null;
        if (cursorId) {
          const cursor = await prisma.conversation.findUnique({
            where: { id: cursorId },
            select: { id: true, updatedAt: true }
          });
          if (!cursor) return json(res, { error: 'Cursor not found' }, 404);
          cursorFilter = {
            OR: [
              { updatedAt: { lt: cursor.updatedAt } },
              { AND: [{ updatedAt: cursor.updatedAt }, { id: { lt: cursor.id } }] }
            ]
          };
        }

        const convos = await prisma.conversation.findMany({
          where: {
            AND: [
              { OR: [{ userAId: me }, { userBId: me }] },
              { OR: [{ match: { state: 'ACTIVE' } }, { matchId: null }] },
              ...(cursorFilter ? [cursorFilter] : [])
            ]
          },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          take: fetchTake,
          select: {
            id: true,
            updatedAt: true,
            userAId: true,
            userBId: true,
            userA: { select: { id: true, profile: { select: { displayName: true, avatarMedia: { select: mediaSelect } } } } },
            userB: { select: { id: true, profile: { select: { displayName: true, avatarMedia: { select: mediaSelect } } } } },
            userStates: {
              where: { userId: me },
              select: { deletedAt: true }
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                id: true,
                body: true,
                createdAt: true,
                senderId: true,
                isSystem: true,
                followRequest: { select: { id: true, status: true } }
              }
            }
          }
        });

        const visible = convos.filter((c) => {
          const deletedAt = c.userStates[0]?.deletedAt ?? null;
          return !deletedAt || c.updatedAt > deletedAt;
        });

        const limited = visible.slice(0, take);
        const nextCursorId = convos.length === fetchTake ? convos[convos.length - 1]!.id : null;

        const convoIds = limited.map(c => c.id);
        const deletedAtMap = new Map<string, Date | null>();
        for (const convo of limited) {
          deletedAtMap.set(convo.id.toString(), convo.userStates[0]?.deletedAt ?? null);
        }

        const unreadCounts = await prisma.messageReceipt.findMany({
          where: { userId: me, readAt: null, message: { conversationId: { in: convoIds } } },
          select: { message: { select: { conversationId: true, createdAt: true } } }
        });
        const unreadMap: Record<string, number> = {};
        for (const r of unreadCounts) {
          const k = r.message.conversationId.toString();
          const deletedAt = deletedAtMap.get(k);
          if (deletedAt && r.message.createdAt <= deletedAt) continue;
          unreadMap[k] = (unreadMap[k] ?? 0) + 1;
        }

        const otherUserIds = limited.map((c) => (c.userAId === me ? c.userBId : c.userAId));
        const compatibilityMap = await getCompatibilityMap(me, otherUserIds);

        return json(res, {
          conversations: limited.map(c => {
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
            const lastMessage = c.messages[0] ?? null;
            return {
              id: c.id,
              updatedAt: c.updatedAt,
              otherUser,
              lastMessage,
              unreadCount: unreadMap[c.id.toString()] ?? 0
            };
          }),
          nextCursorId
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

        const state = await prisma.conversationUserState.findUnique({
          where: { conversationId_userId: { conversationId, userId: me } },
          select: { deletedAt: true }
        });
        const deletedAt = state?.deletedAt ?? null;

        const messages = await prisma.message.findMany({
          where: {
            conversationId,
            deletedAt: null,
            ...(deletedAt ? { createdAt: { gt: deletedAt } } : {})
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take,
          ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
          select: {
            id: true,
            body: true,
            senderId: true,
            createdAt: true,
            isSystem: true,
            followRequest: { select: { id: true, status: true } }
          }
        });

        const nextCursorId = messages.length === take ? messages[messages.length - 1]!.id : null;

        return json(res, { conversationId, messages, nextCursorId });
      }
    },
    {
      id: 'messaging.POST./conversations/:conversationId/delete',
      method: 'POST',
      path: '/conversations/:conversationId/delete',
      auth: Auth.user(),
      summary: 'Delete conversation for current user',
      tags: ['messaging'],
      handler: async (req, res) => {
        const me = req.ctx.userId!;
        const convoParsed = parsePositiveBigInt(req.params.conversationId, 'conversationId');
        if (!convoParsed.ok) return json(res, { error: convoParsed.error }, 400);
        const conversationId = convoParsed.value;

        const guard = await assertConversationParticipant(conversationId, me);
        if (!guard.ok) return json(res, { error: guard.error }, guard.status);

        await prisma.conversationUserState.upsert({
          where: { conversationId_userId: { conversationId, userId: me } },
          update: { deletedAt: new Date() },
          create: { conversationId, userId: me, deletedAt: new Date() }
        });

        return json(res, { ok: true });
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
          select: { id: true, body: true, senderId: true, createdAt: true, isSystem: true }
        });

        // bump conversation updatedAt
        await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

        // Emit WebSocket event for real-time delivery
        const event: WsMessage<'server.messenger.message_new'> = {
          type: 'server.messenger.message_new',
          data: {
            conversationId: String(conversationId),
            messageId: String(msg.id),
            senderId: String(msg.senderId),
            body: msg.body,
            createdAt: msg.createdAt.toISOString(),
            isSystem: msg.isSystem,
          },
          ts: Date.now(),
        };
        const targets: WsSubscribeTopic[] = [
          { kind: 'conversation', id: String(conversationId) },
          { kind: 'user', id: String(otherUserId) },
        ];
        notify({ event, targets });

        return json(res, { id: msg.id, createdAt: msg.createdAt }, 201);
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
          select: { id: true, conversationId: true, senderId: true }
        });
        if (!message) return json(res, { error: 'Message not found' }, 404);

        const guard = await assertConversationParticipant(message.conversationId, me);
        if (!guard.ok) return json(res, { error: guard.error }, guard.status);

        const readAt = new Date();
        await prisma.messageReceipt.update({
          where: { messageId_userId: { messageId, userId: me } },
          data: { readAt }
        }).catch(() => null);

        // Emit WebSocket event for real-time read receipt
        const event: WsMessage<'server.messenger.message_read'> = {
          type: 'server.messenger.message_read',
          data: {
            conversationId: String(message.conversationId),
            messageId: String(messageId),
            readerId: String(me),
            readAt: readAt.toISOString(),
          },
          ts: Date.now(),
        };
        const targets: WsSubscribeTopic[] = [
          { kind: 'user', id: String(message.senderId) },
        ];
        notify({ event, targets });

        return json(res, { ok: true });
      }
    }
  ]
};
