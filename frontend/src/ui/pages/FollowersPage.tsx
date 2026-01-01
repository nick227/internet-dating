import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api/client'
import { Avatar } from '../ui/Avatar'
import { useCurrentUser } from '../../core/auth/useCurrentUser'
import { getErrorMessage } from '../../core/utils/errors'
// eslint-disable-next-line no-restricted-imports
import type { ApiFollowerItem } from '../../api/contracts'

type FollowerItem = ApiFollowerItem

export function FollowersPage() {
  const { userId, loading: userLoading } = useCurrentUser()
  const [activeTab, setActiveTab] = useState<'followers' | 'following'>('followers')
  const [followers, setFollowers] = useState<FollowerItem[]>([])
  const [following, setFollowing] = useState<FollowerItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState<Set<string>>(new Set())

  const loadData = useCallback(async () => {
    if (!userId) return
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
  }, [userId])

  useEffect(() => {
    if (userLoading || !userId) return
    loadData()
  }, [loadData, userLoading, userId])

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

  const handleCancel = async (requestId: string) => {
    if (processing.has(requestId)) return
    setProcessing(prev => new Set(prev).add(requestId))
    try {
      await api.cancelFollowRequest(requestId)
      setFollowing(prev =>
        prev.map(f => (f.requestId === requestId ? { ...f, status: 'CANCELED' as const } : f))
      )
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to cancel'))
    } finally {
      setProcessing(prev => {
        const next = new Set(prev)
        next.delete(requestId)
        return next
      })
    }
  }

  const handleRevoke = async (requestId: string) => {
    if (processing.has(requestId)) return
    setProcessing(prev => new Set(prev).add(requestId))
    try {
      await api.revokeFollowRequest(requestId)
      setFollowers(prev =>
        prev.map(f => (f.requestId === requestId ? { ...f, status: 'REVOKED' as const } : f))
      )
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to remove follower'))
    } finally {
      setProcessing(prev => {
        const next = new Set(prev)
        next.delete(requestId)
        return next
      })
    }
  }

  const isOwner = Boolean(userId)
  const items = activeTab === 'followers' ? followers : following
  const pendingFollowers = followers.filter(f => f.status === 'PENDING')
  const showEmpty = !userLoading && !loading && !error && items.length === 0

  return (
    <div className="followers u-hide-scroll">
      <div className="followers__pad">
        <div className="u-row-between">
          <div className="u-title">Followers</div>
          <button
            className="actionBtn actionBtn--rate"
            type="button"
            onClick={loadData}
            disabled={!userId || userLoading || loading}
          >
            Refresh
          </button>
        </div>

        {isOwner && (
          <div className="followers__tabRow">
            <button
              className={`topBar__btn followers__tabBtn ${activeTab === 'followers' ? 'topBar__btn--primary' : ''}`}
              type="button"
              onClick={() => setActiveTab('followers')}
            >
              Followers ({followers.length})
              {pendingFollowers.length > 0 && (
                <span className="followers__pendingBadge">
                  Pending: {pendingFollowers.length}
                </span>
              )}
            </button>
            <button
              className={`topBar__btn followers__tabBtn ${activeTab === 'following' ? 'topBar__btn--primary' : ''}`}
              type="button"
              onClick={() => setActiveTab('following')}
            >
              Following ({following.length})
            </button>
          </div>
        )}

        {userLoading && <div className="u-muted u-mt-4">Loading account...</div>}

        {loading && <div className="u-muted u-mt-4">Loading followers...</div>}

        {Boolean(error) && (
          <div className="u-glass u-pad-4 u-mt-4" style={{ borderRadius: 'var(--r-4)' }}>
            <div style={{ fontSize: 'var(--fs-3)' }}>Followers error</div>
            <div className="u-muted u-mt-2" style={{ fontSize: 'var(--fs-2)' }}>
              {error}
            </div>
          </div>
        )}

        {showEmpty && (
          <div className="u-glass u-pad-4 u-mt-4" style={{ borderRadius: 'var(--r-4)' }}>
            <div style={{ fontSize: 'var(--fs-3)' }}>
              {activeTab === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
            </div>
            <div className="u-muted u-mt-2" style={{ fontSize: 'var(--fs-2)' }}>
              {activeTab === 'followers'
                ? 'When someone follows you, they will show up here.'
                : 'Start exploring profiles to follow.'}
            </div>
          </div>
        )}

        <div className="followers__list u-mt-4">
          {items.map(item => (
            <div key={item.requestId} className="u-glass followers__item">
              <Avatar name={item.name} size="md" src={item.avatarUrl} profileId={String(item.userId)} />
              <div className="followers__itemContent">
                <div className="followers__itemName">{item.name}</div>
                <div className="followers__itemStatus">
                  {item.status === 'PENDING' && 'Request pending'}
                  {item.status === 'GRANTED' && 'Following'}
                  {item.status === 'DENIED' && 'Request denied'}
                  {item.status === 'CANCELED' && 'Request canceled'}
                  {item.status === 'REVOKED' && 'Removed'}
                </div>
              </div>
              {isOwner && activeTab === 'followers' && item.status === 'PENDING' && (
                <div className="followers__itemActions">
                  <button
                    className="topBar__btn topBar__btn--primary followers__itemActionBtn"
                    type="button"
                    onClick={() => handleApprove(item.requestId)}
                    disabled={processing.has(item.requestId)}
                  >
                    Approve
                  </button>
                  <button
                    className="topBar__btn followers__itemActionBtn"
                    type="button"
                    onClick={() => handleDeny(item.requestId)}
                    disabled={processing.has(item.requestId)}
                  >
                    Deny
                  </button>
                </div>
              )}
              {isOwner && activeTab === 'followers' && item.status === 'GRANTED' && (
                <div className="followers__itemActions">
                  <button
                    className="topBar__btn followers__itemActionBtn"
                    type="button"
                    onClick={() => handleRevoke(item.requestId)}
                    disabled={processing.has(item.requestId)}
                  >
                    Remove
                  </button>
                </div>
              )}
              {isOwner && activeTab === 'following' && item.status === 'PENDING' && (
                <div className="followers__itemActions">
                  <button
                    className="topBar__btn followers__itemActionBtn"
                    type="button"
                    onClick={() => handleCancel(item.requestId)}
                    disabled={processing.has(item.requestId)}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
