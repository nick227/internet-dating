import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../core/auth/useAuth'
import { useMatches } from '../../core/matches/useMatches'
import { prettyIntent } from '../../core/format/prettyIntent'
import { Avatar } from '../ui/Avatar'

export function MatchesPage() {
  const nav = useNavigate()
  const { userId } = useAuth()
  const { data, loading, error, refresh } = useMatches()
  const matches = useMemo(() => data?.matches ?? [], [data?.matches])

  return (
    <div className="matches u-hide-scroll">
      <div className="matches__pad">
        <div className="u-row-between">
          <div className="u-title">Matches</div>
          <button className="actionBtn actionBtn--rate" type="button" onClick={refresh}>
            Refresh
          </button>
        </div>

        {loading && <div className="u-muted u-mt-4">Loading matches...</div>}

        {Boolean(error) && (
          <div className="u-glass u-pad-4 u-mt-4" style={{ borderRadius: 'var(--r-4)' }}>
            <div style={{ fontSize: 'var(--fs-3)' }}>Match error</div>
            <div className="u-muted u-mt-2" style={{ fontSize: 'var(--fs-2)' }}>
              {String(error)}
            </div>
          </div>
        )}

        {!loading && !error && matches.length === 0 && (
          <div className="u-glass u-pad-4 u-mt-4" style={{ borderRadius: 'var(--r-4)' }}>
            <div style={{ fontSize: 'var(--fs-3)' }}>No matches yet</div>
            <div className="u-muted u-mt-2" style={{ fontSize: 'var(--fs-2)' }}>
              Keep swiping to start new connections.
            </div>
          </div>
        )}

        <div className="matches__list u-mt-4">
          {matches.map(match => {
            const isA = String(match.userAId) === String(userId ?? '')
            const other = isA ? match.userB : match.userA
            const name = other.profile?.displayName ?? `User ${other.id}`
            const location = other.profile?.locationText
            const intent = other.profile?.intent ? prettyIntent(other.profile.intent) : null
            const avatarUrl = other.profile?.avatarUrl ?? null
            const canChat = Boolean(match.conversation?.id)

            return (
              <div key={String(match.id)} className="matchItem">
                <Avatar name={name} size="md" src={avatarUrl} />
                <div className="matchItem__main">
                  <div className="matchItem__title">
                    <span>{name}</span>
                    <span className="matchItem__time">{formatTime(match.updatedAt)}</span>
                  </div>
                  <div className="matchItem__meta">
                    {location && <span>{location}</span>}
                    {intent && <span>{intent}</span>}
                  </div>
                </div>
                <button
                  className="actionBtn actionBtn--like matchItem__cta"
                  type="button"
                  disabled={!canChat}
                  onClick={() => {
                    if (match.conversation?.id) {
                      nav(`/inbox/${encodeURIComponent(String(match.conversation.id))}`)
                    }
                  }}
                >
                  {canChat ? 'Chat' : 'Pending'}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function formatTime(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
