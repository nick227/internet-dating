import type {
  ApiFeedResponse,
  ApiMedia,
  ApiProfileResponse
} from './contracts'
import type {
  FeedCard,
  FeedResponse,
  ProfileMedia,
  ProfileResponse,
  ProfilePost
} from './types'
import { toAge } from '../core/format/toAge'

export function adaptFeedResponse(res: ApiFeedResponse): FeedResponse {
  const suggestions: FeedCard[] = res.suggestions.map((s) => ({
    kind: 'profile',
    userId: s.userId,
    name: s.displayName ?? 'Unknown',
    locationText: s.locationText ?? undefined,
    intent: s.intent ?? undefined,
    blurb: s.bio ?? undefined
  }))

  const posts: FeedCard[] = res.posts.map((p) => ({
    kind: 'post',
    postId: p.id,
    userId: p.user.id,
    name: p.user.profile?.displayName ?? 'Unknown',
    heroUrl: pickMediaUrl(p.media.map((m) => m.media)),
    text: p.text ?? undefined,
    createdAt: p.createdAt
  }))

  return {
    items: suggestions.concat(posts),
    nextCursor: res.nextCursorId == null ? null : String(res.nextCursorId)
  }
}

export function adaptProfileResponse(res: ApiProfileResponse): ProfileResponse {
  if (!res.profile) throw new Error('Profile not found')

  const posts = mapProfilePosts(res.posts)
  const media = flattenMedia(res.posts)
  const heroUrl = res.profile.heroUrl ?? media[0]?.url ?? media[0]?.thumbUrl ?? undefined

  return {
    userId: res.profile.userId,
    name: res.profile.displayName ?? '',
    age: toAge(res.profile.birthdate),
    birthdate: res.profile.birthdate ?? undefined,
    locationText: res.profile.locationText ?? undefined,
    intent: res.profile.intent ?? undefined,
    gender: res.profile.gender ?? undefined,
    isVisible: res.profile.isVisible ?? undefined,
    bio: res.profile.bio ?? undefined,
    avatarUrl: res.profile.avatarUrl ?? undefined,
    heroUrl,
    media,
    posts
  }
}

function flattenMedia(posts: { media: { media: ApiMedia }[] }[]): ProfileMedia[] {
  const seen = new Set<string>()
  const items: ProfileMedia[] = []

  for (const post of posts) {
    for (const entry of post.media) {
      const media = entry.media
      const id = String(media.id)
      if (seen.has(id)) continue
      seen.add(id)
      items.push({
        id,
        url: media.url,
        thumbUrl: media.thumbUrl ?? undefined,
        type: media.type
      })
    }
  }

  return items
}

function pickMediaUrl(media: ApiMedia[]) {
  if (!media.length) return undefined
  const first = media[0]
  return first.thumbUrl ?? first.url ?? undefined
}

function mapProfilePosts(posts: ApiProfileResponse['posts']): ProfilePost[] {
  return posts.map((post) => ({
    id: post.id,
    text: post.text ?? undefined,
    createdAt: post.createdAt,
    visibility: post.visibility,
    media: post.media.map((entry) => ({
      id: entry.media.id,
      url: entry.media.url,
      thumbUrl: entry.media.thumbUrl ?? undefined,
      type: entry.media.type
    }))
  }))
}
