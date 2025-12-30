import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useProfile } from '../../core/profile/useProfile'
import { useProfileDraft } from '../../core/profile/useProfileDraft'
import { useProfileAccess } from '../../core/profile/useProfileAccess'
import { deriveProfileViewState } from '../../core/profile/profileState'
import { ACCESS_STATUS } from '../../core/profile/accessStatus'
import { useCurrentUser } from '../../core/auth/useCurrentUser'
import { getErrorMessage } from '../../core/utils/errors'
import { ProfileMediaRail } from '../profile/ProfileMediaRail'
import { ProfileActions } from '../profile/ProfileActions'
import { ProfileMediaManager } from '../profile/ProfileMediaManager'
import { PostComposer } from '../profile/PostComposer'
import { ProfileInlineEditor } from '../profile/ProfileInlineEditor'
import { ProfilePostList } from '../profile/ProfilePostList'
import { HeroSection } from '../profile/HeroSection'
import { ProfileRatings } from '../profile/ProfileRatings'

/**
 * Safely decodes a URL-encoded userId parameter.
 * Returns the original value if decoding fails (malformed encoding).
 */
function safeDecodeUserId(userId: string | undefined): string | undefined {
  if (!userId) return undefined
  try {
    return decodeURIComponent(userId)
  } catch {
    return userId
  }
}

export function ProfilePage() {
  const { userId } = useParams()
  const id = useMemo(() => safeDecodeUserId(userId), [userId])
  const { data, error, refresh } = useProfile(id)
  const { userId: currentUserId } = useCurrentUser()

  const {
    profile,
    updateProfile,
    updatePost,
    deletePost,
    deleteMedia,
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

  const errorMessage = error ? getErrorMessage(error, 'Failed to load profile') : null

  // Delete operations handle refresh internally via useProfileDraft
  const handlePostDelete = viewState.ownerId ? deletePost : undefined
  const handleMediaDelete = viewState.ownerId ? deleteMedia : undefined

  return (
    <div className="profile u-hide-scroll">
      <HeroSection profile={profile ?? undefined} />

      <div className="profile__sheet">
        {profile?.bio ? (
          <div className="u-glass promptCard">
            <div className="u-stack">
              <div className="profile__sectionTitle">About</div>
              <div className="u-subtitle u-clamp-3">{profile.bio}</div>
            </div>
          </div>
        ) : (
          <div className="u-glass profile__card">
            <div className="u-stack">
              <div className="profile__sectionTitle">About</div>
              <div className="profile__meta">No bio yet.</div>
            </div>
          </div>
        )}

        {viewState.ownerId && profile && (
          <ProfileInlineEditor userId={viewState.ownerId} profile={profile} onProfileChange={updateProfile} />
        )}

        {viewState.ownerId && (
          <ProfileMediaManager
            userId={viewState.ownerId}
            avatarUrl={profile?.avatarUrl ?? null}
            heroUrl={profile?.heroUrl ?? null}
            onUpdated={refresh}
          />
        )}

        {viewState.ownerId && <PostComposer onPosted={refresh} />}

        <ProfileRatings ratings={profile?.ratings} />

        {viewState.shouldShowPosts && (
          <ProfilePostList
            posts={profile?.posts ?? []}
            readOnly={!viewState.ownerId}
            onPostUpdate={viewState.ownerId ? updatePost : undefined}
            onPostDelete={handlePostDelete}
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
                  disabled={viewState.accessStatus !== ACCESS_STATUS.NONE || accessBusy}
                >
                  {viewState.accessStatus === ACCESS_STATUS.PENDING
                    ? 'Follow Request Sent'
                    : viewState.accessStatus === ACCESS_STATUS.GRANTED
                      ? 'Following'
                      : accessBusy
                        ? 'Requesting...'
                        : 'Follow'}
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

        <ProfileMediaRail
          items={profile?.media ?? []}
          readOnly={!viewState.ownerId}
          onMediaDelete={handleMediaDelete}
        />

        {profile?.userId && (
          <ProfileActions
            userId={profile.userId}
            initialRating={profile?.ratings?.mine ?? null}
            onRated={updateRating}
          />
        )}

        {errorMessage && (
          <div className="u-glass profile__card">
            <div className="profile__itemTitle">Error</div>
            <div className="profile__meta u-mt-2">{errorMessage}</div>
          </div>
        )}
      </div>
    </div>
  )
}
