import type { ProfileResponse, AccessStatus } from '../../api/types'
import { idsEqual } from '../utils/ids'
import { ACCESS_STATUS } from './accessStatus'

export type ProfileViewState = {
  isOwner: boolean
  /** Owner ID when isOwner is true, null otherwise. Used as both boolean gate and identifier. */
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
  const showFollowButton =
    !isOwner &&
    Boolean(currentUserId) &&
    Boolean(profile) &&
    accessStatus !== ACCESS_STATUS.DENIED &&
    accessStatus !== ACCESS_STATUS.REVOKED
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

export function getFollowButtonLabel(
  accessStatus: AccessStatus,
  isBusy: boolean
): string {
  if (accessStatus === ACCESS_STATUS.PENDING) return 'Follow Request Sent'
  if (accessStatus === ACCESS_STATUS.GRANTED) return 'Following'
  if (accessStatus === ACCESS_STATUS.CANCELED) return 'Follow'
  if (accessStatus === ACCESS_STATUS.DENIED) return 'Request denied'
  if (accessStatus === ACCESS_STATUS.REVOKED) return 'Removed'
  if (isBusy) return 'Requesting...'
  return 'Follow'
}
