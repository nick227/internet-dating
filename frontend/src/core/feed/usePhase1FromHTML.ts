import { useMemo } from 'react'

const DEBUG = Boolean(import.meta.env?.DEV)

const isDebugEnabled = () => {
  if (!DEBUG || typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem('debug:feed') === '1'
  } catch {
    return false
  }
}

const debugLog = (...args: unknown[]) => {
  if (isDebugEnabled()) {
    console.log(...args)
  }
}

const debugError = (...args: unknown[]) => {
  if (isDebugEnabled()) {
    console.error(...args)
  }
}

/**
 * Extract Phase-1 feed data from inline HTML script tag
 * Edge Trick: Coalesce API + HTML on First Load
 * 
 * For logged-in users, HTML response embeds Phase-1 feed JSON inline
 * No initial /api/feed?lite=1 fetch at all
 * 
 * Pattern: <script type="application/json" id="phase1-feed">{...}</script>
 * Browser parses HTML → data is already there
 * This removes one full RTT
 */
export function usePhase1FromHTML(): { data: unknown | null; found: boolean } {
  return useMemo(() => {
    if (typeof document === 'undefined') {
      debugLog('[DEBUG] usePhase1FromHTML: SSR - no document')
      return { data: null, found: false }
    }

    try {
      const script = document.getElementById('phase1-feed')
      if (!script || script.tagName !== 'SCRIPT') {
        debugLog('[DEBUG] usePhase1FromHTML: Script tag not found')
        return { data: null, found: false }
      }

      const text = script.textContent
      if (!text) {
        debugLog('[DEBUG] usePhase1FromHTML: Script tag has no text content')
        return { data: null, found: false }
      }

      // Parse JSON - but don't block if it fails
      const data = JSON.parse(text)
      debugLog('[DEBUG] usePhase1FromHTML: Found inline Phase-1 data', {
        hasItems: Array.isArray((data as any)?.items),
      })
      return { data, found: true }
    } catch (e) {
      // If parsing fails, fall back to API fetch
      debugError('[DEBUG] usePhase1FromHTML: JSON parse error', { error: e })
      return { data: null, found: false }
    }
  }, [])
}
