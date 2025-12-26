export type WsPresenceStatus = 'online' | 'away' | 'offline'
export type WsInternalDisconnectReason = 'heartbeat_timeout' | 'client_close' | 'auth_failed'

export type WsSubscribeTopic =
  | { kind: 'conversation'; id: string }
  | { kind: 'user'; id: string }

export type WsEnvelope<T extends string, P> = {
  type: T
  data: P
  ts: number
  id?: string
}

export type WsEvents = {
  'client.messenger.typing': {
    conversationId: string
    userId: string
    isTyping: boolean
  }
  'client.system.subscribe': {
    topics: WsSubscribeTopic[]
  }
  'server.messenger.message_new': {
    conversationId: string
    messageId: string
    senderId: string
    createdAt: string
  }
  'server.messenger.message_read': {
    conversationId: string
    messageId: string
    readerId: string
    readAt: string
  }
  'server.presence.update': {
    userId: string
    status: WsPresenceStatus
    lastSeenAt?: string
  }
  'server.presence.batch': {
    users: { userId: string; status: WsPresenceStatus }[]
  }
  'server.system.error': { message: string; code?: string }
  'server.system.internal_disconnect': {
    userId: string
    socketId: string
    reason: WsInternalDisconnectReason
  }
}

export type WsEventType = keyof WsEvents
export type ClientEventType = Extract<WsEventType, `client.${string}`>
export type ServerEventType = Extract<WsEventType, `server.${string}`>

export type WsMessage<T extends WsEventType> = WsEnvelope<T, WsEvents[T]>
