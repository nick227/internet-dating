import type { ProfileResponse, AccessStatus } from '../../api/types'
import { idsEqual } from '../utils/ids'
import { ACCESS_STATUS } from './accessStatus'

export type ProfileViewState = {
  isOwner: boolean
  ownerId: string | number | null
  accessStatus: AccessStatus
  hasPrivateContent: boolean
  showAccessCard: boolean
  showFollowButton: boolean
  shouldShowPosts: boolean
}

export function deriveProfileViewState(
  profile: ProfileResponse | null | undefined,
  currentUserId: string | number | null | undefined
): ProfileViewState {
  if (!profile) {
    return {
      isOwner: false,
      ownerId: null,
      accessStatus: ACCESS_STATUS.NONE,
      hasPrivateContent: false,
      showAccessCard: false,
      showFollowButton: false,
      shouldShowPosts: false,
    }
  }

  const isOwner =
    currentUserId != null && profile.userId != null && idsEqual(currentUserId, profile.userId)
  const ownerId = isOwner ? (currentUserId as string | number) : null

  const access = profile.access ?? null
  const accessStatus: AccessStatus = access?.status ?? ACCESS_STATUS.NONE
  const hasPrivateContent = Boolean(access?.hasPrivatePosts || access?.hasPrivateMedia)

  const showAccessCard = !isOwner && hasPrivateContent && accessStatus !== ACCESS_STATUS.GRANTED
  const showFollowButton = !isOwner && Boolean(currentUserId) && Boolean(profile)
  const shouldShowPosts = Boolean(ownerId || (profile.posts?.length ?? 0) > 0)

  return {
    isOwner,
    ownerId,
    accessStatus,
    hasPrivateContent,
    showAccessCard,
    showFollowButton,
    shouldShowPosts,
  }
}
