import { useCallback, useEffect } from 'react'
import type { Dispatch } from 'react'
import type { FileWithPreview, PostComposerAction, UploadProgress } from './postComposerState'
import { useMediaUpload } from '../../core/media/useMediaUpload'

type UploadResult = {
  mediaIds: string[]
  errors: string[]
}

type Options = {
  dispatch: Dispatch<PostComposerAction>
}

export function usePostFileUpload({ dispatch }: Options) {
  const { uploadFiles: uploadMediaFiles, abortAll } = useMediaUpload()

  useEffect(() => {
    return () => {
      abortAll()
    }
  }, [abortAll])

  const uploadFiles = useCallback(
    async (files: FileWithPreview[]): Promise<UploadResult> => {
      if (files.length === 0) return { mediaIds: [], errors: [] }

      const progressMap: Record<string, UploadProgress> = {}
      files.forEach(file => {
        progressMap[file.id] = { fileId: file.id, progress: 0, status: 'pending' }
      })
      dispatch({ type: 'setUploadProgress', value: progressMap })

      // Update progress to uploading
      files.forEach(file => {
        dispatch({
          type: 'updateUploadProgress',
          fileId: file.id,
          patch: { status: 'uploading', progress: 0 },
        })
      })

      // Upload files with validation
      const fileArray = files.map(f => f.file)
      const { results, errors: uploadErrors } = await uploadMediaFiles(fileArray)

      // Update progress for successful uploads
      results.forEach((result, index) => {
        const fileId = files[index]?.id
        if (fileId) {
          dispatch({
            type: 'updateUploadProgress',
            fileId,
            patch: { status: 'complete', progress: 100 },
          })
        }
      })

      // Update progress for failed uploads
      uploadErrors.forEach((error) => {
        const fileId = files.find(f => f.file === error.file)?.id
        if (fileId) {
          const isOffline = typeof navigator !== 'undefined' && !navigator.onLine
          const finalMessage = isOffline ? 'Network error. Check your connection.' : error.error
          dispatch({
            type: 'updateUploadProgress',
            fileId,
            patch: { status: 'error', progress: 0, error: finalMessage },
          })
        }
      })

      const mediaIds = results.map(r => r.mediaId)
      const errors = uploadErrors.map((e, index) => `File ${index + 1}: ${e.error}`)

      return { mediaIds, errors }
    },
    [dispatch, uploadMediaFiles]
  )

  return { uploadFiles, abortUploads: abortAll }
}
