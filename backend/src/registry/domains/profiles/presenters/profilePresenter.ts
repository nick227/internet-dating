import { toAvatarUrl } from './mediaPresenter.js';
import type { ProfileWithMedia } from '../types/models.js';
import type { ProfileResponse } from '../types/dto.js';

export function serializeProfile(profile: ProfileWithMedia): ProfileResponse['profile'] {
  const { id, avatarMedia, heroMedia, ...profileData } = profile;
  return {
    userId: String(profileData.userId),
    displayName: profileData.displayName,
    bio: profileData.bio,
    birthdate: profileData.birthdate?.toISOString() ?? null,
    locationText: profileData.locationText,
    gender: profileData.gender,
    intent: profileData.intent,
    isVisible: profileData.isVisible,
    avatarUrl: toAvatarUrl(avatarMedia),
    heroUrl: toAvatarUrl(heroMedia),
    top5Lists: profile.top5Lists?.map(list => ({
      id: String(list.id),
      title: list.title,
      updatedAt: list.updatedAt.toISOString(),
      items: list.items.map(item => ({
        order: item.order,
        text: item.text
      }))
    }))
  };
}
