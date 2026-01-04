import { API_BASE_URL } from '../config/env'
import { http } from './http'
import type { ApiOkResponse } from './contracts'
import type { Id } from './types'

// Types
export type ApiCommentAuthor = {
  id: string
  name: string
  avatarUrl?: string
}

export type ApiComment = {
  id: string
  body: string
  author: ApiCommentAuthor
  createdAt: string
  updatedAt?: string
  likeCount: number
  replyCount?: number
  myReaction?: 'like' | null
  mentionedUserIds: string[]
  pending?: boolean
}

export type ApiCommentListResponse = ApiOkResponse & {
  comments: ApiComment[]
  nextCursorId?: string
}

export type ApiCommentRepliesResponse = ApiOkResponse & {
  replies: ApiComment[]
  nextCursorId?: string
}

export type ApiCommentCreateBody = {
  cardId: string
  cardKind: string
  text: string
  parentId?: string
  clientRequestId: string
}

export type ApiCommentCreateResponse = ApiOkResponse & {
  id: Id
  createdAt: string
}

export type ApiCommentLikeBody = {
  like?: boolean
}

export type ApiCommentLikeResponse = ApiOkResponse & {
  liked: boolean
  likeCount: number
}

export type ApiCommentEditBody = {
  body: string
}

export type ApiCommentEditResponse = ApiOkResponse & {
  id: string
  body: string
  updatedAt: string
  mentionedUserIds: string[]
}

export type ApiUserSearchResponse = ApiOkResponse & {
  users: Array<{
    id: string
    name: string
    displayName: string
    avatarUrl?: string
  }>
}

// Helper to extract actual ID from prefixed card IDs
function extractCardId(cardId: string): string {
  if (cardId.startsWith('post-')) {
    return cardId.replace(/^post-/, '')
  }
  if (cardId.startsWith('match-')) {
    return cardId.replace(/^match-/, '')
  }
  if (cardId.startsWith('profile-')) {
    return cardId.replace(/^profile-/, '')
  }
  return cardId
}

// API Functions
export function createComment(body: ApiCommentCreateBody, signal?: AbortSignal) {
  // Extract cardId if prefixed
  const extractedCardId = extractCardId(body.cardId)
  const requestBody = {
    ...body,
    cardId: extractedCardId,
  }
  
  return http<ApiCommentCreateResponse>(`${API_BASE_URL}/api/comments`, 'POST', { body: requestBody, signal })
    .then(result => {
      return result
    })
    .catch(err => {
      console.error('[createComment] API call failed:', err)
      console.error('[createComment] Error details:', {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        name: err instanceof Error ? err.name : undefined,
      })
      throw err
    })
}

export function getComments(
  cardId: string,
  cardKind: string,
  options?: { cursorId?: string; take?: number; sort?: 'recent' | 'popular' },
  signal?: AbortSignal
) {
  // Extract actual ID if cardId is prefixed (e.g., "post-123" -> "123")
  const extractedCardId = extractCardId(cardId)
  
  const params = new URLSearchParams()
  params.set('cardId', extractedCardId)
  params.set('cardKind', cardKind)
  if (options?.cursorId) params.set('cursorId', options.cursorId)
  if (options?.take) params.set('take', String(options.take))
  if (options?.sort) params.set('sort', options.sort)
  
  const url = `${API_BASE_URL}/api/comments?${params.toString()}`
  
  return http<ApiCommentListResponse>(url, 'GET', { signal })
    .then(result => {
      return result
    })
    .catch(err => {
      console.error('[getComments] API call failed:', err)
      console.error('[getComments] Error details:', {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        name: err instanceof Error ? err.name : undefined,
      })
      throw err
    })
}

export function getCommentReplies(
  commentId: string,
  options?: { cursorId?: string; take?: number },
  signal?: AbortSignal
) {
  const params = new URLSearchParams()
  if (options?.cursorId) params.set('cursorId', options.cursorId)
  if (options?.take) params.set('take', String(options.take))
  const query = params.toString() ? `?${params.toString()}` : ''
  return http<ApiCommentRepliesResponse>(
    `${API_BASE_URL}/api/comments/${commentId}/replies${query}`,
    'GET',
    { signal }
  )
}

export function likeComment(commentId: string, body?: ApiCommentLikeBody, signal?: AbortSignal) {
  return http<ApiCommentLikeResponse>(`${API_BASE_URL}/api/comments/${commentId}/like`, 'POST', {
    body: body ?? {},
    signal,
  })
}

export function deleteComment(commentId: string, signal?: AbortSignal) {
  return http<ApiOkResponse>(`${API_BASE_URL}/api/comments/${commentId}`, 'DELETE', { signal })
}

export function editComment(commentId: string, body: ApiCommentEditBody, signal?: AbortSignal) {
  return http<ApiCommentEditResponse>(`${API_BASE_URL}/api/comments/${commentId}`, 'PATCH', {
    body,
    signal,
  })
}

export function searchUsers(query: string, limit = 10, signal?: AbortSignal) {
  const params = new URLSearchParams()
  params.set('q', query)
  params.set('limit', String(limit))
  return http<ApiUserSearchResponse>(`${API_BASE_URL}/api/profiles/search?${params.toString()}`, 'GET', {
    signal,
  })
}
