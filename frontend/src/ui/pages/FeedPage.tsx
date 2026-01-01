import { useEffect } from 'react'
import { River } from '../river/River'
import { useFeedSync } from '../../core/feed/useFeedSync'
import { useFeedPerformance } from '../../core/feed/useFeedPerformance'

const DEBUG = Boolean(import.meta.env?.DEV)

export function FeedPage() {
  if (DEBUG) {
    console.log('[DEBUG] FeedPage: Component rendering')
  }
  
  // Initialize feed sync service (handles seen batch + negative actions)
  useFeedSync()

  // Initialize performance monitoring
  useFeedPerformance()

  useEffect(() => {
    if (DEBUG) {
      console.log('[DEBUG] FeedPage: Mounted')
    }
    return () => {
      if (DEBUG) {
        console.log('[DEBUG] FeedPage: Unmounting')
      }
    }
  }, [])

  if (DEBUG) {
    console.log('[DEBUG] FeedPage: About to render River component')
  }
  return <River />
}
