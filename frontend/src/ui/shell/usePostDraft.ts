/**
 * Simplified draft persistence for post composer
 */
import { useCallback, useEffect, useRef } from 'react'
import { safeLocalStorage } from '../../core/storage/localStorage'
import type { FileWithPreview } from './postComposerState'

const DRAFT_KEY = 'postContentModal:draft'
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000
const DRAFT_SAVE_DEBOUNCE_MS = 2000

type DraftData = {
  text: string
  fileIds: string[]
  visibility: 'PUBLIC' | 'PRIVATE'
  tags: string[]
  timestamp: number
}

export function usePostDraft(
  open: boolean,
  text: string,
  files: FileWithPreview[],
  visibility: 'PUBLIC' | 'PRIVATE',
  tags: string[],
  onRestore: (draft: { text: string; visibility: 'PUBLIC' | 'PRIVATE'; tags: string[] }) => void
) {
  const saveTimerRef = useRef<number | null>(null)

  const clearDraft = useCallback(() => {
    safeLocalStorage.removeItem(DRAFT_KEY)
  }, [])

  // Restore draft on open
  useEffect(() => {
    if (!open) return
    const draftJson = safeLocalStorage.getItem(DRAFT_KEY)
    if (!draftJson) return
    try {
      const draft = JSON.parse(draftJson) as DraftData
      const age = Date.now() - draft.timestamp
      if (age > DRAFT_TTL_MS) {
        safeLocalStorage.removeItem(DRAFT_KEY)
        return
      }
      onRestore({
        text: draft.text,
        visibility: draft.visibility,
        tags: draft.tags,
      })
    } catch (error) {
      console.warn('[post-draft] Failed to parse draft data.', error)
    }
  }, [open, onRestore])

  // Save draft
  useEffect(() => {
    if (!open) {
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      return
    }

    const hasContent = Boolean(text.trim() || files.length > 0 || tags.length > 0)
    if (!hasContent) {
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      safeLocalStorage.removeItem(DRAFT_KEY)
      return
    }

    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current)
    }

    saveTimerRef.current = window.setTimeout(() => {
      const draft: DraftData = {
        text,
        fileIds: files.map(file => file.id),
        visibility,
        tags,
        timestamp: Date.now(),
      }
      safeLocalStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    }, DRAFT_SAVE_DEBOUNCE_MS)

    return () => {
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [files, open, tags, text, visibility])

  return { clearDraft }
}
