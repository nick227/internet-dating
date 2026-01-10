import type {
  ServerEventType,
  WsMessage,
  WsSubscribeTopic
} from '@app/shared'

export type WsNotifyPayload<T extends ServerEventType = ServerEventType> = {
  event: WsMessage<T>
  targets: WsSubscribeTopic[]
}

type EmitFn = (payload: WsNotifyPayload) => void

let emit: EmitFn | null = null

export function initNotifier(fn: EmitFn) {
  emit = fn
}

export function notify<T extends ServerEventType>(payload: WsNotifyPayload<T>) {
  emit?.(payload as WsNotifyPayload)
}
