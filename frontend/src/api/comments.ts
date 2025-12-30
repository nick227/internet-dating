import { API_BASE_URL } from '../config/env'
import { http } from './http'
import type { ApiOkResponse } from './contracts'
import type { Id } from './types'

export type ApiCommentCreateBody = {
  cardId: string
  cardKind: string
  actorId?: Id
  text: string
}

export function createComment(body: ApiCommentCreateBody, signal?: AbortSignal) {
  return http<ApiOkResponse>(`${API_BASE_URL}/api/comments`, 'POST', { body, signal })
}
