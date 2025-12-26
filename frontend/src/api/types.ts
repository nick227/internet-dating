import type { components } from './openapi'

export type Id = string | number

export type FeedCard =
  | { kind: 'profile'; userId: Id; name: string; age?: number; locationText?: string; intent?: string; heroUrl?: string; blurb?: string }
  | { kind: 'post'; postId: Id; userId: Id; name: string; heroUrl?: string; text?: string; createdAt?: string }

export type FeedResponse = { items: FeedCard[]; nextCursor: string | null }

export type Visibility = components['schemas']['Visibility']
export type MediaType = components['schemas']['MediaType']
export type ProfileMedia = { id: Id; url: string; type?: MediaType; thumbUrl?: string | null }
export type ProfileResponse = {
  userId: Id
  name: string
  age?: number
  birthdate?: string
  locationText?: string
  intent?: DatingIntent
  gender?: Gender
  isVisible?: boolean
  bio?: string
  heroUrl?: string
  avatarUrl?: string
  media?: ProfileMedia[]
  posts?: ProfilePost[]
}

export type SwipeAction = components['schemas']['SwipeAction']
export type Gender = components['schemas']['Gender']
export type DatingIntent = components['schemas']['DatingIntent']
export type LikeBody = { toUserId: Id; action: SwipeAction }
export type RateBody = components['schemas']['RateBody']

export type ProfilePost = {
  id: Id
  text?: string
  createdAt: string
  visibility?: Visibility
  media?: ProfileMedia[]
}
