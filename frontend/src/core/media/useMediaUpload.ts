/**
 * Shared hook for media uploads with validation
 * Used across profile posts, river posts, and hero tiles
 */

import { useCallback, useRef } from 'react'
import { validateMediaFile } from './mediaValidation'
import { api } from '../../api/client'
import { uploadWithProgress, type UploadProgress } from '../../api/uploadWithProgress'
import { API_BASE_URL } from '../../config/env'

export type MediaUploadOptions = {
  onProgress?: (progress: UploadProgress) => void
  signal?: AbortSignal
}

export type MediaUploadResult = {
  mediaId: string
  mimeType: string
  urls: { original: string; thumb: string | null }
}

export type MediaUploadError = {
  file: File
  error: string
}

const POLL_INTERVAL_MS = 750
const MAX_WAIT_MS = 180_000

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const needsProcessing = (file: File) => {
  if (file.type.startsWith('video/') || file.type.startsWith('audio/')) return true
  const ext = file.name.split('.').pop()?.toLowerCase()
  return ext === 'mp4' || ext === 'webm' || ext === 'ogg' || ext === 'mp3' || ext === 'wav'
}

const waitForMediaReady = async (mediaId: string, signal?: AbortSignal) => {
  const deadline = Date.now() + MAX_WAIT_MS

  while (Date.now() < deadline) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

    const media = await api.media.get(mediaId, signal)
    if (media.status === 'READY') return
    if (media.status === 'FAILED') {
      throw new Error('Media processing failed')
    }

    await sleep(POLL_INTERVAL_MS)
  }

  throw new Error('Media processing timed out')
}

/**
 * Hook for uploading media files with validation
 * Returns upload function that validates before uploading
 */
export function useMediaUpload() {
  const controllersRef = useRef<Map<string, AbortController>>(new Map())

  const uploadFile = useCallback(
    async (
      file: File,
      options: MediaUploadOptions = {}
    ): Promise<MediaUploadResult> => {
      // Validate file before upload (duration, resolution, MIME)
      const validation = await validateMediaFile(file)
      if (!validation.valid) {
        throw new Error(validation.error || 'File validation failed')
      }

      // Upload with abort support
      const controller = options.signal
        ? undefined
        : new AbortController()
      
      if (controller) {
        const fileId = `${Date.now()}-${Math.random()}`
        controllersRef.current.set(fileId, controller)
      }

      try {
        // Use XHR for progress tracking (fetch doesn't support upload progress)
        const uploadUrl = `${API_BASE_URL}/api/media/upload`
        const result = await uploadWithProgress<{
          mediaId: bigint
          status: string
          mimeType: string
          urls: { original: string; thumb: string | null }
        }>(
          uploadUrl,
          file,
          {
            onProgress: options.onProgress,
            signal: controller?.signal || options.signal,
          }
        )

        if (needsProcessing(file)) {
          await waitForMediaReady(String(result.mediaId), controller?.signal || options.signal)
        }

        return {
          mediaId: String(result.mediaId),
          mimeType: result.mimeType,
          urls: result.urls,
        }
      } finally {
        if (controller) {
          const fileId = Array.from(controllersRef.current.entries()).find(
            ([_, c]) => c === controller
          )?.[0]
          if (fileId) {
            controllersRef.current.delete(fileId)
          }
        }
      }
    },
    []
  )

  const uploadFiles = useCallback(
    async (
      files: File[],
      options: MediaUploadOptions & { onProgress?: (progress: UploadProgress, fileIndex?: number) => void } = {}
    ): Promise<{ results: MediaUploadResult[]; errors: MediaUploadError[] }> => {
      if (files.length === 0) {
        return { results: [], errors: [] }
      }

      const uploadPromises = files.map(async (file, index) => {
        try {
          const result = await uploadFile(file, {
            ...options,
            onProgress: options.onProgress
              ? (progress) => options.onProgress?.(progress, index)
              : undefined,
          })
          return { success: true as const, result, file }
        } catch (error) {
          return {
            success: false as const,
            error: error instanceof Error ? error.message : 'Upload failed',
            file,
          }
        }
      })

      const settled = await Promise.allSettled(uploadPromises)
      const results: MediaUploadResult[] = []
      const errors: MediaUploadError[] = []

      for (const result of settled) {
        if (result.status === 'fulfilled') {
          if (result.value.success) {
            results.push(result.value.result)
          } else {
            errors.push({
              file: result.value.file,
              error: result.value.error,
            })
          }
        } else {
          // This shouldn't happen, but handle it
          errors.push({
            file: files[0], // Fallback
            error: result.reason instanceof Error ? result.reason.message : 'Upload failed',
          })
        }
      }

      return { results, errors }
    },
    [uploadFile]
  )

  const abortAll = useCallback(() => {
    controllersRef.current.forEach((controller) => controller.abort())
    controllersRef.current.clear()
  }, [])

  return {
    uploadFile,
    uploadFiles,
    abortAll,
  }
}
