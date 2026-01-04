/**
 * Simplified link preview handling for post composer
 */
import { useEffect, useRef } from 'react'
import type { DetectedMedia } from '../form/SmartTextarea'
import { fetchLinkPreview } from '../../core/media/linkPreview'
import type { LinkPreview } from '../../core/media/linkPreview'
import type { LinkPreviewState } from './postComposerState'

export function usePostLinkPreviews(
  detected: DetectedMedia[],
  linkPreviews: Record<string, LinkPreviewState>,
  onSetLinkPreview: (url: string, preview: LinkPreview | null, loading: boolean) => void
) {
  const controllersRef = useRef<Map<string, AbortController>>(new Map())
  const previewsRef = useRef(linkPreviews)

  useEffect(() => {
    previewsRef.current = linkPreviews
  }, [linkPreviews])

  useEffect(() => {
    const current = previewsRef.current
    const activeUrls = new Set(detected.map(item => item.url))
    const controllers = controllersRef.current

    // Cancel previews for URLs no longer detected
    controllers.forEach((controller, url) => {
      if (!activeUrls.has(url)) {
        controller.abort()
        controllers.delete(url)
      }
    })

    // Start previews for new URLs
    const pending = detected.filter(item => !current[item.url] && !controllers.has(item.url))

    pending.forEach(item => {
      const controller = new AbortController()
      controllers.set(item.url, controller)
      onSetLinkPreview(item.url, null, true)
      fetchLinkPreview(item.url, controller.signal)
        .then(preview => {
          if (controller.signal.aborted) return
          onSetLinkPreview(item.url, preview, false)
        })
        .catch(() => {
          if (controller.signal.aborted) return
          onSetLinkPreview(item.url, null, false)
        })
        .finally(() => {
          controllers.delete(item.url)
        })
    })
  }, [detected, linkPreviews, onSetLinkPreview])

  useEffect(() => {
    const controllers = controllersRef.current
    return () => {
      controllers.forEach(controller => controller.abort())
      controllers.clear()
    }
  }, [])
}
