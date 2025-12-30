import { useEffect } from 'react'
import { River } from '../river/River'
import { useFeedSync } from '../../core/feed/useFeedSync'
import { useFeedPerformance } from '../../core/feed/useFeedPerformance'

export function FeedPage() {
  console.log('[DEBUG] FeedPage: Component rendering')
  
  // Initialize feed sync service (handles seen batch + negative actions)
  useFeedSync()

  // Initialize performance monitoring
  useFeedPerformance()

  useEffect(() => {
    console.log('[DEBUG] FeedPage: Mounted')
    return () => {
      console.log('[DEBUG] FeedPage: Unmounting')
    }
  }, [])

  console.log('[DEBUG] FeedPage: About to render River component')
  return <River />
}
