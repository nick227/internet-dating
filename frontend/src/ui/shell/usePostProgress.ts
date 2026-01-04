/**
 * Efficient progress calculation with memoization
 */
import { useMemo } from 'react'
import type { UploadProgress } from './postComposerState'

type ProgressMeta = {
  completed: number
  totalProgress: number
  hasErrors: boolean
  allComplete: boolean
}

export function usePostProgress(
  files: Array<{ id: string }>,
  uploadProgress: Record<string, UploadProgress>
): ProgressMeta {
  return useMemo(() => {
    const values = Object.values(uploadProgress)
    const completed = values.filter(p => p.status === 'complete').length
    const hasErrors = values.some(p => p.status === 'error')
    const allComplete =
      files.length > 0 &&
      values.length === files.length &&
      values.every(p => p.status === 'complete' || p.status === 'error')
    const totalProgress =
      values.length === 0
        ? 0
        : Math.round(values.reduce((sum, value) => sum + value.progress, 0) / values.length)

    return {
      completed,
      hasErrors,
      allComplete,
      totalProgress,
    }
  }, [files.length, uploadProgress])
}
