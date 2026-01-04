import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ErrorBoundary } from '../shell/ErrorBoundary'
import {
  CORE_SECTIONS,
  DEFAULT_COUNTS,
  EXTRA_SECTIONS,
  LOADING_COUNT,
  getSectionLabel,
  isSectionId,
  type CountState,
  type SectionCounts,
  type SectionId,
} from './sections/sectionsConfig'
import type {
  CountRegister,
  CountsInvalidator,
  DrawerLockRegister,
  HeaderRegister,
  HeaderState,
} from './sections/connectionTypes'
import { FollowSection } from './sections/FollowSection'
import { InboxSection } from './sections/InboxSection'
import { MatchesSection, LikesSection } from './sections/MatchesLikesSection'
import { PlaceholderSection } from './sections/PlaceholderSection'

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

const DRAWER_STORAGE_KEY = 'connections.drawer.open'

function loadDrawerState(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const raw = window.localStorage.getItem(DRAWER_STORAGE_KEY)
    return raw === 'true'
  } catch {
    return false
  }
}

function saveDrawerState(open: boolean) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DRAWER_STORAGE_KEY, String(open))
  } catch {
    // ignore storage failures
  }
}

const isCountStateEqual = (left: CountState, right: CountState) => {
  if (left.status !== right.status) return false
  if (left.status === 'ready' && right.status === 'ready') {
    return left.value === right.value
  }
  return true
}

export function ConnectionsPage() {
  const nav = useNavigate()
  const { section } = useParams<{ section?: SectionId }>()
  const [menuOpen, setMenuOpen] = useState(loadDrawerState)
  const [drawerLocked, setDrawerLocked] = useState(false)
  const drawerRef = useRef<HTMLDivElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const activeSection: SectionId = isSectionId(section) ? section : 'inbox'
  const sectionLabel = getSectionLabel(activeSection)
  const activeSectionRef = useRef(activeSection)
  const drawerLockedRef = useRef(drawerLocked)
  const [counts, setCounts] = useState<SectionCounts>(DEFAULT_COUNTS)

  const [header, setHeader] = useState<HeaderState>({
    title: sectionLabel,
    onRefresh: null,
    refreshDisabled: true,
  })

  useEffect(() => {
    activeSectionRef.current = activeSection
  }, [activeSection])

  useEffect(() => {
    drawerLockedRef.current = drawerLocked
  }, [drawerLocked])

  useEffect(() => {
    saveDrawerState(menuOpen)
  }, [menuOpen])

  useEffect(() => {
    if (!section || !isSectionId(section)) {
      nav('/connections/inbox', { replace: true })
    }
  }, [nav, section])

  useEffect(() => {
    setHeader({
      title: sectionLabel,
      onRefresh: null,
      refreshDisabled: true,
    })
  }, [sectionLabel])


  useEffect(() => {
    if (!menuOpen) return
    previousFocusRef.current = document.activeElement as HTMLElement | null

    const drawer = drawerRef.current
    const getFocusable = () => {
      if (!drawer) return []
      return Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        element => !element.hasAttribute('disabled')
      )
    }

    const focusFirst = () => {
      const focusable = getFocusable()
      if (focusable.length > 0) {
        focusable[0]?.focus()
        return
      }
      drawer?.focus()
    }

    focusFirst()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!drawerLockedRef.current) {
          setMenuOpen(false)
        }
        return
      }
      if (event.key !== 'Tab') return

      const focusable = getFocusable()
      if (focusable.length === 0) {
        event.preventDefault()
        drawer?.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target as Node | null
      if (!drawer || !target) return
      if (drawer.contains(target)) return
      focusFirst()
    }

    drawer?.addEventListener('keydown', handleKeyDown)
    document.addEventListener('focusin', handleFocusIn, true)
    return () => {
      drawer?.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('focusin', handleFocusIn, true)
      const previousFocus = previousFocusRef.current
      if (previousFocus && document.contains(previousFocus)) {
        previousFocus.focus()
      }
    }
  }, [menuOpen])

  const registerHeader = useCallback<HeaderRegister>(
    (sectionId, partial) => {
      if (sectionId !== activeSectionRef.current) return
      setHeader(prev => ({ ...prev, ...partial }))
    },
    [setHeader]
  )

  // Sections own their counts while mounted; the parent only stores updates.
  const registerCount = useCallback<CountRegister>((sectionId, count) => {
    setCounts(prev => {
      const current = prev[sectionId]
      if (isCountStateEqual(current, count)) return prev
      return { ...prev, [sectionId]: count }
    })
  }, [])

  const invalidateCounts = useCallback<CountsInvalidator>(sections => {
    if (sections.length === 0) {
      if (import.meta.env?.DEV) {
        console.warn('ConnectionsPage: invalidateCounts called with an empty section list.')
      }
      return
    }
    setCounts(prev => {
      let changed = false
      const next = { ...prev }
      for (const sectionId of sections) {
        if (!Object.prototype.hasOwnProperty.call(next, sectionId)) continue
        if (!isCountStateEqual(next[sectionId], LOADING_COUNT)) {
          next[sectionId] = LOADING_COUNT
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [])

  const registerDrawerLock = useCallback<DrawerLockRegister>(locked => {
    setDrawerLocked(prev => (prev === locked ? prev : locked))
  }, [])

  const handleSelectSection = (next: SectionId) => {
    if (drawerLocked) return
    nav(`/connections/${next}`)
  }

  const handleRefresh = () => {
    header.onRefresh?.()
  }

  const sectionView = useMemo(() => {
    switch (activeSection) {
      case 'inbox':
        return (
          <InboxSection
            registerHeader={registerHeader}
            registerCount={registerCount}
            registerDrawerLock={registerDrawerLock}
          />
        )
      case 'matches':
        return <MatchesSection registerHeader={registerHeader} registerCount={registerCount} />
      case 'followers':
        return (
          <FollowSection
            registerHeader={registerHeader}
            registerCount={registerCount}
            invalidateCounts={invalidateCounts}
            mode="followers"
          />
        )
      case 'following':
        return (
          <FollowSection
            registerHeader={registerHeader}
            registerCount={registerCount}
            invalidateCounts={invalidateCounts}
            mode="following"
          />
        )
      case 'likes':
        return <LikesSection registerHeader={registerHeader} registerCount={registerCount} />
      case 'drafts':
        return (
          <PlaceholderSection
            registerHeader={registerHeader}
            registerCount={registerCount}
            sectionId="drafts"
            title="Drafts"
            message="No drafts."
            detail="Drafts are a phase 2 mailbox filter."
          />
        )
      case 'sent':
        return (
          <PlaceholderSection
            registerHeader={registerHeader}
            registerCount={registerCount}
            sectionId="sent"
            title="Sent"
            message="No sent items."
            detail="Sent is a phase 2 mailbox filter."
          />
        )
      case 'trash':
        return (
          <PlaceholderSection
            registerHeader={registerHeader}
            registerCount={registerCount}
            sectionId="trash"
            title="Trash"
            message="Trash is empty."
            detail="Trash is a phase 2 mailbox filter."
          />
        )
      default:
        return null
    }
  }, [activeSection, invalidateCounts, registerCount, registerDrawerLock, registerHeader])

  return (
    <div className="connections u-hide-scroll">
      <div className="connections__pad">
        <div className="connections__header">
          <button
            className="connections__menuBtn"
            type="button"
            onClick={() => {
              if (!drawerLocked) setMenuOpen(prev => !prev)
            }}
            aria-label={menuOpen ? 'Close connections menu' : 'Open connections menu'}
            aria-expanded={menuOpen}
            aria-controls="connections-menu"
            disabled={drawerLocked}
          >
            <span className="connections__menuIcon" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
          <div className="connections__title">{header.title}</div>
          <button
            className="actionBtn actionBtn--rate"
            type="button"
            onClick={handleRefresh}
            disabled={header.refreshDisabled || !header.onRefresh}
          >
            Refresh
          </button>
        </div>
        <ErrorBoundary
          fallback={
            <div className="inboxState inboxState--error" role="alert">
              <div>Connections section failed</div>
              <div className="u-muted">Try switching sections or refresh the page.</div>
            </div>
          }
        >
          {sectionView}
        </ErrorBoundary>
      </div>

      <div
        id="connections-menu"
        ref={drawerRef}
        className={`connections__drawer${menuOpen ? ' connections__drawer--open' : ''}`}
        role="dialog"
        aria-hidden={menuOpen ? undefined : true}
        aria-modal={menuOpen ? true : undefined}
        aria-labelledby="connections-menu-title"
        tabIndex={-1}
      >
        <div className="connections__drawerTitle" id="connections-menu-title">
          Connections
        </div>
        <div className="connections__navGroup">
          <div className="connections__navLabel">Core</div>
          <div className="connections__navList">
            {CORE_SECTIONS.map(item => {
              const countState = counts[item.id]
              const countLabel = countState.status === 'ready' ? String(countState.value) : '--'
              return (
                <button
                  key={item.id}
                  className={`connections__navItem${activeSection === item.id ? ' connections__navItem--active' : ''}`}
                  type="button"
                  onClick={() => handleSelectSection(item.id)}
                  aria-current={activeSection === item.id ? 'page' : undefined}
                >
                  <span className="connections__navItemLabel">{item.label}</span>
                  <span
                    className="connections__navItemCount"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    {countLabel}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
        <div className="connections__navGroup">
          <div className="connections__navLabel">Messages</div>
          <div className="connections__navList">
            {EXTRA_SECTIONS.map(item => {
              const countState = counts[item.id]
              const countLabel = countState.status === 'ready' ? String(countState.value) : '--'
              return (
                <button
                  key={item.id}
                  className={`connections__navItem${activeSection === item.id ? ' connections__navItem--active' : ''}`}
                  type="button"
                  onClick={() => handleSelectSection(item.id)}
                  aria-current={activeSection === item.id ? 'page' : undefined}
                >
                  <span className="connections__navItemLabel">{item.label}</span>
                  <span
                    className="connections__navItemCount"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    {countLabel}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
