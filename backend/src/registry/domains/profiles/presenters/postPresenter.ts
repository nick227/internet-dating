import { toAvatarUrl, toPublicMedia } from './mediaPresenter.js';
import type { PostForProfile } from '../types/models.js';
import type { ProfileResponse } from '../types/dto.js';

export function serializePost(post: PostForProfile): ProfileResponse['posts'][0] {
  return {
    id: String(post.id),
    userId: String(post.userId),
    visibility: post.visibility,
    text: post.text,
    createdAt: post.createdAt.toISOString(),
    author: {
      id: String(post.user.id),
      displayName: post.user.profile?.displayName ?? null,
      avatarUrl: toAvatarUrl(post.user.profile?.avatarMedia ?? null)
    },
    media: post.media.map(m => ({
      order: m.order,
      media: toPublicMedia(m.media)
    }))
  };
}
