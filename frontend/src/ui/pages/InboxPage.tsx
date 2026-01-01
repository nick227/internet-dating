import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { useCurrentUser } from '../../core/auth/useCurrentUser'
import { getErrorMessage } from '../../core/utils/errors'
import { idsEqual } from '../../core/utils/ids'
import { useInboxViewModel } from '../inbox/useInboxViewModel'
import { InboxItem } from '../inbox/InboxItem'
import { FullScreenModal } from '../ui/FullScreenModal'

const LOAD_MORE_ROOT_MARGIN = '200px' // Prefetch before the user reaches the end.
const LOAD_MORE_THRESHOLD = 0.1 // Trigger when the sentinel is minimally visible.

export function InboxPage() {
  const nav = useNavigate()
  const { conversations, loading, loadingMore, error, refresh, loadMore, nextCursorId } =
    useInboxViewModel()
  const { userId } = useCurrentUser()
  const [actionError, setActionError] = useState<string | null>(null)
  const [processing, setProcessing] = useState<Record<string, boolean>>({})
  const [deleteCandidate, setDeleteCandidate] = useState<{
    conversationId: string
    name: string
  } | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!loadMoreRef.current || !nextCursorId || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting) && !loadingMore) {
          loadMore()
        }
      },
      { root: null, rootMargin: LOAD_MORE_ROOT_MARGIN, threshold: LOAD_MORE_THRESHOLD }
    )
    observer.observe(loadMoreRef.current)
    return () => observer.disconnect()
  }, [loadMore, loadingMore, nextCursorId])

  const setProcessingState = (key: string, value: boolean) => {
    setProcessing(prev => {
      if (value) return { ...prev, [key]: true }
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const runAction = async ({
    key,
    action,
    errorMessage,
  }: {
    key: string
    action: () => Promise<void>
    errorMessage: string
  }) => {
    if (processing[key]) return
    setProcessingState(key, true)
    setActionError(null)
    try {
      await action()
      setActionError(null)
      refresh()
    } catch (err) {
      setActionError(getErrorMessage(err, errorMessage))
    } finally {
      setProcessingState(key, false)
    }
  }

  const canRespondToFollowRequest = (row: (typeof conversations)[number]) => {
    if (!userId) return false
    if (!row.followRequest?.id) return false
    if (row.followRequest.status !== 'PENDING') return false
    if (!row.lastIsSystem) return false
    if (!row.lastSenderId) return false
    return !idsEqual(userId, row.lastSenderId)
  }

  const handleApprove = async (requestId: string) => {
    await runAction({
      key: `request:${requestId}`,
      action: async () => {
        await api.approveFollowRequest(requestId)
      },
      errorMessage: 'Failed to approve request',
    })
  }

  const handleDeny = async (requestId: string) => {
    await runAction({
      key: `request:${requestId}`,
      action: async () => {
        await api.denyFollowRequest(requestId)
      },
      errorMessage: 'Failed to deny request',
    })
  }

  const handleDeleteThread = (conversationId: string, name: string) => {
    if (!conversationId) return
    setDeleteCandidate({ conversationId, name })
  }

  const confirmDeleteThread = async () => {
    if (!deleteCandidate) return
    const { conversationId } = deleteCandidate
    await runAction({
      key: `conversation:${conversationId}`,
      action: async () => {
        await api.messaging.deleteConversation(conversationId)
      },
      errorMessage: 'Failed to delete conversation',
    })
    setDeleteCandidate(null)
  }

  return (
    <div className="inbox u-hide-scroll">
      <div className="inbox__pad">
        <div className="u-row-between">
          <div className="u-title">Inbox</div>
          <button
            className="actionBtn actionBtn--rate"
            type="button"
            onClick={refresh}
            disabled={loading}
            aria-label="Refresh inbox"
          >
            Refresh
          </button>
        </div>

        {loading && (
          <div className="u-muted u-mt-4" role="status" aria-live="polite">
            Loading conversations...
          </div>
        )}

        {!loading && actionError && (
          <div className="inboxState inboxState--error" role="alert">
            <div>Inbox action failed</div>
            <div className="u-muted">{actionError}</div>
          </div>
        )}

        {!loading && error && (
          <div className="inboxState inboxState--error" role="alert">
            <div>Inbox error</div>
            <div className="u-muted">{String(error)}</div>
          </div>
        )}

        {!loading && !error && conversations.length === 0 && (
          <div className="inboxState" role="status" aria-live="polite">
            <div>No conversations yet</div>
            <div className="u-muted">Start swiping to get matches and new chats.</div>
          </div>
        )}

        <div className="inbox__list u-mt-4" role="list" aria-label="Inbox conversations" aria-busy={loading || loadingMore}>
          {conversations.map(m => (
            <InboxItem
              key={m.id}
              {...m}
              canRespond={canRespondToFollowRequest(m)}
              busy={Boolean(
                (m.followRequest?.id && processing[`request:${m.followRequest.id}`]) ||
                processing[`conversation:${m.conversationId}`]
              )}
              isFromMe={Boolean(userId && idsEqual(userId, m.lastSenderId))}
              isSystem={m.lastIsSystem}
              onApprove={handleApprove}
              onDeny={handleDeny}
              onDeleteThread={handleDeleteThread}
              onOpen={() => nav(`/inbox/${encodeURIComponent(m.conversationId)}`)}
              onOpenProfile={() => {
                if (!m.profileId) return
                nav(`/profiles/${encodeURIComponent(m.profileId)}`)
              }}
            />
          ))}
        </div>

        {Boolean(nextCursorId) && (
          <div className="inbox__loadMore" ref={loadMoreRef} role="status" aria-live="polite">
            {loadingMore ? 'Loading more...' : 'Scroll to load more'}
          </div>
        )}
      </div>

      <FullScreenModal
        open={Boolean(deleteCandidate)}
        onClose={() => setDeleteCandidate(null)}
        title="Delete thread?"
        subtitle={deleteCandidate ? `This only removes the thread with ${deleteCandidate.name} from your inbox.` : undefined}
        showCloseButton={false}
      >
        <div className="u-col u-gap-3">
          <button className="actionBtn" type="button" onClick={() => setDeleteCandidate(null)}>
            Cancel
          </button>
          <button
            className="actionBtn actionBtn--nope"
            type="button"
            onClick={confirmDeleteThread}
            disabled={Boolean(
              deleteCandidate && processing[`conversation:${deleteCandidate.conversationId}`]
            )}
          >
            Delete thread
          </button>
        </div>
      </FullScreenModal>
    </div>
  )
}
