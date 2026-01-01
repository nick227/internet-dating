import { useMemo } from 'react'
import type { ProfileResponse } from '../../api/types'

export function useCompatibilityLabel(
  compatibility: ProfileResponse['compatibility'] | null | undefined
): string | null {
  return useMemo(() => {
    if (!compatibility) return null
    if (compatibility.status !== 'READY' || compatibility.score == null) {
      return 'Compatibility N/A'
    }
    const score = Math.round(compatibility.score * 100)
    return `Compatibility ${score}%`
  }, [compatibility])
}
