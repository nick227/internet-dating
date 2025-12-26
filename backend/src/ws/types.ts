import type WebSocket from 'ws'

export type WsContext = {
  userId: string
  socketId: string
  socket: WebSocket
  subscriptions: Set<string>
  connectedAt: number
}
