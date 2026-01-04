import { useState, useCallback, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../../../api/client'
import { useDebounce } from '../../hooks/useDebounce'
import { useAuth } from '../../auth/useAuth'
import type { ProfileSearchResponse, ProfileSearchResult, SearchFilters } from './types'
import { serializeFiltersToURL, parseFiltersFromURL } from './adapter'

export function useProfileSearch() {
  const location = useLocation()
  const navigate = useNavigate()
  const { userId, isAuthenticated } = useAuth()
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
      setError(err instanceof Error ? err : new Error('Search failed'))
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
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return // Request was cancelled
      }
      setError(err instanceof Error ? err : new Error('Failed to load recommendations'))
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
  }, [filters.limit, nextCursor])
  
  // Auto-search when filters change (debounced)
  useEffect(() => {
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
    } else if (isAuthenticated) {
      // Use recommendations when no filters and user is authenticated
      // This is an explicit data source choice, not search logic
      loadRecommendations()
    } else {
      // Anonymous users: show empty state (no recommendations available)
      // Do not invent anonymous ranking logic - keep it explicit
      setResults([])
      setNextCursor(null)
      setLoading(false)
    }
  }, [debouncedFilters, search, loadRecommendations, isAuthenticated])
  
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
    } else if (isAuthenticated) {
      loadRecommendations(true)
    }
  }, [nextCursor, loading, filters, search, loadRecommendations, isAuthenticated])
  
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
    clearFilters
  }
}
