import { TextSearchInput } from './filters/TextSearchInput'
import { EnumFilter } from './filters/EnumFilter'
import { RangeFilter } from './filters/RangeFilter'
import { TraitFilter } from './filters/TraitFilter'
import { InterestFilter } from './filters/InterestFilter'
import type { SearchDimension, SearchFilters } from '../../../core/profile/search/types'

interface Props {
  dimension: SearchDimension
  value: unknown
  onChange: (value: unknown) => void
  filters: SearchFilters
}

export function DimensionFilterFactory({ dimension, value, onChange }: Props) {
  // Note: filters prop kept for potential future use (e.g., dependent filters)
  switch (dimension.type) {
    case 'text':
      return <TextSearchInput dimension={dimension} value={value} onChange={onChange} />
    case 'enum':
      return <EnumFilter dimension={dimension} value={value} onChange={onChange} />
    case 'range':
      return <RangeFilter dimension={dimension} value={value} onChange={onChange} />
    case 'trait':
      return <TraitFilter dimension={dimension} value={value} onChange={onChange} />
    case 'interest':
      return <InterestFilter dimension={dimension} value={value} onChange={onChange} />
    case 'top5':
    case 'multi-select':
      // TODO: Implement these filter types
      return null
    default:
      return null
  }
}
