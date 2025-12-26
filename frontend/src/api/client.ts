import { API_BASE_URL } from '../config/env'
import { adaptFeedResponse, adaptProfileResponse } from './adapters'
import type {
  ApiAuthLoginBody,
  ApiAuthLoginResponse,
  ApiAuthMeResponse,
  ApiAuthSignupBody,
  ApiAuthSignupResponse,
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
  ApiQuizResponse,
  ApiQuizSubmitBody,
  ApiQuizUpdateBody,
  ApiQuizUpdateResponse,
  ApiQuizQuestionPatchBody,
  ApiQuizQuestionPatchResponse,
  ApiQuizOptionPatchBody,
  ApiQuizOptionPatchResponse,
  ApiRateResponse,
  ApiSwipeResponse
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
  rate: '/api/profiles/{userId}/rate',
  like: '/api/swipes',
  postCreate: '/api/posts',
  postUpdate: '/api/posts/{postId}',
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
  mediaById: '/api/media/{mediaId}'
} as const satisfies Record<string, keyof paths>

function fillPath(template: string, params: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_match, key) => encodeURIComponent(String(params[key])))
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
      http<ApiAuthMeResponse>(`${API_BASE_URL}${API_PATHS.me}`, 'GET', { signal })
  },
  meta: (signal?: AbortSignal) => http<ApiMetaResponse>(`${API_BASE_URL}${API_PATHS.meta}`, 'GET', { signal }),
  feed: async (cursorId?: string | null, signal?: AbortSignal): Promise<FeedResponse> => {
    const q = cursorId ? `?cursorId=${encodeURIComponent(cursorId)}` : ''
    const res = await http<ApiFeedResponse>(`${API_BASE_URL}${API_PATHS.feed}${q}`, 'GET', { signal })
    return adaptFeedResponse(res)
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
  like: (body: LikeBody, signal?: AbortSignal) =>
    http<ApiSwipeResponse>(`${API_BASE_URL}${API_PATHS.like}`, 'POST', { body, signal }),
  rate: (userId: string | number, body: RateBody, signal?: AbortSignal) => {
    const path = fillPath(API_PATHS.rate, { userId })
    return http<ApiRateResponse>(`${API_BASE_URL}${path}`, 'POST', { body, signal })
  },
  posts: {
    create: (body: ApiPostCreateBody, signal?: AbortSignal) =>
      http<ApiPostCreateResponse>(`${API_BASE_URL}${API_PATHS.postCreate}`, 'POST', { body, signal }),
    update: (postId: string | number, body: ApiPostPatchBody, signal?: AbortSignal) => {
      const path = fillPath(API_PATHS.postUpdate, { postId })
      return http<ApiPostPatchResponse>(`${API_BASE_URL}${path}`, 'PATCH', { body, signal })
    }
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
    sendMessage: (conversationId: string | number, body: ApiMessageSendBody, signal?: AbortSignal) => {
      const path = fillPath(API_PATHS.conversationMessages, { conversationId })
      return http<ApiMessageSendResponse>(`${API_BASE_URL}${path}`, 'POST', { body, signal })
    },
    markRead: (messageId: string | number, signal?: AbortSignal) => {
      const path = fillPath(API_PATHS.messageRead, { messageId })
      return http<ApiOkResponse>(`${API_BASE_URL}${path}`, 'POST', { signal })
    }
  },
  media: {
    upload: (file: File, signal?: AbortSignal) => {
      const form = new FormData()
      form.append('file', file)
      return http<ApiMediaUploadResponse>(`${API_BASE_URL}${API_PATHS.mediaUpload}`, 'POST', { body: form, signal })
    },
    get: (mediaId: string | number, signal?: AbortSignal) => {
      const path = fillPath(API_PATHS.mediaById, { mediaId })
      return http<ApiMediaResponse>(`${API_BASE_URL}${path}`, 'GET', { signal })
    }
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
    updateQuestion: (quizId: string | number, questionId: string | number, body: ApiQuizQuestionPatchBody, signal?: AbortSignal) => {
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
    }
  }
}
