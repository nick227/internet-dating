import type { WsSubscribeTopic } from '@app/shared'

export function topicKey(topic: WsSubscribeTopic) {
  return `${topic.kind}:${topic.id}`
}

export function userTopic(userId: string) {
  return `user:${userId}`
}
