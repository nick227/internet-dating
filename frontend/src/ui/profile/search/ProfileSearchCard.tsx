import { useNavigate } from 'react-router-dom'
import { useLike } from '../../../core/actions/useLike'
import { useStoredReaction } from '../../../core/actions/useStoredReaction'
import type { ProfileSearchResult } from '../../../core/profile/search/types'
import { Avatar } from '../../ui/Avatar'
import { prettyIntent } from '../../../core/format/prettyIntent'

interface Props {
  profile: ProfileSearchResult
  onPass?: (userId: string) => void
}

export function ProfileSearchCard({ profile, onPass }: Props) {
  const navigate = useNavigate()
  const { send: sendLike, loading: likeLoading } = useLike()
  const { reaction, setReaction } = useStoredReaction(profile.userId)
  const isLiked = (profile.liked ?? false) || reaction === 'LIKE'

  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.profile-search-card__actions')) {
      return
    }
    navigate(`/profiles/${encodeURIComponent(profile.userId)}`)
  }

  const handlePass = (e: React.MouseEvent) => {
    e.stopPropagation()
    onPass?.(profile.userId)
  }

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (likeLoading) return
    const nextLiked = !isLiked
    setReaction(nextLiked ? 'LIKE' : null)
    try {
      await sendLike(profile.userId, nextLiked ? 'LIKE' : 'UNLIKE')
    } catch {
      setReaction(isLiked ? 'LIKE' : null)
    }
  }

  const getIntentClass = (intent: string) => {
    switch (intent) {
      case 'CASUAL':
      case 'LONG_TERM':
      case 'MARRIAGE':
        return 'profile-search-card__intent--dating'
      case 'FRIENDS':
        return 'profile-search-card__intent--friends'
      default:
        return 'profile-search-card__intent--network'
    }
  }

  return (
    <div className="profile-search-card" onClick={handleCardClick} role="button" tabIndex={0}>
      <div className="profile-search-card__content">
        <div className="profile-search-card__header">
          <div className="profile-search-card__photo">
            <Avatar 
              src={profile.avatarUrl} 
              name={profile.displayName || 'Anonymous'} 
              size="md"
            />
            {/* Online indicator would go here if available */}
          </div>
          <div className="profile-search-card__info">
            <div className="profile-search-card__name-age">
              {profile.displayName || 'Anonymous'}
              {profile.age && `, ${profile.age}`}
            </div>
            <div className="profile-search-card__meta-row">
              {profile.locationText && (
                <div className="profile-search-card__distance">
                  📍 {profile.locationText}
                </div>
              )}
              {profile.intent && (
                <div className={`profile-search-card__intent ${getIntentClass(profile.intent)}`}>
                  {prettyIntent(profile.intent)}
                </div>
              )}
            </div>
          </div>
        </div>

        {profile.bio && (
          <div className="profile-search-card__bio">
            {profile.bio}
          </div>
        )}

        {profile.matchReasons && profile.matchReasons.length > 0 && (
          <div className="profile-search-card__tags">
            {profile.matchReasons.map((reason, idx) => (
              <span key={idx} className="profile-search-card__tag">
                #{reason}
              </span>
            ))}
          </div>
        )}

        <div className="profile-search-card__actions">
          <button
            type="button"
            className="profile-search-card__action-btn"
            onClick={handlePass}
          >
            Pass
          </button>
          <button
            type="button"
            className={`profile-search-card__action-btn${isLiked ? ' profile-search-card__action-btn--active' : ''}`}
            onClick={handleLike}
            disabled={likeLoading}
          >
            Like 😘
          </button>
        </div>
      </div>
    </div>
  )
}
