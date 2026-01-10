import type { ClientEventType, WsMessage } from '@app/shared'
import type { WsContext } from './types.js'

export type WsHandler<T extends ClientEventType> = (
  ctx: WsContext,
  msg: WsMessage<T>
) => void | Promise<void>

export type WsRouter = {
  on<T extends ClientEventType>(type: T, handler: WsHandler<T>): void
  handle(ctx: WsContext, msg: WsMessage<ClientEventType>): void
}

export function createRouter(): WsRouter {
  const handlers = new Map<ClientEventType, WsHandler<ClientEventType>>()

  return {
    on(type, handler) {
      handlers.set(type, handler as WsHandler<ClientEventType>)
    },
    handle(ctx, msg) {
      const handler = handlers.get(msg.type)
      if (!handler) return
      void handler(ctx, msg)
    }
  }
}
