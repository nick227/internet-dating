import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useProfile } from '../../core/profile/useProfile'
import { useProfileDraft } from '../../core/profile/useProfileDraft'
import { useProfileAccess } from '../../core/profile/useProfileAccess'
import { deriveProfileViewState, getFollowButtonLabel } from '../../core/profile/profileState'
import { ACCESS_STATUS } from '../../core/profile/accessStatus'
import { useCurrentUser } from '../../core/auth/useCurrentUser'
import { getErrorMessage } from '../../core/utils/errors'
import { ProfileActions } from '../profile/ProfileActions'
import { PostComposer } from '../profile/PostComposer'
import { ProfilePostList } from '../profile/ProfilePostList'
import { HeroSection } from '../profile/HeroSection'
import { useControlPanel } from '../shell/ControlPanelContext'

/**
 * Safely decodes a URL-encoded userId parameter.
 * Returns the original value if decoding fails (malformed encoding).
 * Logs a warning in development mode if decoding fails.
 */
function safeDecodeUserId(userId: string | undefined): string | undefined {
  if (!userId) return undefined
  try {
    return decodeURIComponent(userId)
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[ProfilePage] Failed to decode userId parameter, using raw value:', userId, err)
    }
    return userId
  }
}

export function ProfilePage() {
  const { userId } = useParams()
  const id = safeDecodeUserId(userId)
  const { data, error, refresh } = useProfile(id)
  const { userId: currentUserId } = useCurrentUser()
  const { openControlPanel } = useControlPanel()

  const {
    profile,
    updatePost,
    deletePost,
    updateAccess,
    updateRating,
  } = useProfileDraft(data, refresh)

  const viewState = useMemo(
    () => deriveProfileViewState(profile, currentUserId),
    [profile, currentUserId]
  )

  const { requestAccess, busy: accessBusy, error: accessError } = useProfileAccess(
    profile?.userId,
    updateAccess
  )

  const profileError = error ? getErrorMessage(error, 'Failed to load profile') : null
  const allErrors = [profileError, accessError].filter(Boolean)

  // Delete operations handle refresh internally via useProfileDraft
  // Allow users to delete their own posts even on other profiles
  const handlePostDelete = deletePost
  const followButtonLabel = getFollowButtonLabel(viewState.accessStatus, accessBusy)

  return (
    <div className="profile u-hide-scroll profile__sheet">
      <HeroSection
        profile={profile ?? undefined}
        isOwner={!!viewState.ownerId}
        onMediaUpdate={refresh}
      />

      {profile?.userId && !viewState.ownerId && (
        <ProfileActions
          userId={profile.userId}
          initialRating={profile?.ratings?.mine ?? null}
          onRated={updateRating}
        />
      )}

      {profile?.bio ? (
        <div className="u-glass promptCard">
          <div className="u-stack">
            <div className="profile__sectionTitle">About</div>
            <div className="u-subtitle">{profile.bio}</div>
          </div>
        </div>
      ) : (
        <div className="u-glass profile__card">
          <div className="u-stack">
            <div className="profile__meta">No bio yet.</div>
          </div>
        </div>
      )}

      {viewState.ownerId && (
        <div className="u-glass profile__card">
          <div className="u-stack">
            <button
              className="topBar__btn"
              type="button"
              onClick={openControlPanel}
            >
              Account Settings
            </button>
          </div>
        </div>
      )}

      <div className='mb-48 post-composer'>
        {viewState.shouldShowPosts && <PostComposer onPosted={refresh} targetProfileUserId={profile?.userId} />}
      </div>

      {viewState.shouldShowPosts && (
        <ProfilePostList
          posts={profile?.posts ?? []}
          readOnly={!viewState.ownerId}
          onPostUpdate={viewState.ownerId ? updatePost : undefined}
          onPostDelete={handlePostDelete}
          authorName={profile?.name}
          authorAvatarUrl={profile?.avatarUrl ?? null}
          authorId={profile?.userId ?? null}
        />
      )}

      {viewState.showFollowButton && (
        <div className="u-glass profile__card">
          <div className="u-stack">
            <div className="u-row-between u-gap-3 u-wrap">
              <button
                className="topBar__btn topBar__btn--primary"
                type="button"
                onClick={requestAccess}
                disabled={
                  (viewState.accessStatus !== ACCESS_STATUS.NONE &&
                    viewState.accessStatus !== ACCESS_STATUS.CANCELED) ||
                  accessBusy
                }
              >
                {followButtonLabel}
              </button>
              {accessError && <div className="profile__error">{accessError}</div>}
            </div>
          </div>
        </div>
      )}

      {viewState.showAccessCard && (
        <div className="u-glass profile__card">
          <div className="u-stack">
            <div className="profile__sectionTitle">Private content</div>
            <div className="profile__meta">This profile has private posts or media.</div>
            {viewState.accessStatus === ACCESS_STATUS.NONE && (
              <div className="profile__meta">
                Follow this profile to request access to private content.
              </div>
            )}
          </div>
        </div>
      )}

      {allErrors.length > 0 && (
        <div className="u-glass profile__card">
          <div className="profile__itemTitle">Error</div>
          <div className="profile__meta u-mt-2">{allErrors.join(' • ')}</div>
        </div>
      )}
    </div>
  )
}
