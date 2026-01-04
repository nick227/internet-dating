import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../../api/client'
import { useCurrentUser } from '../../../core/auth/useCurrentUser'
import { idsEqual } from '../../../core/utils/ids'
import { useInboxViewModel } from '../../inbox/useInboxViewModel'
import { ConnectionRow, type ConnectionRowAction } from '../../connections/ConnectionRow'
import { FullScreenModal } from '../../ui/FullScreenModal'
import type { CountRegister, DrawerLockRegister, HeaderRegister } from './connectionTypes'
import { formatConnectionTimestamp } from './formatConnectionTimestamp'
import { LOADING_COUNT, readyCount } from './sectionsConfig'
import { useAsyncAction } from './useAsyncAction'

type DeleteCandidate = {
  conversationId: string
  name: string
}

export function InboxSection({
  registerHeader,
  registerCount,
  registerDrawerLock,
}: {
  registerHeader: HeaderRegister
  registerCount: CountRegister
  registerDrawerLock: DrawerLockRegister
}) {
  const nav = useNavigate()
  const { userId } = useCurrentUser()
  const { conversations, loading, loadingMore, error, refresh, loadMore, nextCursorId } =
    useInboxViewModel()
  const { processing, actionError, runAction, clearActionError } = useAsyncAction()
  const [deleteCandidate, setDeleteCandidate] = useState<DeleteCandidate | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadingMoreRef = useRef(false)

  useEffect(() => {
    loadingMoreRef.current = loadingMore
  }, [loadingMore])

  const refreshWithReset = useCallback(() => {
    clearActionError()
    if (loading) return
    refresh()
  }, [clearActionError, loading, refresh])

  useLayoutEffect(() => {
    registerHeader('inbox', { onRefresh: refreshWithReset, refreshDisabled: loading })
  }, [registerHeader, refreshWithReset, loading])

  useLayoutEffect(() => {
    if (loading || error) {
      registerCount('inbox', LOADING_COUNT)
      return
    }
    registerCount('inbox', readyCount(conversations.length))
  }, [registerCount, conversations.length, error, loading])

  useLayoutEffect(() => {
    registerDrawerLock(Boolean(deleteCandidate))
  }, [registerDrawerLock, deleteCandidate])

  useEffect(() => {
    return () => registerDrawerLock(false)
  }, [registerDrawerLock])

  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }

    if (!loadMoreRef.current || !nextCursorId || typeof IntersectionObserver === 'undefined') {
      return
    }

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting) && !loadingMoreRef.current) {
          loadMore()
        }
      },
      { root: null, rootMargin: '200px', threshold: 0.1 }
    )

    observer.observe(loadMoreRef.current)
    observerRef.current = observer

    return () => {
      observer.disconnect()
      if (observerRef.current === observer) {
        observerRef.current = null
      }
    }
  }, [loadMore, nextCursorId])

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
      onSuccess: () => {
        setDeleteCandidate(null)
        refreshWithReset()
      },
    })
  }

  const errorMessage = actionError ?? (error ? String(error) : null)
  const errorTitle = actionError ? 'Inbox action failed' : 'Inbox error'
  const showSkeleton = loading && conversations.length === 0 && !errorMessage

  return (
    <div>
      {!showSkeleton && loading && (
        <div className="u-muted u-mt-4" role="status" aria-live="polite">
          Loading conversations...
        </div>
      )}

      {!loading && errorMessage && (
        <div className="inboxState inboxState--error" role="alert">
          <div>{errorTitle}</div>
          <div className="u-muted">{errorMessage}</div>
          <button className="actionBtn" type="button" onClick={refreshWithReset}>
            Retry
          </button>
        </div>
      )}

      {!loading && !errorMessage && conversations.length === 0 && (
        <div className="inboxState" role="status" aria-live="polite">
          <div>No conversations yet</div>
          <div className="u-muted">Start swiping to get matches and new chats.</div>
        </div>
      )}

      {showSkeleton ? (
        <div className="inbox__list u-mt-4" role="status" aria-live="polite" aria-busy="true">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="inboxItem inboxItem--skeleton">
              <div className="inboxItem__skeletonAvatar" />
              <div className="inboxItem__skeletonLines">
                <div className="inboxItem__skeletonLine inboxItem__skeletonLine--long" />
                <div className="inboxItem__skeletonLine inboxItem__skeletonLine--short" />
              </div>
              <div className="inboxItem__skeletonBadge" />
            </div>
          ))}
        </div>
      ) : (
        <div
          className="inbox__list u-mt-4"
          role="list"
          aria-label="Inbox conversations"
          aria-busy={loading || loadingMore}
        >
          {conversations.map(row => {
            const preview = row.lastBody || 'Say hello'
            const isFromMe = Boolean(userId && idsEqual(userId, row.lastSenderId))
            const subtitle = isFromMe ? `You: ${preview}` : preview
            const onOpenProfile = row.profileId
              ? () => nav(`/profiles/${encodeURIComponent(row.profileId)}`)
              : undefined
            const processingKey = `conversation:${row.conversationId}`
            const isDeleting = Boolean(processing[processingKey])

            const actions: ConnectionRowAction[] = [
              {
                label: isDeleting ? 'Deleting...' : 'Delete',
                variant: 'danger',
                onClick: () => {
                  if (isDeleting) return
                  handleDeleteThread(row.conversationId, row.name)
                },
                disabled: isDeleting,
              },
            ]

            return (
              <ConnectionRow
                key={row.id}
                id={row.id}
                title={row.name}
                subtitle={subtitle}
                timestamp={formatConnectionTimestamp(row.timestamp)}
                badgeCount={row.unreadCount}
                avatarUrl={row.avatarUrl}
                profileId={row.profileId}
                emphasize={row.unreadCount > 0}
                actions={actions}
                onOpen={() => nav(`/connections/inbox/${encodeURIComponent(row.conversationId)}`)}
                onOpenProfile={onOpenProfile}
              />
            )
          })}
        </div>
      )}

      {Boolean(nextCursorId) && (
        <div className="inbox__loadMore" ref={loadMoreRef} role="status" aria-live="polite">
          {loadingMore ? 'Loading more...' : 'Scroll to load more'}
        </div>
      )}

      <FullScreenModal
        open={Boolean(deleteCandidate)}
        onClose={() => setDeleteCandidate(null)}
        title="Delete thread?"
        subtitle={
          deleteCandidate
            ? `This only removes the thread with ${deleteCandidate.name} from your inbox.`
            : undefined
        }
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
            {deleteCandidate && processing[`conversation:${deleteCandidate.conversationId}`]
              ? 'Deleting...'
              : 'Delete thread'}
          </button>
        </div>
      </FullScreenModal>
    </div>
  )
}
