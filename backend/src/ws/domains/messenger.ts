import type { WsRouter } from '../router.js'
import { recordActivity } from './presence.js'

export function registerHandlers(router: WsRouter) {
  router.on('client.messenger.typing', (ctx) => {
    recordActivity(ctx.userId)
  })
}
