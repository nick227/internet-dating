import { useCallback, useEffect, useRef } from 'react'
import type { Dispatch } from 'react'
import { safeLocalStorage } from '../../core/storage/localStorage'
import type { DraftData, FileWithPreview, PostComposerAction } from './postComposerState'

const DRAFT_KEY = 'postContentModal:draft'
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000
const DRAFT_SAVE_DEBOUNCE_MS = 2000
const DRAFT_SAVED_INDICATOR_MS = 2000

type Options = {
  open: boolean
  text: string
  files: FileWithPreview[]
  visibility: 'PUBLIC' | 'PRIVATE'
  tags: string[]
  dispatch: Dispatch<PostComposerAction>
}

export function usePostDraftPersistence({
  open,
  text,
  files,
  visibility,
  tags,
  dispatch,
}: Options) {
  const saveTimerRef = useRef<number | null>(null)
  const indicatorTimerRef = useRef<number | null>(null)

  const clearDraft = useCallback(() => {
    safeLocalStorage.removeItem(DRAFT_KEY)
  }, [])

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
      const shouldRestore = true
      if (shouldRestore) {
        dispatch({ type: 'restoreDraft', value: draft })
      }
    } catch (error) {
      console.warn('[post-draft] Failed to parse draft data.', error)
    }
  }, [dispatch, open])

  useEffect(() => {
    if (!open) {
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      if (indicatorTimerRef.current != null) {
        window.clearTimeout(indicatorTimerRef.current)
        indicatorTimerRef.current = null
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
      dispatch({ type: 'setDraftSaved', value: false })
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
      dispatch({ type: 'setDraftSaved', value: true })
      if (indicatorTimerRef.current != null) {
        window.clearTimeout(indicatorTimerRef.current)
      }
      indicatorTimerRef.current = window.setTimeout(() => {
        dispatch({ type: 'setDraftSaved', value: false })
      }, DRAFT_SAVED_INDICATOR_MS)
    }, DRAFT_SAVE_DEBOUNCE_MS)

    return () => {
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [dispatch, files, open, tags, text, visibility])

  return { clearDraft }
}
