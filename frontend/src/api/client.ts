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
  ApiLikesResponse,
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
import { HttpError, http } from './http'
import { refreshToken } from './authRefresh'
import type { FeedResponse, ProfileResponse, LikeBody, RateBody } from './types'

export type InterestItem = {
  id: string
  key: string
  label: string
  subjectId: string
  subject: {
    id: string
    key: string
    label: string
  }
  selected: boolean
  createdAt?: string
}

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
  cancelFollowRequest: '/api/profiles/access-requests/{requestId}/cancel',
  revokeFollowRequest: '/api/profiles/access-requests/{requestId}/revoke',
  rate: '/api/profiles/{userId}/rate',
  like: '/api/likes',
  likesList: '/api/likes',
  postCreate: '/api/posts',
  postUpdate: '/api/posts/{postId}',
  postDelete: '/api/posts/{postId}',
  postMediaDelete: '/api/posts/{postId}/media/{mediaId}',
  inbox: '/api/inbox',
  matches: '/api/matches',
  conversation: '/api/conversations/{conversationId}',
  conversationMessages: '/api/conversations/{conversationId}/messages',
  conversationDelete: '/api/conversations/{conversationId}/delete',
  messageRead: '/api/messages/{messageId}/read',
  quizActive: '/api/quizzes/active',
  quizSubmit: '/api/quizzes/{quizId}/submit',
  quizById: '/api/quizzes/{quizId}',
  quizResults: '/api/quizzes/{quizId}/results',
  quizUpdate: '/api/quizzes/{quizId}',
  quizQuestionUpdate: '/api/quizzes/{quizId}/questions/{questionId}',
  quizOptionUpdate: '/api/quizzes/{quizId}/questions/{questionId}/options/{optionId}',
  mediaUpload: '/api/media/upload',
  mediaById: '/api/media/{mediaId}',
  mediaDelete: '/api/media/{mediaId}',
  quizList: '/api/quizzes',
  quizTags: '/api/quizzes/tags',
  interestsSubjects: '/api/interests/subjects',
  interestsList: '/api/interests',
  interestsMy: '/api/interests/my',
  interestSelect: '/api/interests/{interestId}/select',
  interestSearch: '/api/interests/search',
  profileAdvancedSearch: '/api/profiles/advanced-search',
  profileRecommendations: '/api/profiles/recommendations',
  profileSearchTraits: '/api/profiles/search/traits',
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
  feed: async (cursorId?: string | null, signal?: AbortSignal, options?: { take?: number; lite?: boolean }): Promise<FeedResponse> => {
    const params = new URLSearchParams()
    if (cursorId) params.set('cursorId', cursorId)
    if (options?.take) params.set('take', String(options.take))
    if (options?.lite) params.set('lite', '1')
    const q = params.toString() ? `?${params.toString()}` : ''
    const url = `${API_BASE_URL}${API_PATHS.feed}${q}`
    feedDebugLog('[DEBUG] api.feed: Making request', { url, lite: options?.lite, take: options?.take, cursorId })
    // Phase-1 returns different structure, so use unknown and let adapter handle it
    const res = await http<unknown>(url, 'GET', {
      signal,
    })
    const resItems = (res as { items?: unknown[] }).items
    feedDebugLog('[DEBUG] api.feed: Response received', {
      hasItems: Array.isArray(resItems),
      itemsLength: resItems?.length,
    })
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
  advancedSearch: async (filters: {
    q?: string
    gender?: string[]
    intent?: string[]
    ageMin?: number
    ageMax?: number
    location?: string
    interests?: string[]
    interestSubjects?: string[]
    traits?: Array<{ key: string; min?: number; max?: number; group?: string }>
    top5Query?: string
    top5Type?: 'title' | 'item'
    sort?: 'newest' | 'age'
    limit?: number
    cursor?: string
  }, signal?: AbortSignal) => {
    const params = new URLSearchParams()
    if (filters.q) params.set('q', filters.q)
    if (filters.limit) params.set('limit', String(filters.limit))
    if (filters.sort) params.set('sort', filters.sort)
    filters.gender?.forEach(g => params.append('gender', g))
    filters.intent?.forEach(i => params.append('intent', i))
    filters.interests?.forEach(id => params.append('interests', id))
    filters.interestSubjects?.forEach(key => params.append('interestSubjects', key))
    if (filters.ageMin !== undefined) params.set('ageMin', String(filters.ageMin))
    if (filters.ageMax !== undefined) params.set('ageMax', String(filters.ageMax))
    if (filters.location) params.set('location', filters.location)
    if (filters.top5Query) params.set('top5Query', filters.top5Query)
    if (filters.top5Type) params.set('top5Type', filters.top5Type)
    if (filters.traits && filters.traits.length > 0) {
      params.set('traits', btoa(JSON.stringify(filters.traits)))
    }
    if (filters.cursor) params.set('cursor', filters.cursor)
    const q = params.toString() ? `?${params.toString()}` : ''
    return http<{
      profiles: Array<{
        userId: string
        displayName: string | null
        bio: string | null
        avatarUrl: string | null
        heroUrl: string | null
        locationText: string | null
        age: number | null
        gender: string
        intent: string
        liked?: boolean
        matchReasons?: string[]
      }>
      nextCursor: string | null
      queryId?: string
    }>(`${API_BASE_URL}${API_PATHS.profileAdvancedSearch}${q}`, 'GET', { signal })
  },
  getRecommendations: async (filters: {
    limit?: number
    cursor?: string
  } = {}, signal?: AbortSignal) => {
    const params = new URLSearchParams()
    if (filters.limit) params.set('limit', String(filters.limit))
    if (filters.cursor) params.set('cursor', filters.cursor)
    const q = params.toString() ? `?${params.toString()}` : ''
    return http<{
      profiles: Array<{
        userId: string
        displayName: string | null
        bio: string | null
        avatarUrl: string | null
        heroUrl: string | null
        locationText: string | null
        age: number | null
        gender: string
        intent: string
        liked?: boolean
        matchReasons?: string[]
      }>
      nextCursor: string | null
    }>(`${API_BASE_URL}${API_PATHS.profileRecommendations}${q}`, 'GET', { signal })
  },
  getSearchTraits: async (signal?: AbortSignal) => {
    return http<{
      traits: Record<string, Array<{ key: string; count: number }>>
    }>(`${API_BASE_URL}${API_PATHS.profileSearchTraits}`, 'GET', { signal })
  },
  approveFollowRequest: (requestId: string | number, signal?: AbortSignal) => {
    const path = fillPath(API_PATHS.approveFollowRequest, { requestId })
    return http<ApiProfileAccessResponse>(`${API_BASE_URL}${path}`, 'POST', { signal })
  },
  denyFollowRequest: (requestId: string | number, signal?: AbortSignal) => {
    const path = fillPath(API_PATHS.denyFollowRequest, { requestId })
    return http<ApiProfileAccessResponse>(`${API_BASE_URL}${path}`, 'POST', { signal })
  },
  cancelFollowRequest: (requestId: string | number, signal?: AbortSignal) => {
    const path = fillPath(API_PATHS.cancelFollowRequest, { requestId })
    return http<ApiProfileAccessResponse>(`${API_BASE_URL}${path}`, 'POST', { signal })
  },
  revokeFollowRequest: (requestId: string | number, signal?: AbortSignal) => {
    const path = fillPath(API_PATHS.revokeFollowRequest, { requestId })
    return http<ApiProfileAccessResponse>(`${API_BASE_URL}${path}`, 'POST', { signal })
  },
  like: (body: LikeBody, signal?: AbortSignal) =>
    http<ApiSwipeResponse>(`${API_BASE_URL}${API_PATHS.like}`, 'POST', { body, signal }),
  likes: (signal?: AbortSignal) =>
    http<ApiLikesResponse>(`${API_BASE_URL}${API_PATHS.likesList}`, 'GET', { signal }),
  rate: (userId: string | number, body: RateBody, signal?: AbortSignal) => {
    const path = fillPath(API_PATHS.rate, { userId })
    return http<ApiRateResponse>(`${API_BASE_URL}${path}`, 'POST', { body, signal })
  },
  posts: {
    create: async (body: ApiPostCreateBody & { tags?: string[] }, signal?: AbortSignal) => {
      const res = await http<ApiPostCreateResponse>(`${API_BASE_URL}${API_PATHS.postCreate}`, 'POST', {
        body,
        signal,
      })
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('feed:cache-bust', { detail: { reason: 'post-create' } }))
      }
      return res
    },
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
    inbox: (cursorId?: string | number | null, take?: number, signal?: AbortSignal) => {
      const params = new URLSearchParams()
      if (cursorId) params.set('cursorId', String(cursorId))
      if (take) params.set('take', String(take))
      const q = params.toString() ? `?${params.toString()}` : ''
      return http<ApiInboxResponse>(`${API_BASE_URL}${API_PATHS.inbox}${q}`, 'GET', { signal })
    },
    matches: (signal?: AbortSignal) =>
      http<ApiMatchListResponse>(`${API_BASE_URL}${API_PATHS.matches}`, 'GET', { signal }),
    getOrCreateConversation: async (userId: string | number, signal?: AbortSignal) => {
      const url = `${API_BASE_URL}/api/conversations/with/${encodeURIComponent(String(userId))}`
      try {
        return await http<{ conversationId: string | number }>(url, 'POST', { signal })
      } catch (err) {
        if (err instanceof HttpError && err.status === 401) {
          await refreshToken(s => api.auth.refresh(s), signal)
          return await http<{ conversationId: string | number }>(url, 'POST', { signal })
        }
        throw err
      }
    },
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
    deleteConversation: (conversationId: string | number, signal?: AbortSignal) => {
      const path = fillPath(API_PATHS.conversationDelete, { conversationId })
      return http<ApiOkResponse>(`${API_BASE_URL}${path}`, 'POST', { signal })
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
      byId: (quizId: string | number, signal?: AbortSignal) => {
        const path = fillPath(API_PATHS.quizById, { quizId })
        return http<ApiQuizResponse>(`${API_BASE_URL}${path}`, 'GET', { signal })
      },
    submit: (quizId: string | number, body: ApiQuizSubmitBody, signal?: AbortSignal) => {
      const path = fillPath(API_PATHS.quizSubmit, { quizId })
      return http<ApiOkResponse>(`${API_BASE_URL}${path}`, 'POST', { body, signal })
    },
    results: (quizId: string | number, signal?: AbortSignal) => {
      const path = fillPath(API_PATHS.quizResults, { quizId })
      return http<import('../ui/quiz/results/types.js').QuizResults>(`${API_BASE_URL}${path}`, 'GET', { signal })
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
    list: (params?: { q?: string; status?: string; sort?: string; tag?: string }, signal?: AbortSignal) => {
      const urlParams = new URLSearchParams()
      if (params?.q) urlParams.set('q', params.q)
      if (params?.status) urlParams.set('status', params.status)
      if (params?.sort) urlParams.set('sort', params.sort)
      if (params?.tag) urlParams.set('tag', params.tag)
      const q = urlParams.toString() ? `?${urlParams.toString()}` : ''
      type QuizListItem = { id: string; slug: string; title: string; description?: string; isActive: boolean; createdAt: string; updatedAt: string; questionCount: number; status?: 'new' | 'in_progress' | 'completed'; result?: string; completedAt?: string; progress?: number; tags?: Array<{ slug: string; label: string }> }
      return http<{ items: QuizListItem[] }>(`${API_BASE_URL}${API_PATHS.quizList}${q}`, 'GET', { signal })
    },
    tags: (signal?: AbortSignal) => {
      return http<{ tags: { slug: string; label: string }[] }>(`${API_BASE_URL}${API_PATHS.quizTags}`, 'GET', { signal })
    },
  },
  interests: {
    subjects: (signal?: AbortSignal) => {
      return http<{ subjects: Array<{ id: string; key: string; label: string }> }>(`${API_BASE_URL}${API_PATHS.interestsSubjects}`, 'GET', { signal })
    },
    list: (params?: { subjectId?: string; q?: string; cursorId?: string; take?: number }, signal?: AbortSignal) => {
      const urlParams = new URLSearchParams()
      if (params?.subjectId) urlParams.set('subjectId', params.subjectId)
      if (params?.q) urlParams.set('q', params.q)
      if (params?.cursorId) urlParams.set('cursorId', params.cursorId)
      if (params?.take) urlParams.set('take', String(params.take))
      const q = urlParams.toString() ? `?${urlParams.toString()}` : ''
      return http<{ items: Array<InterestItem>; nextCursor: string | null; hasMore: boolean }>(`${API_BASE_URL}${API_PATHS.interestsList}${q}`, 'GET', { signal })
    },
    my: (signal?: AbortSignal) => {
      return http<{ items: Array<InterestItem> }>(`${API_BASE_URL}${API_PATHS.interestsMy}`, 'GET', { signal })
    },
    select: (interestId: string | number, signal?: AbortSignal) => {
      const path = fillPath(API_PATHS.interestSelect, { interestId })
      return http<InterestItem>(`${API_BASE_URL}${path}`, 'POST', { signal })
    },
    deselect: (interestId: string | number, signal?: AbortSignal) => {
      const path = fillPath(API_PATHS.interestSelect, { interestId })
      return http<ApiOkResponse>(`${API_BASE_URL}${path}`, 'DELETE', { signal })
    },
    search: (body: { text: string; subjectId: string }, signal?: AbortSignal) => {
      return http<{ items: Array<InterestItem> }>(`${API_BASE_URL}${API_PATHS.interestSearch}`, 'POST', { body, signal })
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
