import { randomUUID } from 'node:crypto'
import type { IncomingMessage, Server as HttpServer } from 'node:http'
import { WebSocketServer } from 'ws'
import type WebSocket from 'ws'
import type { RawData } from 'ws'
import { verifyAccessToken } from '../lib/auth/jwt.js'
import type {
  ClientEventType,
  ServerEventType,
  WsEvents,
  WsMessage,
  WsSubscribeTopic
} from '@app/shared'
import { createRouter } from './router.js'
import type { WsContext } from './types.js'
import { initNotifier } from './notify.js'
import { topicKey, userTopic } from './topics.js'
import { registerHandlers as registerMessengerHandlers } from './domains/messenger.js'
import { registerHandlers as registerPresenceHandlers } from './domains/presence.js'
import {
  onConnect as presenceOnConnect,
  onDisconnect as presenceOnDisconnect,
  recordActivity,
  tick as presenceTick
} from './domains/presence.js'
import { registerAdminSocket, unregisterAdminSocket } from './domains/admin.js'
import { prisma } from '../lib/prisma/client.js'

const CLIENT_EVENT_TYPES = new Set<ClientEventType>([
  'client.messenger.typing',
  'client.system.subscribe'
])

const HEARTBEAT_INTERVAL_MS = 25000

export function createWsServer(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: '/ws' })
  const router = createRouter()
  const contexts = new Map<string, WsContext>()
  const missedPongs = new WeakMap<WebSocket, number>()

  registerMessengerHandlers(router)
  registerPresenceHandlers(router)

  initNotifier(({ event, targets }) => {
    emitToTargets(event, targets)
  })

  const heartbeatTimer = setInterval(() => {
    for (const socket of wss.clients) {
      const missed = missedPongs.get(socket) ?? 0
      if (missed >= 1) {
        socket.close(4408, 'heartbeat_timeout')
        missedPongs.delete(socket)
        continue
      }
      missedPongs.set(socket, missed + 1)
      socket.ping()
    }

    const updates = presenceTick()
    for (const update of updates) {
      const event = makeServerEvent('server.presence.update', update)
      emitToTargets(event, [{ kind: 'user', id: update.userId }])
    }
  }, HEARTBEAT_INTERVAL_MS)

  wss.on('close', () => clearInterval(heartbeatTimer))

  wss.on('connection', async (socket: WebSocket, req: IncomingMessage) => {
    const userId = getUserId(req)
    if (!userId) {
      process.stdout.write(`[ws] Connection rejected: no valid token. Cookie header: ${req.headers?.cookie ? 'present' : 'missing'}\n`);
      socket.close(4401, 'unauthorized')
      return
    }
    process.stdout.write(`[ws] Connection accepted for user ${userId}\n`);

    // Check if user is admin and register socket
    try {
      const user = await prisma.user.findUnique({
        where: { id: BigInt(userId) },
        select: { role: true }
      });

      if (user && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN')) {
        registerAdminSocket(socket);
      }
    } catch (err) {
      console.error('[ws] Error checking admin status:', err);
    }

    const socketId = randomUUID()
    const ctx: WsContext = {
      userId,
      socketId,
      socket,
      subscriptions: new Set<string>(),
      connectedAt: Date.now()
    }

    contexts.set(socketId, ctx)
    missedPongs.set(socket, 0)
    const presenceEntry = presenceOnConnect(userId, socket)
    if (presenceEntry) {
      emitPresenceUpdate({
        userId,
        status: presenceEntry.status,
        lastSeenAt: new Date(presenceEntry.lastSeenAt).toISOString()
      })
    }

    socket.on('pong', () => {
      missedPongs.set(socket, 0)
      recordActivity(userId)
    })

    socket.on('message', (data: RawData) => {
      const msg = parseClientMessage(data)
      if (!msg) return

      recordActivity(userId)

      if (msg.type === 'client.system.subscribe') {
        const payload = msg.data as WsEvents['client.system.subscribe']
        applySubscriptions(ctx, payload.topics ?? [])
        return
      }

      router.handle(ctx, msg)
    })

    socket.on('close', (_code: number, reason: Buffer) => {
      missedPongs.delete(socket)
      contexts.delete(socketId)
      unregisterAdminSocket(socket)
      const entry = presenceOnDisconnect(userId, socket)
      if (entry && entry.status === 'offline') {
        emitPresenceUpdate({
          userId,
          status: entry.status,
          lastSeenAt: new Date(entry.lastSeenAt).toISOString()
        })
      }
      recordInternalDisconnect(userId, socketId, String(reason ?? ''))
    })
  })

  return wss

  function emitToTargets<T extends ServerEventType>(
    event: WsMessage<T>,
    targets: WsSubscribeTopic[]
  ) {
    const keys = new Set(targets.map(topicKey))
    for (const ctx of contexts.values()) {
      const isSelf = keys.has(userTopic(ctx.userId))
      if (!isSelf && ctx.subscriptions.size === 0) continue
      if (isSelf) {
        send(ctx, event)
        continue
      }

      for (const key of keys) {
        if (ctx.subscriptions.has(key)) {
          send(ctx, event)
          break
        }
      }
    }
  }

  function emitPresenceUpdate(payload: WsEvents['server.presence.update']) {
    const event = makeServerEvent('server.presence.update', payload)
    emitToTargets(event, [{ kind: 'user', id: payload.userId }])
  }
}

function applySubscriptions(ctx: WsContext, topics: WsSubscribeTopic[]) {
  ctx.subscriptions.clear()
  for (const topic of topics) {
    ctx.subscriptions.add(topicKey(topic))
  }
}

function send<T extends ServerEventType>(ctx: WsContext, msg: WsMessage<T>) {
  if (ctx.socket.readyState !== ctx.socket.OPEN) return
  ctx.socket.send(JSON.stringify(msg))
}

function makeServerEvent<T extends ServerEventType>(
  type: T,
  data: WsEvents[T]
): WsMessage<T> {
  return { type, data, ts: Date.now() }
}

function parseClientMessage(data: RawData): WsMessage<ClientEventType> | null {
  let parsed: WsMessage<ClientEventType>
  try {
    const text = typeof data === 'string' ? data : data.toString()
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!parsed || typeof parsed.type !== 'string') return null
  if (!CLIENT_EVENT_TYPES.has(parsed.type as ClientEventType)) return null
  return parsed
}

function getUserId(req: IncomingMessage): string | null {
  const token = getAccessToken(req)
  if (!token) return null
  try {
    const payload = verifyAccessToken(token)
    return payload.sub
  } catch {
    return null
  }
}

function getAccessToken(req: IncomingMessage): string | null {
  const hdr = req.headers?.authorization
  const bearer =
    typeof hdr === 'string' && hdr.startsWith('Bearer ') ? hdr.slice(7) : null
  const cookieToken = readCookie(req.headers?.cookie, 'access_token')
  return bearer ?? cookieToken ?? null
}

function readCookie(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) return null
  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq)
    if (key !== name) continue
    return trimmed.slice(eq + 1)
  }
  return null
}

function recordInternalDisconnect(
  userId: string,
  socketId: string,
  reason: string
) {
  if (!reason) return
  void userId
  void socketId
}
