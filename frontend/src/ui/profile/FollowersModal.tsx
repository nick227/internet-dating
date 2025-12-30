import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { Avatar } from '../ui/Avatar'
import { useCurrentUser } from '../../core/auth/useCurrentUser'
import { getErrorMessage } from '../../core/utils/errors'
import { idsEqual } from '../../core/utils/ids'
import { FullScreenModal } from '../ui/FullScreenModal'
// eslint-disable-next-line no-restricted-imports
import type { ApiFollowerItem } from '../../api/contracts'

type FollowerItem = ApiFollowerItem

type FollowersModalProps = {
  open: boolean
  userId: string
  onClose: () => void
}

export function FollowersModal({ open, userId, onClose }: FollowersModalProps) {
  const { userId: currentUserId } = useCurrentUser()
  const [activeTab, setActiveTab] = useState<'followers' | 'following'>('followers')
  const [followers, setFollowers] = useState<FollowerItem[]>([])
  const [following, setFollowing] = useState<FollowerItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return

    const loadData = async () => {
      setLoading(true)
      setError(null)
      try {
        const [followersRes, followingRes] = await Promise.all([
          api.followers(userId),
          api.following(userId),
        ])
        setFollowers(followersRes.followers)
        setFollowing(followingRes.following)
      } catch (err) {
        setError(getErrorMessage(err, 'Failed to load'))
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [open, userId])

  const handleApprove = async (requestId: string) => {
    if (processing.has(requestId)) return
    setProcessing(prev => new Set(prev).add(requestId))
    try {
      await api.approveFollowRequest(requestId)
      setFollowers(prev =>
        prev.map(f => (f.requestId === requestId ? { ...f, status: 'GRANTED' as const } : f))
      )
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to approve'))
    } finally {
      setProcessing(prev => {
        const next = new Set(prev)
        next.delete(requestId)
        return next
      })
    }
  }

  const handleDeny = async (requestId: string) => {
    if (processing.has(requestId)) return
    setProcessing(prev => new Set(prev).add(requestId))
    try {
      await api.denyFollowRequest(requestId)
      setFollowers(prev =>
        prev.map(f => (f.requestId === requestId ? { ...f, status: 'DENIED' as const } : f))
      )
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to deny'))
    } finally {
      setProcessing(prev => {
        const next = new Set(prev)
        next.delete(requestId)
        return next
      })
    }
  }

  const isOwner = currentUserId != null && idsEqual(currentUserId, userId)
  const items = activeTab === 'followers' ? followers : following
  const pendingFollowers = followers.filter(f => f.status === 'PENDING')

  return (
    <FullScreenModal
      open={open}
      onClose={onClose}
      title="Followers"
      subtitle={isOwner ? 'Manage your followers and following' : 'View followers'}
    >
      {isOwner && (
        <div className="fullScreenModal__tabRow u-row u-gap-3">
          <button
            className={`topBar__btn fullScreenModal__tabBtn ${activeTab === 'followers' ? 'topBar__btn--primary' : ''}`}
            type="button"
            onClick={() => setActiveTab('followers')}
          >
            Followers ({followers.length})
            {pendingFollowers.length > 0 && (
              <span className="fullScreenModal__pendingBadge">
                • {pendingFollowers.length} pending
              </span>
            )}
          </button>
          <button
            className={`topBar__btn fullScreenModal__tabBtn ${activeTab === 'following' ? 'topBar__btn--primary' : ''}`}
            type="button"
            onClick={() => setActiveTab('following')}
          >
            Following ({following.length})
          </button>
        </div>
      )}

      {error && <div className="profile__error fullScreenModal__error">{error}</div>}

      {loading && <div className="u-muted">Loading...</div>}

      {!loading && items.length === 0 && (
        <div className="u-muted fullScreenModal__empty">
          {activeTab === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="u-stack u-gap-2" data-scrollable>
          {items.map(item => (
            <div key={item.requestId} className="u-glass fullScreenModal__item">
              <Avatar name={item.name} size="md" src={item.avatarUrl} />
              <div className="u-stack u-gap-1 fullScreenModal__itemContent">
                <div className="fullScreenModal__itemName">{item.name}</div>
                <div className="u-muted fullScreenModal__itemStatus">
                  {item.status === 'PENDING' && 'Request pending'}
                  {item.status === 'GRANTED' && 'Following'}
                  {item.status === 'DENIED' && 'Request denied'}
                </div>
              </div>
              {isOwner && activeTab === 'followers' && item.status === 'PENDING' && (
                <div className="u-row u-gap-2 fullScreenModal__itemActions">
                  <button
                    className="topBar__btn topBar__btn--primary fullScreenModal__itemActionBtn"
                    type="button"
                    onClick={() => handleApprove(item.requestId)}
                    disabled={processing.has(item.requestId)}
                  >
                    Approve
                  </button>
                  <button
                    className="topBar__btn fullScreenModal__itemActionBtn"
                    type="button"
                    onClick={() => handleDeny(item.requestId)}
                    disabled={processing.has(item.requestId)}
                  >
                    Deny
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </FullScreenModal>
  )
}
