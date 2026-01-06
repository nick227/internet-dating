import type { Gender, DatingIntent } from '../../../api/types'

export type SearchDimensionType = 
  | 'text'
  | 'enum'
  | 'range'
  | 'multi-select'
  | 'trait'
  | 'interest'
  | 'top5'

export interface SearchDimension {
  id: string
  type: SearchDimensionType
  label: string
  description?: string
  config: SearchDimensionConfig
}

export type SearchDimensionConfig = 
  | TextDimensionConfig
  | EnumDimensionConfig
  | RangeDimensionConfig
  | MultiSelectDimensionConfig
  | TraitDimensionConfig
  | InterestDimensionConfig
  | Top5DimensionConfig

export interface TextDimensionConfig {
  placeholder?: string
  minLength?: number
}

export interface EnumDimensionConfig {
  options: Array<{ value: string; label: string }>
  multiSelect?: boolean
}

export interface RangeDimensionConfig {
  min: number
  max: number
  step?: number
  unit?: string
}

export interface MultiSelectDimensionConfig {
  options: Array<{ value: string; label: string }>
  searchable?: boolean
}

export interface TraitDimensionConfig {
  traitKey: string
  min?: number
  max?: number
}

export interface InterestDimensionConfig {
  subjectKey?: string
  multiSelect: boolean
}

export interface Top5DimensionConfig {
  searchType: 'title' | 'item' | 'both'
}

export type SearchSort = 'newest' | 'age'

export interface TraitFilter {
  key: string
  min?: number
  max?: number
  group?: string
}

export interface SearchFilters {
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
  sort?: SearchSort
  limit?: number
  cursor?: string
}

export interface ProfileSearchResult {
  userId: string
  displayName: string | null
  bio: string | null
  avatarUrl: string | null
  heroUrl: string | null
  locationText: string | null
  age: number | null
  gender: Gender
  intent: DatingIntent
  liked?: boolean
  matchReasons?: string[]
}

export interface ProfileSearchResponse {
  profiles: ProfileSearchResult[]
  nextCursor: string | null
  queryId?: string
}
