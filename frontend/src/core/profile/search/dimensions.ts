import type { SearchDimension, SearchDimensionType, Gender, DatingIntent } from './types'

export const SEARCH_DIMENSIONS: SearchDimension[] = [
  {
    id: 'text',
    type: 'text',
    label: 'Search',
    config: {
      placeholder: 'Search by name, bio, location...',
      minLength: 2
    }
  },
  {
    id: 'gender',
    type: 'enum',
    label: 'Gender',
    config: {
      options: [
        { value: 'MALE', label: 'Male' },
        { value: 'FEMALE', label: 'Female' },
        { value: 'NONBINARY', label: 'Nonbinary' },
        { value: 'OTHER', label: 'Other' }
      ],
      multiSelect: true
    }
  },
  {
    id: 'intent',
    type: 'enum',
    label: 'Looking For',
    config: {
      options: [
        { value: 'FRIENDS', label: 'Friends' },
        { value: 'CASUAL', label: 'Casual' },
        { value: 'LONG_TERM', label: 'Long Term' },
        { value: 'MARRIAGE', label: 'Marriage' }
      ],
      multiSelect: true
    }
  },
  {
    id: 'age',
    type: 'range',
    label: 'Age',
    config: {
      min: 18,
      max: 100,
      step: 1,
      unit: 'years'
    }
  },
  {
    id: 'location',
    type: 'text',
    label: 'Location',
    config: {
      placeholder: 'City, state, country...'
    }
  },
  {
    id: 'traits',
    type: 'trait',
    label: 'Personality & Values',
    description: 'Select up to 3 traits (AND logic)',
    config: {
      traitKey: '',
      min: -10,
      max: 10
    }
  },
  {
    id: 'interests',
    type: 'interest',
    label: 'Interests',
    config: {
      multiSelect: true
    }
  }
]

export function getDimension(id: string): SearchDimension | undefined {
  return SEARCH_DIMENSIONS.find(d => d.id === id)
}

export function getDimensionsByType(type: SearchDimensionType): SearchDimension[] {
  return SEARCH_DIMENSIONS.filter(d => d.type === type)
}
