import { useEffect, useRef, useState } from 'react'
import { ProfileSearchCard } from './ProfileSearchCard'
import type { ProfileSearchResult } from '../../../core/profile/search/types'

interface Props {
  profiles: ProfileSearchResult[]
  loading: boolean
  hasMore: boolean
  onLoadMore: () => void
  isShowingRecommendations?: boolean
}

export function ProfileSearchResults({ profiles, loading, hasMore, onLoadMore, isShowingRecommendations = false }: Props) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [passedUserIds, setPassedUserIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!hasMore || loading) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onLoadMore()
        }
      },
      { threshold: 0.1 }
    )

    const sentinel = sentinelRef.current
    if (sentinel) {
      observer.observe(sentinel)
    }

    return () => {
      if (sentinel) {
        observer.unobserve(sentinel)
      }
    }
  }, [hasMore, loading, onLoadMore])

  const handlePass = (userId: string) => {
    setPassedUserIds(prev => new Set(prev).add(userId))
  }

  const visibleProfiles = profiles.filter(p => !passedUserIds.has(p.userId))

  if (visibleProfiles.length === 0 && !loading) {
    return (
      <div className="profile-search-results">
        <div className="profile-search-results__empty">
          {isShowingRecommendations ? (
            <p>No recommendations available at this time. Check back later or try using search filters to find profiles.</p>
          ) : (
            <p>No profiles found. Try adjusting your filters or search terms.</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="profile-search-results">
      <div className="profile-search-results__feed">
        {visibleProfiles.map(profile => (
          <ProfileSearchCard 
            key={profile.userId} 
            profile={profile}
            onPass={handlePass}
          />
        ))}
      </div>
      {hasMore && (
        <div ref={sentinelRef} className="profile-search-results__sentinel">
          {loading && <div className="profile-search-results__loading">Loading more...</div>}
        </div>
      )}
      {loading && profiles.length === 0 && (
        <div className="profile-search-results__loading">Searching...</div>
      )}
    </div>
  )
}
