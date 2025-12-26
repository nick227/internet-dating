import type {
  ClientEventType,
  ServerEventType,
  WsEvents,
  WsMessage,
  WsSubscribeTopic
} from '@app/shared/ws/contracts'

type Handler<T extends ServerEventType> = (data: WsEvents[T], msg: WsMessage<T>) => void

type WsClientOptions = {
  url: string
  reconnectMinMs?: number
  reconnectMaxMs?: number
}

export function createWsClient(options: WsClientOptions) {
  const reconnectMinMs = options.reconnectMinMs ?? 1000
  const reconnectMaxMs = options.reconnectMaxMs ?? 15000
  const handlers = new Map<ServerEventType, Set<Handler<ServerEventType>>>()
  const pending: WsMessage<ClientEventType>[] = []

  let socket: WebSocket | null = null
  let reconnectTimer: number | null = null
  let reconnectAttempts = 0
  let shouldReconnect = true
  let lastSubscribe: WsSubscribeTopic[] | null = null

  function connect() {
    shouldReconnect = true
    if (socket && socket.readyState === WebSocket.OPEN) return
    socket = new WebSocket(options.url)
    socket.addEventListener('open', handleOpen)
    socket.addEventListener('message', handleMessage)
    socket.addEventListener('close', handleClose)
    socket.addEventListener('error', handleError)
  }

  function disconnect() {
    shouldReconnect = false
    if (reconnectTimer != null) {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (!socket) return
    socket.close()
  }

  function send<T extends ClientEventType>(type: T, data: WsEvents[T]) {
    const msg: WsMessage<T> = { type, data, ts: Date.now() }
    if (type === 'client.system.subscribe') {
      lastSubscribe = (data as WsEvents['client.system.subscribe']).topics
      if (!socket || socket.readyState !== WebSocket.OPEN) return
      sendNow(msg as WsMessage<ClientEventType>)
      return
    }
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      pending.push(msg as WsMessage<ClientEventType>)
      return
    }
    sendNow(msg as WsMessage<ClientEventType>)
  }

  function subscribe(topics: WsSubscribeTopic[]) {
    send('client.system.subscribe', { topics })
  }

  function on<T extends ServerEventType>(type: T, handler: Handler<T>) {
    const set = handlers.get(type) ?? new Set()
    set.add(handler as Handler<ServerEventType>)
    handlers.set(type, set)
    return () => {
      set.delete(handler as Handler<ServerEventType>)
    }
  }

  function handleOpen() {
    reconnectAttempts = 0
    if (lastSubscribe !== null) {
      sendNow({
        type: 'client.system.subscribe',
        data: { topics: lastSubscribe },
        ts: Date.now()
      })
    }
    flushPending()
  }

  function handleMessage(event: MessageEvent<string>) {
    let msg: WsMessage<ServerEventType>
    try {
      msg = JSON.parse(event.data)
    } catch {
      return
    }
    if (!msg || typeof msg.type !== 'string') return
    if (!msg.type.startsWith('server.')) return
    const set = handlers.get(msg.type as ServerEventType)
    if (!set || set.size === 0) return
    for (const handler of set) {
      handler(msg.data, msg)
    }
  }

  function handleClose() {
    if (!shouldReconnect) return
    scheduleReconnect()
  }

  function handleError(event: Event) {
    console.warn('WS error', event)
  }

  function scheduleReconnect() {
    if (reconnectTimer != null) return
    const delay = Math.min(reconnectMaxMs, reconnectMinMs * 2 ** reconnectAttempts)
    reconnectAttempts += 1
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  function flushPending() {
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    while (pending.length) {
      const msg = pending.shift()
      if (!msg) continue
      sendNow(msg)
    }
  }

  function sendNow(msg: WsMessage<ClientEventType>) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify(msg))
  }

  return {
    connect,
    disconnect,
    send,
    subscribe,
    on
  }
}
