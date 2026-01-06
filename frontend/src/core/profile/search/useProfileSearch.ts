import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../../../api/client'
import { HttpError } from '../../../api/http'
import { useDebounce } from '../../hooks/useDebounce'
import { useAuth } from '../../auth/useAuth'
import type { ProfileSearchResult, SearchFilters } from './types'
import { serializeFiltersToURL, parseFiltersFromURL } from './adapter'

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
  
  const search = useCallback(async (searchFilters: SearchFilters, append = false) => {
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
      
      if (append) {
        setResults(prev => [...prev, ...response.profiles])
      } else {
        setResults(response.profiles)
      }
      
      setNextCursor(response.nextCursor)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return // Request was cancelled
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
      // Preserve the original error message if available
      const errorMessage = err instanceof Error ? err.message : 'Search failed'
      setError(new Error(errorMessage))
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
  }, [])
  
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
      
      if (append) {
        setResults(prev => [...prev, ...response.profiles])
      } else {
        setResults(response.profiles)
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
      // Preserve the original error message if available
      const errorMessage = err instanceof Error ? err.message : 'Failed to load recommendations'
      setError(new Error(errorMessage))
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

    // If auth finished loading but we don't have a userId, don't make API calls
    if (!isAuthenticated || !userId) {
      setResults([])
      setNextCursor(null)
      setLoading(false)
      setError(null) // Clear any previous errors
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
