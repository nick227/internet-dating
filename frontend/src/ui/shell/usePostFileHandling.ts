/**
 * Simplified file handling for post composer
 */
import { useCallback } from 'react'
import { ALLOWED_MIME_TYPES } from '../../core/media/mediaConstants'
import { MAX_FILE_BYTES } from './postComposerConstants'
import type { FileWithPreview } from './postComposerState'

const ACCEPTED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'ogg', 'mp3', 'wav'])

const formatBytes = (bytes: number) => {
  if (bytes >= 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024 * 1024))}GB`
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))}MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`
  return `${bytes}B`
}

const isAllowedFile = (file: File): boolean => {
  if (file.type && ALLOWED_MIME_TYPES.has(file.type)) return true
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext && ACCEPTED_EXTENSIONS.has(ext)) return true
  return false
}

const createFilePreview = (file: File): FileWithPreview => ({
  file,
  preview: URL.createObjectURL(file),
  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
})

export function usePostFileHandling(
  files: FileWithPreview[],
  onAddFiles: (files: FileWithPreview[]) => void,
  onRemoveFile: (id: string) => void,
  onSetFiles: (files: FileWithPreview[]) => void,
  onError: (error: string | null) => void
) {
  const addFiles = useCallback(
    (selectedFiles: File[]) => {
      const valid: FileWithPreview[] = []
      const rejected: string[] = []

      selectedFiles.forEach(file => {
        if (file.size > MAX_FILE_BYTES) {
          rejected.push(`${file.name} exceeds ${formatBytes(MAX_FILE_BYTES)}`)
          return
        }
        if (!isAllowedFile(file)) {
          rejected.push(`${file.name} has an unsupported file type`)
          return
        }
        valid.push(createFilePreview(file))
      })

      if (rejected.length > 0) {
        onError(`Skipped ${rejected.length} file${rejected.length > 1 ? 's' : ''}: ${rejected.join(', ')}.`)
      } else if (valid.length > 0) {
        onError(null)
      }

      if (valid.length > 0) {
        onAddFiles(valid)
      }
    },
    [onAddFiles, onError]
  )

  const removeFile = useCallback(
    (id: string) => {
      const target = files.find(file => file.id === id)
      if (target) {
        URL.revokeObjectURL(target.preview)
      }
      onRemoveFile(id)
    },
    [files, onRemoveFile]
  )

  const clearFiles = useCallback(() => {
    files.forEach(file => URL.revokeObjectURL(file.preview))
    onSetFiles([])
  }, [files, onSetFiles])

  const cleanupPreviews = useCallback(() => {
    files.forEach(file => URL.revokeObjectURL(file.preview))
  }, [files])

  const reorderFiles = useCallback(
    (fromIndex: number, toIndex: number) => {
      const nextFiles = [...files]
      const [moved] = nextFiles.splice(fromIndex, 1)
      if (!moved) return
      nextFiles.splice(toIndex, 0, moved)
      onSetFiles(nextFiles)
    },
    [files, onSetFiles]
  )

  return { addFiles, removeFile, clearFiles, reorderFiles, cleanupPreviews }
}
