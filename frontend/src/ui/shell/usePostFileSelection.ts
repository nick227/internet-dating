import { useCallback } from 'react'
import type { Dispatch } from 'react'
import type { FileWithPreview, PostComposerAction } from './postComposerState'

type Options = {
  files: FileWithPreview[]
  acceptedMimeTypes: Set<string>
  acceptedExtensions: Set<string>
  maxFileBytes: number
  dispatch: Dispatch<PostComposerAction>
}

const formatBytes = (bytes: number) => {
  if (bytes >= 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024 * 1024))}GB`
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))}MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`
  return `${bytes}B`
}

const isAllowedFile = (
  file: File,
  acceptedMimeTypes: Set<string>,
  acceptedExtensions: Set<string>
) => {
  if (file.type && acceptedMimeTypes.has(file.type)) return true
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext && acceptedExtensions.has(ext)) return true
  return false
}

const createFilePreview = (file: File): FileWithPreview => ({
  file,
  preview: URL.createObjectURL(file),
  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
})

export function usePostFileSelection({
  files,
  acceptedMimeTypes,
  acceptedExtensions,
  maxFileBytes,
  dispatch,
}: Options) {
  const addFiles = useCallback(
    (selectedFiles: File[]) => {
      const valid: FileWithPreview[] = []
      const rejected: string[] = []

      selectedFiles.forEach(file => {
        if (file.size > maxFileBytes) {
          rejected.push(`${file.name} exceeds ${formatBytes(maxFileBytes)}`)
          return
        }
        if (!isAllowedFile(file, acceptedMimeTypes, acceptedExtensions)) {
          rejected.push(`${file.name} has an unsupported file type`)
          return
        }
        valid.push(createFilePreview(file))
      })

      if (rejected.length > 0) {
        dispatch({
          type: 'setError',
          value: `Skipped ${rejected.length} file${rejected.length > 1 ? 's' : ''}: ${rejected.join(
            ', '
          )}.`,
        })
      } else if (valid.length > 0) {
        dispatch({ type: 'setError', value: null })
      }

      if (valid.length > 0) {
        dispatch({ type: 'addFiles', value: valid })
      }
    },
    [acceptedExtensions, acceptedMimeTypes, dispatch, maxFileBytes]
  )

  const removeFile = useCallback(
    (id: string) => {
      const target = files.find(file => file.id === id)
      if (target) {
        URL.revokeObjectURL(target.preview)
      }
      dispatch({ type: 'removeFile', value: id })
    },
    [dispatch, files]
  )

  const clearFiles = useCallback(() => {
    files.forEach(file => URL.revokeObjectURL(file.preview))
    dispatch({ type: 'setFiles', value: [] })
    dispatch({ type: 'setUploadProgress', value: {} })
  }, [dispatch, files])

  const cleanupPreviews = useCallback(() => {
    files.forEach(file => URL.revokeObjectURL(file.preview))
  }, [files])

  const reorderFiles = useCallback(
    (fromIndex: number, toIndex: number) => {
      const nextFiles = [...files]
      const [moved] = nextFiles.splice(fromIndex, 1)
      if (!moved) return
      nextFiles.splice(toIndex, 0, moved)
      dispatch({ type: 'setFiles', value: nextFiles })
    },
    [dispatch, files]
  )

  return { addFiles, removeFile, clearFiles, reorderFiles, cleanupPreviews }
}
