import type { ServerEventType, WsEvents, WsMessage, WsSubscribeTopic } from '@app/shared/ws/contracts'
import { API_BASE_URL } from '../config/env'
import { createWsClient } from './wsClient'

type RealtimeHandler<T extends ServerEventType> = (data: WsEvents[T], msg: WsMessage<T>) => void

const wsUrl = buildWsUrl(API_BASE_URL)
const client = createWsClient({ url: wsUrl })

export const realtime = {
  connect: () => client.connect(),
  disconnect: () => client.disconnect(),
  send: client.send,
  subscribe: (topics: WsSubscribeTopic[]) => client.subscribe(topics),
  on: <T extends ServerEventType>(type: T, handler: RealtimeHandler<T>) => client.on(type, handler)
}

function buildWsUrl(apiBaseUrl: string) {
  const fallbackOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4000'
  let url: URL
  try {
    url = new URL(apiBaseUrl, fallbackOrigin)
  } catch {
    url = new URL(fallbackOrigin)
  }
  const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${wsProtocol}//${url.host}/ws`
}
