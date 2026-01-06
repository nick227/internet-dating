import type { SearchDimension, SearchFilters, TraitFilter } from './types'
import type { Gender, DatingIntent } from '../../../api/types'

interface SearchParams {
  q?: string
  gender?: Gender[]
  intent?: DatingIntent[]
  ageMin?: number
  ageMax?: number
  location?: string
  traits?: TraitFilter[]
  interests?: string[]
  interestSubjects?: string[]
  top5Query?: string
  top5Type?: 'title' | 'item'
  sort?: 'newest' | 'age'
  limit?: number
  cursor?: string
}

export function dimensionsToAPIParams(
  dimensions: SearchDimension[],
  dimensionValues: Map<string, unknown>
): SearchParams {
  const params: SearchParams = {}
  
  for (const dimension of dimensions) {
    const value = dimensionValues.get(dimension.id)
    if (value === undefined || value === null) continue
    
    switch (dimension.id) {
      case 'text':
        if (typeof value === 'string') params.q = value
        break
      case 'gender':
        if (Array.isArray(value)) params.gender = value as Gender[]
        break
      case 'intent':
        if (Array.isArray(value)) params.intent = value as DatingIntent[]
        break
      case 'age':
        if (typeof value === 'object' && value !== null) {
          const range = value as { min?: number; max?: number }
          if (range.min !== undefined) params.ageMin = range.min
          if (range.max !== undefined) params.ageMax = range.max
        }
        break
      case 'location':
        if (typeof value === 'string') params.location = value
        break
      case 'traits':
        if (Array.isArray(value)) params.traits = value as TraitFilter[]
        break
      case 'interests':
        if (Array.isArray(value)) params.interests = value as string[]
        break
    }
  }
  
  return params
}

export function apiParamsToDimensions(
  params: SearchParams,
  _dimensions: SearchDimension[]
): Map<string, unknown> {
  const values = new Map<string, unknown>()
  
  if (params.q) values.set('text', params.q)
  if (params.gender) values.set('gender', params.gender)
  if (params.intent) values.set('intent', params.intent)
  if (params.ageMin !== undefined || params.ageMax !== undefined) {
    values.set('age', { min: params.ageMin, max: params.ageMax })
  }
  if (params.location) values.set('location', params.location)
  if (params.interests) values.set('interests', params.interests)
  if (params.interestSubjects) values.set('interestSubjects', params.interestSubjects)
  if (params.top5Query) values.set('top5Query', params.top5Query)
  if (params.top5Type) values.set('top5Type', params.top5Type)
  if (params.sort) values.set('sort', params.sort)
  if (params.traits) values.set('traits', params.traits)
  
  return values
}

export function serializeFiltersToURL(filters: SearchFilters): URLSearchParams {
  const params = new URLSearchParams()
  
  if (filters.q) params.set('q', filters.q)
  if (filters.limit) params.set('limit', String(filters.limit))
  if (filters.sort) params.set('sort', filters.sort)
  
  filters.gender?.forEach(g => params.append('gender', g))
  filters.intent?.forEach(i => params.append('intent', i))
  filters.interests?.forEach(id => params.append('interest', id))
  filters.interestSubjects?.forEach(key => params.append('interestSubject', key))
  
  if (filters.ageMin !== undefined) params.set('ageMin', String(filters.ageMin))
  if (filters.ageMax !== undefined) params.set('ageMax', String(filters.ageMax))
  if (filters.location) params.set('location', filters.location)
  if (filters.top5Query) params.set('top5Query', filters.top5Query)
  if (filters.top5Type) params.set('top5Type', filters.top5Type)
  
  if (filters.traits && filters.traits.length > 0) {
    const encoded = btoa(JSON.stringify(filters.traits))
    params.set('traits', encoded)
  }
  
  if (filters.cursor) params.set('cursor', filters.cursor)
  
  return params
}

export function parseFiltersFromURL(search: string): SearchFilters {
  const params = new URLSearchParams(search)
  const filters: SearchFilters = {}
  
  if (params.has('q')) filters.q = params.get('q')!
  if (params.has('limit')) filters.limit = Number(params.get('limit'))
  if (params.has('sort')) filters.sort = params.get('sort') as SearchFilters['sort']
  
  const gender = params.getAll('gender')
  if (gender.length > 0) filters.gender = gender as Gender[]
  
  const intent = params.getAll('intent')
  if (intent.length > 0) filters.intent = intent as DatingIntent[]
  
  const interests = params.getAll('interest')
  if (interests.length > 0) filters.interests = interests
  
  const interestSubjects = params.getAll('interestSubject')
  if (interestSubjects.length > 0) filters.interestSubjects = interestSubjects
  
  if (params.has('ageMin')) filters.ageMin = Number(params.get('ageMin'))
  if (params.has('ageMax')) filters.ageMax = Number(params.get('ageMax'))
  if (params.has('location')) filters.location = params.get('location')!
  if (params.has('top5Query')) filters.top5Query = params.get('top5Query')!
  if (params.has('top5Type')) filters.top5Type = params.get('top5Type') as 'title' | 'item'
  
  if (params.has('traits')) {
    try {
      const decoded = atob(params.get('traits')!)
      filters.traits = JSON.parse(decoded) as TraitFilter[]
    } catch (e) {
      console.warn('Failed to parse traits from URL', e)
    }
  }
  
  if (params.has('cursor')) filters.cursor = params.get('cursor')!
  
  return filters
}
