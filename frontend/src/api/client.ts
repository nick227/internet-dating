import { API_BASE_URL } from '../config/env'
import { adaptFeedResponse, adaptProfileResponse } from './adapters'
import type {
  ApiAuthLoginBody,
  ApiAuthLoginResponse,
  ApiAuthMeResponse,
  ApiAuthSignupBody,
  ApiAuthSignupResponse,
  ApiFollowersResponse,
  ApiFollowingResponse,
  ApiInboxResponse,
  ApiMatchListResponse,
  ApiMessageListResponse,
  ApiMessageSendBody,
  ApiMessageSendResponse,
  ApiMediaResponse,
  ApiMediaUploadResponse,
  ApiFeedResponse,
  ApiMetaResponse,
  ApiOkResponse,
  ApiPostCreateBody,
  ApiPostCreateResponse,
  ApiPostPatchBody,
  ApiPostPatchResponse,
  ApiProfileResponse,
  ApiProfilePatchBody,
  ApiProfilePatchResponse,
  ApiProfileAccessGrantBody,
  ApiProfileAccessResponse,
  ApiQuizResponse,
  ApiQuizSubmitBody,
  ApiQuizUpdateBody,
  ApiQuizUpdateResponse,
  ApiQuizQuestionPatchBody,
  ApiQuizQuestionPatchResponse,
  ApiQuizOptionPatchBody,
  ApiQuizOptionPatchResponse,
  ApiRateResponse,
  ApiSwipeResponse,
} from './contracts'
import type { paths } from './openapi'
import { http } from './http'
import type { FeedResponse, ProfileResponse, LikeBody, RateBody } from './types'

const API_PATHS = {
  signup: '/api/auth/signup',
  login: '/api/auth/login',
  refresh: '/api/auth/refresh',
  logout: '/api/auth/logout',
  me: '/api/auth/me',
  meta: '/api/meta',
  feed: '/api/feed',
  profile: '/api/profiles/{userId}',
  profileUpdate: '/api/profiles/{userId}',
  profileAccessRequest: '/api/profiles/{userId}/access-requests',
  profileAccessGrant: '/api/profiles/{userId}/access-grants',
  followers: '/api/profiles/{userId}/followers',
  following: '/api/profiles/{userId}/following',
  approveFollowRequest: '/api/profiles/access-requests/{requestId}/approve',
  denyFollowRequest: '/api/profiles/access-requests/{requestId}/deny',
  rate: '/api/profiles/{userId}/rate',
  like: '/api/likes',
  postCreate: '/api/posts',
  postUpdate: '/api/posts/{postId}',
  postDelete: '/api/posts/{postId}',
  postMediaDelete: '/api/posts/{postId}/media/{mediaId}',
  inbox: '/api/inbox',
  matches: '/api/matches',
  conversation: '/api/conversations/{conversationId}',
  conversationMessages: '/api/conversations/{conversationId}/messages',
  messageRead: '/api/messages/{messageId}/read',
  quizActive: '/api/quizzes/active',
  quizSubmit: '/api/quizzes/{quizId}/submit',
  quizUpdate: '/api/quizzes/{quizId}',
  quizQuestionUpdate: '/api/quizzes/{quizId}/questions/{questionId}',
  quizOptionUpdate: '/api/quizzes/{quizId}/questions/{questionId}/options/{optionId}',
  mediaUpload: '/api/media/upload',
  mediaById: '/api/media/{mediaId}',
  mediaDelete: '/api/media/{mediaId}',
} as const satisfies Record<string, keyof paths>

function fillPath(template: string, params: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_match, key) => encodeURIComponent(String(params[key])))
}

const DEBUG = Boolean(import.meta.env?.DEV)

const isFeedDebugEnabled = () => {
  if (!DEBUG || typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem('debug:feed') === '1'
  } catch {
    return false
  }
}

const feedDebugLog = (...args: unknown[]) => {
  if (isFeedDebugEnabled()) {
    console.log(...args)
  }
}

export const api = {
  auth: {
    signup: (body: ApiAuthSignupBody, signal?: AbortSignal) =>
      http<ApiAuthSignupResponse>(`${API_BASE_URL}${API_PATHS.signup}`, 'POST', { body, signal }),
    login: (body: ApiAuthLoginBody, signal?: AbortSignal) =>
      http<ApiAuthLoginResponse>(`${API_BASE_URL}${API_PATHS.login}`, 'POST', { body, signal }),
    refresh: (signal?: AbortSignal) =>
      http<ApiOkResponse>(`${API_BASE_URL}${API_PATHS.refresh}`, 'POST', { signal }),
    logout: (signal?: AbortSignal) =>
      http<ApiOkResponse>(`${API_BASE_URL}${API_PATHS.logout}`, 'POST', { signal }),
    me: (signal?: AbortSignal) =>
      http<ApiAuthMeResponse>(`${API_BASE_URL}${API_PATHS.me}`, 'GET', { signal }),
  },
  meta: (signal?: AbortSignal) =>
    http<ApiMetaResponse>(`${API_BASE_URL}${API_PATHS.meta}`, 'GET', { signal }),
  feed: async (cursorId?: string | null, signal?: AbortSignal, options?: { limit?: number; lite?: boolean }): Promise<FeedResponse> => {
    const params = new URLSearchParams()
    if (cursorId) params.set('cursorId', cursorId)
    if (options?.limit) params.set('limit', String(options.limit))
    if (options?.lite) params.set('lite', '1')
    const q = params.toString() ? `?${params.toString()}` : ''
    const url = `${API_BASE_URL}${API_PATHS.feed}${q}`
    feedDebugLog('[DEBUG] api.feed: Making request', { url, lite: options?.lite, limit: options?.limit, cursorId })
    // Phase-1 returns different structure, so use unknown and let adapter handle it
    const res = await http<unknown>(url, 'GET', {
      signal,
    })
    feedDebugLog('[DEBUG] api.feed: Response received', { hasItems: Array.isArray((res as any)?.items), itemsLength: (res as any)?.items?.length })
    return adaptFeedResponse(res as ApiFeedResponse)
  },
  profile: async (userId: string | number, signal?: AbortSignal): Promise<ProfileResponse> => {
    const path = fillPath(API_PATHS.profile, { userId })
    const res = await http<ApiProfileResponse>(`${API_BASE_URL}${path}`, 'GET', { signal })
    return adaptProfileResponse(res)
  },
  profileUpdate: (userId: string | number, body: ApiProfilePatchBody, signal?: AbortSignal) => {
    const path = fillPath(API_PATHS.profileUpdate, { userId })
    return http<ApiProfilePatchResponse>(`${API_BASE_URL}${path}`, 'PATCH', { body, signal })
  },
  profileAccessRequest: (userId: string | number, signal?: AbortSignal) => {
    const path = fillPath(API_PATHS.profileAccessRequest, { userId })
    return http<ApiProfileAccessResponse>(`${API_BASE_URL}${path}`, 'POST', { signal })
  },
  profileAccessGrant: (
    userId: string | number,
    body: ApiProfileAccessGrantBody,
    signal?: AbortSignal
  ) => {
    const path = fillPath(API_PATHS.profileAccessGrant, { userId })
    return http<ApiProfileAccessResponse>(`${API_BASE_URL}${path}`, 'POST', { body, signal })
  },
  followers: (userId: string | number, signal?: AbortSignal) => {
    const path = fillPath(API_PATHS.followers, { userId })
    return http<ApiFollowersResponse>(`${API_BASE_URL}${path}`, 'GET', { signal })
  },
  following: (userId: string | number, signal?: AbortSignal) => {
    const path = fillPath(API_PATHS.following, { userId })
    return http<ApiFollowingResponse>(`${API_BASE_URL}${path}`, 'GET', { signal })
  },
  approveFollowRequest: (requestId: string | number, signal?: AbortSignal) => {
    const path = fillPath(API_PATHS.approveFollowRequest, { requestId })
    return http<ApiProfileAccessResponse>(`${API_BASE_URL}${path}`, 'POST', { signal })
  },
  denyFollowRequest: (requestId: string | number, signal?: AbortSignal) => {
    const path = fillPath(API_PATHS.denyFollowRequest, { requestId })
    return http<ApiProfileAccessResponse>(`${API_BASE_URL}${path}`, 'POST', { signal })
  },
  like: (body: LikeBody, signal?: AbortSignal) =>
    http<ApiSwipeResponse>(`${API_BASE_URL}${API_PATHS.like}`, 'POST', { body, signal }),
  rate: (userId: string | number, body: RateBody, signal?: AbortSignal) => {
    const path = fillPath(API_PATHS.rate, { userId })
    return http<ApiRateResponse>(`${API_BASE_URL}${path}`, 'POST', { body, signal })
  },
  posts: {
    create: (body: ApiPostCreateBody, signal?: AbortSignal) =>
      http<ApiPostCreateResponse>(`${API_BASE_URL}${API_PATHS.postCreate}`, 'POST', {
        body,
        signal,
      }),
    update: (postId: string | number, body: ApiPostPatchBody, signal?: AbortSignal) => {
      const path = fillPath(API_PATHS.postUpdate, { postId })
      return http<ApiPostPatchResponse>(`${API_BASE_URL}${path}`, 'PATCH', { body, signal })
    },
    delete: (postId: string | number, signal?: AbortSignal) => {
      const path = fillPath(API_PATHS.postDelete, { postId })
      return http<ApiOkResponse>(`${API_BASE_URL}${path}`, 'DELETE', { signal })
    },
    deleteMedia: (postId: string | number, mediaId: string | number, signal?: AbortSignal) => {
      const path = fillPath(API_PATHS.postMediaDelete, { postId, mediaId })
      return http<ApiOkResponse>(`${API_BASE_URL}${path}`, 'DELETE', { signal })
    },
  },
  messaging: {
    inbox: (signal?: AbortSignal) =>
      http<ApiInboxResponse>(`${API_BASE_URL}${API_PATHS.inbox}`, 'GET', { signal }),
    matches: (signal?: AbortSignal) =>
      http<ApiMatchListResponse>(`${API_BASE_URL}${API_PATHS.matches}`, 'GET', { signal }),
    conversation: (
      conversationId: string | number,
      cursorId?: string | number | null,
      signal?: AbortSignal
    ) => {
      const path = fillPath(API_PATHS.conversation, { conversationId })
      const q = cursorId ? `?cursorId=${encodeURIComponent(String(cursorId))}` : ''
      return http<ApiMessageListResponse>(`${API_BASE_URL}${path}${q}`, 'GET', { signal })
    },
    sendMessage: (
      conversationId: string | number,
      body: ApiMessageSendBody,
      signal?: AbortSignal
    ) => {
      const path = fillPath(API_PATHS.conversationMessages, { conversationId })
      return http<ApiMessageSendResponse>(`${API_BASE_URL}${path}`, 'POST', { body, signal })
    },
    markRead: (messageId: string | number, signal?: AbortSignal) => {
      const path = fillPath(API_PATHS.messageRead, { messageId })
      return http<ApiOkResponse>(`${API_BASE_URL}${path}`, 'POST', { signal })
    },
  },
  media: {
    upload: (file: File, signal?: AbortSignal) => {
      const form = new FormData()
      form.append('file', file)
      return http<ApiMediaUploadResponse>(`${API_BASE_URL}${API_PATHS.mediaUpload}`, 'POST', {
        body: form,
        signal,
      })
    },
    get: (mediaId: string | number, signal?: AbortSignal) => {
      const path = fillPath(API_PATHS.mediaById, { mediaId })
      return http<ApiMediaResponse>(`${API_BASE_URL}${path}`, 'GET', { signal })
    },
    delete: (mediaId: string | number, signal?: AbortSignal) => {
      const path = fillPath(API_PATHS.mediaDelete, { mediaId })
      return http<ApiOkResponse>(`${API_BASE_URL}${path}`, 'DELETE', { signal })
    },
  },
  quizzes: {
    active: (signal?: AbortSignal) =>
      http<ApiQuizResponse>(`${API_BASE_URL}${API_PATHS.quizActive}`, 'GET', { signal }),
    submit: (quizId: string | number, body: ApiQuizSubmitBody, signal?: AbortSignal) => {
      const path = fillPath(API_PATHS.quizSubmit, { quizId })
      return http<ApiOkResponse>(`${API_BASE_URL}${path}`, 'POST', { body, signal })
    },
    update: (quizId: string | number, body: ApiQuizUpdateBody, signal?: AbortSignal) => {
      const path = fillPath(API_PATHS.quizUpdate, { quizId })
      return http<ApiQuizUpdateResponse>(`${API_BASE_URL}${path}`, 'PATCH', { body, signal })
    },
    updateQuestion: (
      quizId: string | number,
      questionId: string | number,
      body: ApiQuizQuestionPatchBody,
      signal?: AbortSignal
    ) => {
      const path = fillPath(API_PATHS.quizQuestionUpdate, { quizId, questionId })
      return http<ApiQuizQuestionPatchResponse>(`${API_BASE_URL}${path}`, 'PATCH', { body, signal })
    },
    updateOption: (
      quizId: string | number,
      questionId: string | number,
      optionId: string | number,
      body: ApiQuizOptionPatchBody,
      signal?: AbortSignal
    ) => {
      const path = fillPath(API_PATHS.quizOptionUpdate, { quizId, questionId, optionId })
      return http<ApiQuizOptionPatchResponse>(`${API_BASE_URL}${path}`, 'PATCH', { body, signal })
    },
  },
  feedSync: {
    // Feed sync endpoints (stubs - replace with actual endpoints when backend is ready)
    seen: async (
      items: Array<{ itemType: string; itemId: string; position: number; timestamp: number }>,
      _signal?: AbortSignal
    ) => {
      // TODO: Replace with actual endpoint: POST /api/feed/seen
      if (import.meta.env?.DEV) {
        console.debug('[api.feed.seen] Stub - would sync:', { count: items.length })
      }
      return Promise.resolve({ ok: true } as ApiOkResponse)
    },
    hide: async (itemId: string, _signal?: AbortSignal) => {
      // TODO: Replace with actual endpoint: POST /api/feed/{itemId}/hide
      if (import.meta.env?.DEV) {
        console.debug('[api.feed.hide] Stub - would hide:', itemId)
      }
      return Promise.resolve({ ok: true } as ApiOkResponse)
    },
    block: async (actorId: string | number, _signal?: AbortSignal) => {
      // TODO: Replace with actual endpoint: POST /api/users/{actorId}/block
      if (import.meta.env?.DEV) {
        console.debug('[api.feed.block] Stub - would block:', actorId)
      }
      return Promise.resolve({ ok: true } as ApiOkResponse)
    },
    report: async (itemId: string, reason?: string, _signal?: AbortSignal) => {
      // TODO: Replace with actual endpoint: POST /api/feed/{itemId}/report
      if (import.meta.env?.DEV) {
        console.debug('[api.feed.report] Stub - would report:', { itemId, reason })
      }
      return Promise.resolve({ ok: true } as ApiOkResponse)
    },
    suggestionFeedback: async (
      payload: {
        itemType: string
        itemId: string
        subtype?: 'profile' | 'match'
        feedback: 'positive' | 'negative'
      },
      _signal?: AbortSignal
    ) => {
      // TODO: Replace with actual endpoint: POST /api/feed/suggestions/feedback
      if (import.meta.env?.DEV) {
        console.debug('[api.feed.suggestionFeedback] Stub - would sync:', payload)
      }
      return Promise.resolve({ ok: true } as ApiOkResponse)
    },
  },
}
