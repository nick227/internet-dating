import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../../../api/client'
import { HttpError } from '../../../api/http'
import { useDebounce } from '../../hooks/useDebounce'
import { useAuth } from '../../auth/useAuth'
import type { ProfileSearchResult, SearchFilters } from './types'
import type { Gender, DatingIntent } from '../../../api/types'
import { serializeFiltersToURL, parseFiltersFromURL } from './adapter'

const VALID_GENDERS: Set<string> = new Set(['UNSPECIFIED', 'MALE', 'FEMALE', 'NONBINARY', 'OTHER'])
const VALID_INTENTS: Set<string> = new Set(['UNSPECIFIED', 'FRIENDS', 'CASUAL', 'LONG_TERM', 'MARRIAGE'])

function toGender(value: string): Gender {
  return VALID_GENDERS.has(value) ? (value as Gender) : 'UNSPECIFIED'
}

function toDatingIntent(value: string): DatingIntent {
  return VALID_INTENTS.has(value) ? (value as DatingIntent) : 'UNSPECIFIED'
}

function convertApiProfileToResult(profile: {
  userId: string
  displayName: string | null
  bio: string | null
  avatarUrl: string | null
  heroUrl: string | null
  locationText: string | null
  age: number | null
  gender: string
  intent: string
  liked?: boolean
  matchReasons?: string[]
}): ProfileSearchResult {
  return {
    userId: profile.userId,
    displayName: profile.displayName,
    bio: profile.bio,
    avatarUrl: profile.avatarUrl,
    heroUrl: profile.heroUrl,
    locationText: profile.locationText,
    age: profile.age,
    gender: toGender(profile.gender),
    intent: toDatingIntent(profile.intent),
    liked: profile.liked,
    matchReasons: profile.matchReasons,
  }
}

type SearchError = Error & { code?: string }

function toSearchError(err: unknown, fallback: string): SearchError {
  const error = new Error(fallback) as SearchError
  if (err instanceof HttpError) {
    const body = err.body as { code?: unknown; error?: unknown } | null
    if (body && typeof body === 'object' && 'code' in body && typeof body.code === 'string') {
      error.code = body.code
    }
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
      error.message = body.error
    } else if (err.message) {
      error.message = err.message
    }
  } else if (err instanceof Error && err.message) {
    error.message = err.message
  }
  return error
}

function shouldPromptForGeo(err: unknown, filters: SearchFilters): boolean {
  if (!filters.nearMe) return false
  if (!(err instanceof HttpError)) return false
  if (err.status !== 400) return false
  const body = err.body as { code?: unknown } | null
  return body?.code === 'LOCATION_REQUIRED'
}

async function trySaveDeviceLocation(userId: string | undefined): Promise<boolean> {
  if (!userId) return false
  if (typeof navigator === 'undefined' || !navigator.geolocation) return false

  const position = await new Promise<GeolocationPosition | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    )
  })

  if (!position) return false

  const lat = position.coords.latitude
  const lng = position.coords.longitude
  const resolved = await api.reverseGeocode({ lat, lng })
  await api.profileUpdate(userId, {
    locationText: resolved.locationText ?? null,
    lat,
    lng,
  })
  return true
}

export function useProfileSearch() {
  const location = useLocation()
  const navigate = useNavigate()
  const { userId, isAuthenticated, loading: authLoading } = useAuth()
  const [filters, setFilters] = useState<SearchFilters>(() => parseFiltersFromURL(location.search))
  const [results, setResults] = useState<ProfileSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const geoPromptedRef = useRef(false)
  
  // Sync filters with URL on mount/location change
  useEffect(() => {
    const urlFilters = parseFiltersFromURL(location.search)
    setFilters(urlFilters)
  }, [location.search])
  
  // Debounce URL updates to avoid excessive navigation
  const debouncedFilters = useDebounce(filters, 300)
  
  // Update URL when debounced filters change
  useEffect(() => {
    const params = serializeFiltersToURL(debouncedFilters)
    const newSearch = params.toString()
    const currentSearch = location.search.slice(1) // Remove leading ?
    if (newSearch !== currentSearch) {
      navigate(`?${newSearch}`, { replace: true })
    }
  }, [debouncedFilters, navigate, location.search])
  
  const search = useCallback(async (searchFilters: SearchFilters, append = false, allowGeoPrompt = true) => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    
    // Create new abort controller
    const abortController = new AbortController()
    abortControllerRef.current = abortController
    
    setLoading(true)
    setError(null)
    
    try {
      const response = await api.advancedSearch(searchFilters, abortController.signal)
      
      const convertedProfiles = response.profiles.map(convertApiProfileToResult)
      
      if (append) {
        setResults(prev => [...prev, ...convertedProfiles])
      } else {
        setResults(convertedProfiles)
      }
      
      setNextCursor(response.nextCursor)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return // Request was cancelled
      }
      if (allowGeoPrompt && shouldPromptForGeo(err, searchFilters) && !geoPromptedRef.current) {
        geoPromptedRef.current = true
        const saved = await trySaveDeviceLocation(userId)
        if (saved) {
          setError(toSearchError(err, 'Location saved. Near Me updates after the next index refresh.'))
          return
        }
      }
      // Handle auth errors - don't show error for 401, just clear results
      if (err instanceof HttpError && err.status === 401) {
        if (!append) {
          setResults([])
          setNextCursor(null)
          setError(null) // Clear error for auth failures
        }
        return
      }
      setError(toSearchError(err, 'Search failed'))
      if (!append) {
        setResults([])
        setNextCursor(null)
      }
    } finally {
      if (abortControllerRef.current === abortController) {
        setLoading(false)
        abortControllerRef.current = null
      }
    }
  }, [userId])
  
  const loadRecommendations = useCallback(async (append = false) => {
    // Don't call API if userId is not available
    if (!userId) {
      setResults([])
      setNextCursor(null)
      setLoading(false)
      setError(null)
      return
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    
    // Create new abort controller
    const abortController = new AbortController()
    abortControllerRef.current = abortController
    
    setLoading(true)
    setError(null)
    
    try {
      if (import.meta.env?.DEV) {
        console.debug('[ProfileSearch] Loading recommendations', { userId, append, limit: filters.limit || 20 })
      }
      const response = await api.getRecommendations(
        { 
          limit: filters.limit || 20,
          cursor: append ? nextCursor || undefined : undefined
        },
        abortController.signal
      )
      
      const convertedProfiles = response.profiles.map(convertApiProfileToResult)
      
      if (append) {
        setResults(prev => [...prev, ...convertedProfiles])
      } else {
        setResults(convertedProfiles)
      }
      
      setNextCursor(response.nextCursor)
      if (import.meta.env?.DEV) {
        console.debug('[ProfileSearch] Recommendations loaded', { 
          count: response.profiles.length, 
          hasMore: !!response.nextCursor,
          profiles: response.profiles.map(p => ({ userId: p.userId, displayName: p.displayName })),
          response: response
        })
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return // Request was cancelled
      }
      if (import.meta.env?.DEV) {
        console.error('[ProfileSearch] Recommendations error', { 
          error: err, 
          isHttpError: err instanceof HttpError,
          status: err instanceof HttpError ? err.status : undefined,
          message: err instanceof Error ? err.message : String(err)
        })
      }
      // Handle auth errors - don't show error for 401, just clear results
      if (err instanceof HttpError && err.status === 401) {
        if (!append) {
          setResults([])
          setNextCursor(null)
          setError(null) // Clear error for auth failures
        }
        return
      }
      setError(toSearchError(err, 'Failed to load recommendations'))
      if (!append) {
        setResults([])
        setNextCursor(null)
      }
    } finally {
      if (abortControllerRef.current === abortController) {
        setLoading(false)
        abortControllerRef.current = null
      }
    }
  }, [filters.limit, nextCursor, userId])
  
  // Auto-search when filters change (debounced)
  useEffect(() => {
    // Wait for auth to finish loading before making decisions
    if (authLoading) {
      setLoading(true)
      return
    }

    const hasAnyFilters = Object.keys(debouncedFilters).some(key => {
      if (key === 'cursor' || key === 'limit') return false // Ignore pagination params
      const value = debouncedFilters[key as keyof typeof debouncedFilters]
      if (Array.isArray(value)) return value.length > 0
      if (typeof value === 'object' && value !== null) {
        return Object.keys(value).length > 0
      }
      return value !== undefined && value !== null && value !== ''
    })

    if (hasAnyFilters) {
      // Use advanced search when filters are applied
      search(debouncedFilters)
    } else {
      // If auth finished loading but we don't have a userId, don't make recommendations calls
      if (!isAuthenticated || !userId) {
        setResults([])
        setNextCursor(null)
        setLoading(false)
        setError(null) // Clear any previous errors
        return
      }
      // Use recommendations when no filters and user is authenticated with valid userId
      // Add a small delay to ensure cookies are set after session load
      const timeoutId = setTimeout(() => {
        loadRecommendations()
      }, 0)
      
      return () => clearTimeout(timeoutId)
    }
  }, [debouncedFilters, search, loadRecommendations, isAuthenticated, userId, authLoading])
  
  const loadMore = useCallback(() => {
    if (!nextCursor || loading) return
    
    const hasAnyFilters = Object.keys(filters).some(key => {
      if (key === 'cursor' || key === 'limit') return false
      const value = filters[key as keyof typeof filters]
      if (Array.isArray(value)) return value.length > 0
      if (typeof value === 'object' && value !== null) {
        return Object.keys(value).length > 0
      }
      return value !== undefined && value !== null && value !== ''
    })
    
    if (hasAnyFilters) {
      search({ ...filters, cursor: nextCursor }, true)
    } else if (isAuthenticated && userId) {
      loadRecommendations(true)
    }
  }, [nextCursor, loading, filters, search, loadRecommendations, isAuthenticated, userId])
  
  const updateFilter = useCallback((key: keyof SearchFilters, value: unknown) => {
    setFilters(prev => ({ ...prev, [key]: value, cursor: undefined }))
  }, [])
  
  const clearFilters = useCallback(() => {
    setFilters({})
    setResults([])
    setNextCursor(null)
  }, [])
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])
  
  // Track whether we're showing recommendations or search results
  const isShowingRecommendations = useMemo(() => {
    if (authLoading) return false
    if (!isAuthenticated || !userId) return false
    const hasAnyFilters = Object.keys(filters).some(key => {
      if (key === 'cursor' || key === 'limit') return false
      const value = filters[key as keyof typeof filters]
      if (Array.isArray(value)) return value.length > 0
      if (typeof value === 'object' && value !== null) {
        return Object.keys(value).length > 0
      }
      return value !== undefined && value !== null && value !== ''
    })
    return !hasAnyFilters
  }, [filters, isAuthenticated, userId, authLoading])

  return {
    filters,
    setFilters,
    updateFilter,
    results,
    loading,
    error,
    nextCursor,
    hasMore: !!nextCursor,
    search,
    loadMore,
    clearFilters,
    isShowingRecommendations
  }
}
