import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useProfile } from '../../core/profile/useProfile'
import { useCurrentUser } from '../../core/auth/useCurrentUser'
import type { ProfileResponse } from '../../api/types'
import { toAge } from '../../core/format/toAge'
import { ProfileMediaRail } from '../profile/ProfileMediaRail'
import { ProfileActions } from '../profile/ProfileActions'
import { ProfileMediaManager } from '../profile/ProfileMediaManager'
import { PostComposer } from '../profile/PostComposer'
import { ProfileInlineEditor } from '../profile/ProfileInlineEditor'
import { ProfilePostList } from '../profile/ProfilePostList'
import { HeroSection } from '../profile/HeroSection'

export function ProfilePage() {
  const { userId } = useParams()
  const id = useMemo(() => (userId ? decodeURIComponent(userId) : undefined), [userId])
  const { data, error, refresh } = useProfile(id)
  const { userId: currentUserId } = useCurrentUser()
  const isOwner = currentUserId != null && id != null && String(currentUserId) === String(id)
  const ownerId = isOwner ? currentUserId! : null
  const [profileDraft, setProfileDraft] = useState<ProfileResponse | null>(null)

  useEffect(() => {
    if (!data) return
    setProfileDraft((current) => {
      if (!current || current.userId !== data.userId) return data
      return { ...current, ...data }
    })
  }, [data])

  const profile = profileDraft ?? data;
  const posts = profile?.posts ?? [];

  const errorMessage =
    error instanceof Error ? error.message : error ? String(error) : null;

  return (
    <div className="profile u-hide-scroll">
      <HeroSection profile={profile ?? undefined} />

      <div className="profile__sheet">
        <div className="u-glass profile__card">
          <div className="u-stack">
            <div style={{ fontSize: 'var(--fs-4)', fontWeight: 650 }}>About</div>
            <div className="u-subtitle u-clamp-3">{profile?.bio ?? 'No bio yet.'}</div>
          </div>
        </div>

        {ownerId && profile && (
          <ProfileInlineEditor
            userId={ownerId}
            profile={profile}
            onProfileChange={(patch) => {
              setProfileDraft((current) => {
                if (!current) return current
                const next = { ...current, ...patch }
                if (patch.birthdate !== undefined) {
                  next.age = toAge(patch.birthdate)
                }
                return next
              })
            }}
          />
        )}

        {ownerId && (
          <ProfileMediaManager
            userId={ownerId}
            avatarUrl={profile?.avatarUrl ?? null}
            heroUrl={profile?.heroUrl ?? null}
            onUpdated={refresh}
          />
        )}
        {ownerId && <PostComposer onPosted={refresh} />}

        {ownerId && (
          <ProfilePostList
            posts={posts}
            onPostUpdate={(postId, patch) => {
              setProfileDraft((current) => {
                if (!current) return current
                return {
                  ...current,
                  posts: (current.posts ?? []).map((post) =>
                    String(post.id) === String(postId) ? { ...post, ...patch } : post
                  )
                }
              })
            }}
          />
        )}

        <ProfileMediaRail items={profile?.media ?? []} />
        <ProfileActions userId={profile?.userId ?? id ?? '0'} />

        {errorMessage && (
          <div className="u-glass u-pad-4" style={{ borderRadius: 'var(--r-4)' }}>
            <div style={{ fontSize: 'var(--fs-3)' }}>Error</div>
            <div className="u-muted u-mt-2" style={{ fontSize: 'var(--fs-2)' }}>
              {errorMessage}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
