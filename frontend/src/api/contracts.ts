/**
 * API Contracts
 *
 * Raw API types directly mapped from OpenAPI schema.
 * These represent the exact structure returned by the backend API.
 *
 * Single source of truth: Generated from api/openapi.ts
 *
 * Usage:
 * - Use Api* types in API client, adapters, and when working with raw API responses
 * - Transform to domain types (from api/types.ts) for use in components
 *
 * ⚠️ IMPORT RESTRICTION:
 * UI components must NOT import directly from this file unless rendering raw API lists.
 * Instead, use domain types from api/types.ts (transformed, frontend-adapted).
 *
 * Allowed imports:
 * - api/client.ts, api/adapters.ts (API layer)
 * - Admin/debug components rendering raw API responses
 *
 * Forbidden imports:
 * - Regular UI components (use api/types.ts instead)
 * - Hooks, state management (use api/types.ts instead)
 */

import type { components } from './openapi'

type Schemas = components['schemas']

// Core API types
export type ApiId = Schemas['Id']

// Auth
export type ApiAuthSignupBody = Schemas['AuthSignupBody']
export type ApiAuthSignupResponse = Schemas['AuthSignupResponse']
export type ApiAuthLoginBody = Schemas['AuthLoginBody']
export type ApiAuthLoginResponse = Schemas['AuthLoginResponse']
export type ApiAuthMeResponse = Schemas['AuthMeResponse']

// Meta
export type ApiMetaResponse = Schemas['MetaResponse']
export type ApiOkResponse = Schemas['OkResponse']

// Media
export type ApiMedia = Schemas['Media']
export type ApiMediaUploadResponse = Schemas['MediaUploadResponse']
export type ApiMediaResponse = Schemas['MediaResponse']

// Posts
export type ApiPostCreateBody = Schemas['PostCreateBody']
export type ApiPostCreateResponse = Schemas['PostCreateResponse']
export type ApiPostPatchBody = Schemas['PostPatchBody']
export type ApiPostPatchResponse = Schemas['PostPatchResponse']
export type ApiFeedPost = Schemas['FeedPost']
export type ApiFeedSuggestion = Schemas['FeedSuggestion']
export type ApiFeedResponse = Schemas['FeedResponse']

// Profiles
export type ApiProfileResponse = Schemas['ProfileResponse']
export type ApiProfilePatchBody = Schemas['ProfilePatchBody']
export type ApiProfilePatchResponse = Schemas['ProfilePatchResponse']
export type ApiProfileAccessGrantBody = Schemas['ProfileAccessGrantBody']
export type ApiProfileAccessResponse = Schemas['ProfileAccessResponse']
export type ApiFollowerItem = Schemas['FollowerItem']
export type ApiFollowersResponse = Schemas['FollowersResponse']
export type ApiFollowingResponse = Schemas['FollowingResponse']

// Swipes & Ratings
export type ApiSwipeResponse = Schemas['SwipeResponse']
export type ApiRateResponse = Schemas['OkResponse']

// Messaging
export type ApiInboxResponse = Schemas['InboxResponse']
export type ApiInboxConversation = Schemas['InboxConversation']
export type ApiInboxUser = Schemas['InboxUser']
export type ApiInboxMessage = Schemas['InboxMessage']
export type ApiMessageItem = Schemas['MessageItem']
export type ApiMessageListResponse = Schemas['MessageListResponse']
export type ApiMessageSendBody = Schemas['MessageSendBody']
export type ApiMessageSendResponse = Schemas['MessageSendResponse']

// Quiz
export type ApiQuizResponse = Schemas['QuizResponse']
export type ApiQuizSubmitBody = Schemas['QuizSubmitBody']
export type ApiQuizUpdateBody = Schemas['QuizUpdateBody']
export type ApiQuizUpdateResponse = Schemas['QuizUpdateResponse']
export type ApiQuizQuestionPatchBody = Schemas['QuizQuestionPatchBody']
export type ApiQuizQuestionPatchResponse = Schemas['QuizQuestionPatchResponse']
export type ApiQuizOptionPatchBody = Schemas['QuizOptionPatchBody']
export type ApiQuizOptionPatchResponse = Schemas['QuizOptionPatchResponse']

// Matches
export type ApiMatchListResponse = Schemas['MatchListResponse']
