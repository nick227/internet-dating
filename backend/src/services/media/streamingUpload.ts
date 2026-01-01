/**
 * Streaming upload handler using Busboy
 * Replaces Multer memory storage with disk streaming for backpressure safety
 */

import { createWriteStream, promises as fs, type WriteStream } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import busboy from 'busboy'
import type { Request, Response } from 'express'

// Conservative limits for Railway free tier
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024 // 200MB (for videos)
const MAX_UPLOAD_TIME_MS = 5 * 60 * 1000 // 5 minutes (fail fast)
const IDLE_TIMEOUT_MS = 30 * 1000 // 30 seconds no data (fail fast)
const UPLOAD_TEMP_DIR = process.env.UPLOAD_TEMP_DIR || 'tmp/uploads'

export type UploadProgress = {
  bytesReceived: number
  bytesTotal?: number
  elapsedMs: number
}

export type UploadOptions = {
  maxBytes?: number
  maxTimeMs?: number
  idleTimeoutMs?: number
  onProgress?: (progress: UploadProgress) => void
}

export type UploadResult = {
  filePath: string
  fileName: string
  mimeType: string
  sizeBytes: number
  uploadId: string
}

/**
 * Stream multipart upload to disk with backpressure handling
 * Returns temp file path that should be moved to final location after validation
 */
export async function streamUploadToDisk(
  req: Request,
  res: Response,
  options: UploadOptions = {}
): Promise<UploadResult> {
  const {
    maxBytes = MAX_UPLOAD_BYTES,
    maxTimeMs = MAX_UPLOAD_TIME_MS,
    idleTimeoutMs = IDLE_TIMEOUT_MS,
    onProgress,
  } = options

  return new Promise((resolve, reject) => {
    const uploadId = randomUUID()
    const startTime = Date.now()
    let lastByteTime = Date.now()
    let bytesReceived = 0
    let filePath: string | null = null
    let writeStream: WriteStream | null = null
    let fileName = ''
    let mimeType = ''
    let idleTimer: NodeJS.Timeout | null = null
    let maxTimeTimer: NodeJS.Timeout | null = null
    let fileSeen = false
    let isCompleted = false
    let isAborted = false
    
    // Track completion states for safe resolution
    let fileEnded = false
    let writeFinished = false
    let bbFinished = false

    // Cleanup timers and streams (but NOT the file)
    const cleanupResources = () => {
      if (idleTimer) clearTimeout(idleTimer)
      if (maxTimeTimer) clearTimeout(maxTimeTimer)
      if (writeStream && !writeStream.destroyed) {
        writeStream.destroy()
      }
    }

    // Cleanup everything including temp file (for errors/aborts)
    const cleanupAll = () => {
      cleanupResources()
      if (filePath) {
        fs.unlink(filePath).catch(() => null) // Clean up temp file on failure
      }
    }

    const safeReject = (error: Error) => {
      if (isCompleted || isAborted) return
      isAborted = true
      cleanupAll() // Delete temp file on failure
      reject(error)
    }

    const tryResolve = () => {
      // Only resolve when all three conditions are met
      if (isCompleted || isAborted) return
      if (fileEnded && writeFinished && bbFinished && fileSeen) {
        isCompleted = true
        cleanupResources() // Clear timers/streams, but DO NOT delete file
        resolve({
          filePath: filePath!,
          fileName,
          mimeType,
          sizeBytes: bytesReceived,
          uploadId,
        })
      }
    }

    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        safeReject(new Error('Upload idle timeout: no data received'))
      }, idleTimeoutMs)
    }

    // Max upload time
    maxTimeTimer = setTimeout(() => {
      safeReject(new Error('Upload timeout: exceeded maximum time'))
    }, maxTimeMs)

    // Enforce single file and size limit
    const bb = busboy({ 
      headers: req.headers, 
      limits: { 
        fileSize: maxBytes,
        files: 1, // Only allow one file per request
        fields: 5, // Limit form fields (prevent field spam)
        fieldSize: 1024, // 1KB max per field
      } 
    })

    // Drain extra fields (ignore them, but prevent memory issues)
    bb.on('field', (_name, _value, _info) => {
      // Ignore form fields (we only care about the file)
    })

    bb.on('file', async (_name, file, info) => {
      // Enforce single file
      if (fileSeen) {
        file.resume() // Drain the stream to prevent hanging
        safeReject(new Error('Only one file allowed per request'))
        return
      }
      fileSeen = true

      const { filename, encoding, mimeType: fileMimeType } = info
      fileName = filename || 'upload'
      mimeType = fileMimeType || 'application/octet-stream'

      // Ensure temp directory exists
      await fs.mkdir(UPLOAD_TEMP_DIR, { recursive: true })

      // Create temp file path (use .part extension to indicate incomplete)
      const ext = filename?.split('.').pop() || ''
      filePath = join(UPLOAD_TEMP_DIR, `${uploadId}.part${ext ? '.' + ext : ''}`)

      writeStream = createWriteStream(filePath)

      // Handle Busboy's file size limit event (primary enforcement)
      file.on('limit', () => {
        safeReject(new Error(`File size exceeds ${Math.round(maxBytes / (1024 * 1024))}MB`))
      })

      // Track bytes and progress (belt-and-suspenders check)
      file.on('data', (chunk: Buffer) => {
        bytesReceived += chunk.length
        lastByteTime = Date.now()
        resetIdleTimer()

        // Secondary check (shouldn't trigger if Busboy limit works correctly)
        if (bytesReceived > maxBytes) {
          safeReject(new Error(`File size exceeds ${Math.round(maxBytes / (1024 * 1024))}MB`))
          return
        }

        if (onProgress) {
          onProgress({
            bytesReceived,
            elapsedMs: Date.now() - startTime,
          })
        }
      })

      file.on('end', () => {
        if (idleTimer) clearTimeout(idleTimer)
        fileEnded = true
        tryResolve() // Check if we can resolve now
      })

      // Pipe file stream to disk with backpressure handling
      file.pipe(writeStream)

      writeStream.on('error', (err) => {
        safeReject(new Error(`Write error: ${err.message}`))
      })

      writeStream.on('close', () => {
        // Stream closed (may happen on error or normal completion)
        // If we haven't finished normally, this might indicate an error
        if (!writeFinished && !isAborted && !isCompleted) {
          // This shouldn't happen normally, but handle it
          console.warn('Write stream closed before finish event')
        }
      })

      // Mark write stream as finished
      writeStream.on('finish', () => {
        writeFinished = true
        tryResolve() // Check if we can resolve now
      })
    })

    bb.on('finish', () => {
      if (idleTimer) clearTimeout(idleTimer)
      if (maxTimeTimer) clearTimeout(maxTimeTimer)
      bbFinished = true

      // If no file was received, reject
      if (!fileSeen) {
        safeReject(new Error('No file received'))
        return
      }

      // Check if we can resolve now (all conditions may be met)
      tryResolve()
    })

    bb.on('error', (err) => {
      safeReject(err instanceof Error ? err : new Error(String(err)))
    })

    // Handle request errors
    req.on('error', (err) => {
      if (!isCompleted && !isAborted) {
        safeReject(new Error(`Request error: ${err.message}`))
      }
    })

    // Handle request abort (use 'aborted' instead of 'close')
    req.on('aborted', () => {
      if (!isCompleted) {
        safeReject(new Error('Upload aborted by client'))
      }
    })

    // Handle request close (only reject if not completed and not already aborted)
    req.on('close', () => {
      // Only reject if we haven't completed and haven't already aborted
      // This handles cases where connection closes unexpectedly before upload starts
      if (!isCompleted && !isAborted && !fileSeen) {
        safeReject(new Error('Connection closed before upload started'))
      }
    })

    // Pipe request to busboy
    req.pipe(bb)
  })
}

/**
 * Move temp file to final storage location atomically
 */
export async function finalizeUpload(
  tempPath: string,
  finalPath: string
): Promise<void> {
  // Ensure destination directory exists
  const finalDir = finalPath.substring(0, finalPath.lastIndexOf('/'))
  await fs.mkdir(finalDir, { recursive: true })

  // Atomic move (rename is atomic on same filesystem)
  await fs.rename(tempPath, finalPath)
}

/**
 * Clean up temp file
 */
export async function cleanupTempFile(path: string): Promise<void> {
  try {
    await fs.unlink(path)
  } catch {
    // Ignore errors (file may not exist)
  }
}
