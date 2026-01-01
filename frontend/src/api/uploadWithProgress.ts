/**
 * Upload with progress tracking using XMLHttpRequest
 * Fetch API doesn't support upload progress, so we use XHR for file uploads
 */

import { HttpError } from './http'

export type UploadProgress = {
  loaded: number
  total: number
  percent: number
}

export type UploadWithProgressOptions = {
  onProgress?: (progress: UploadProgress) => void
  signal?: AbortSignal
}

/**
 * Upload file with progress tracking
 * Returns the same response as api.media.upload but with progress callbacks
 */
export async function uploadWithProgress<T>(
  url: string,
  file: File,
  options: UploadWithProgressOptions = {}
): Promise<T> {
  const { onProgress, signal } = options

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    // Handle abort
    if (signal) {
      signal.addEventListener('abort', () => {
        xhr.abort()
        reject(new DOMException('Upload aborted', 'AbortError'))
      })
    }

    // Track progress
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress({
          loaded: event.loaded,
          total: event.total,
          percent: Math.round((event.loaded / event.total) * 100),
        })
      }
    })

    // Handle completion
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText)
          resolve(response as T)
        } catch (err) {
          reject(new Error(`Invalid JSON response: ${err}`))
        }
      } else {
        try {
          const error = JSON.parse(xhr.responseText)
          const message = error?.error || xhr.statusText || 'Upload failed'
          reject(new HttpError(message, xhr.status, error))
        } catch {
          reject(new HttpError(xhr.statusText || 'Upload failed', xhr.status, null))
        }
      }
    })

    // Handle errors
    xhr.addEventListener('error', () => {
      reject(new Error('Network error'))
    })

    xhr.addEventListener('abort', () => {
      reject(new DOMException('Upload aborted', 'AbortError'))
    })

    // Start upload
    xhr.open('POST', url)
    xhr.withCredentials = true // Include cookies

    const formData = new FormData()
    formData.append('file', file)

    xhr.send(formData)
  })
}
