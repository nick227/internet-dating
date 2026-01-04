import { toAvatarUrl } from './mediaPresenter.js';
import type { FollowerData } from '../loaders/accessLoader.js';
import type { CompatibilitySummary } from '../../../../services/compatibility/compatibilityService.js';

export type FollowerResponseItem = {
  requestId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  status: string;
  requestedAt: string;
  updatedAt: string;
  compatibility: CompatibilitySummary | null;
};

export function serializeFollower(
  follower: FollowerData,
  compatibility: CompatibilitySummary | null
): FollowerResponseItem {
  // toAvatarUrl accepts MediaRecord | MediaForAvatar | null | undefined
  // FollowerData.avatarMedia has the same structure as MediaRecord from mediaSelectBase
  // We can safely pass it through since the shape matches
  return {
    requestId: String(follower.id),
    userId: String(follower.userId),
    name: follower.displayName ?? `User ${follower.userId}`,
    avatarUrl: toAvatarUrl(follower.avatarMedia as Parameters<typeof toAvatarUrl>[0]),
    status: follower.status,
    requestedAt: follower.createdAt.toISOString(),
    updatedAt: follower.updatedAt.toISOString(),
    compatibility
  };
}
