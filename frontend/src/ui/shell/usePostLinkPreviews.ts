import { useEffect, useRef } from 'react'
import type { Dispatch } from 'react'
import type { DetectedMedia } from '../form/SmartTextarea'
import { fetchLinkPreview } from '../../core/media/linkPreview'
import type { LinkPreviewState, PostComposerAction } from './postComposerState'

type Options = {
  detected: DetectedMedia[]
  linkPreviews: Record<string, LinkPreviewState>
  dispatch: Dispatch<PostComposerAction>
}

export function usePostLinkPreviews({ detected, linkPreviews, dispatch }: Options) {
  const previewsRef = useRef(linkPreviews)
  const controllersRef = useRef<Map<string, AbortController>>(new Map())

  useEffect(() => {
    previewsRef.current = linkPreviews
  }, [linkPreviews])

  useEffect(() => {
    const current = previewsRef.current
    const activeUrls = new Set(detected.map(item => item.url))
    const controllers = controllersRef.current

    controllers.forEach((controller, url) => {
      if (!activeUrls.has(url)) {
        controller.abort()
        controllers.delete(url)
      }
    })

    const pending = detected.filter(item => !current[item.url] && !controllers.has(item.url))

    pending.forEach(item => {
      const controller = new AbortController()
      controllers.set(item.url, controller)
      dispatch({ type: 'linkPreviewStart', url: item.url })
      fetchLinkPreview(item.url, controller.signal)
        .then(preview => {
          if (controller.signal.aborted) return
          dispatch({ type: 'linkPreviewSuccess', url: item.url, preview })
        })
        .catch(() => {
          if (controller.signal.aborted) return
          dispatch({ type: 'linkPreviewFailure', url: item.url })
        })
        .finally(() => {
          controllers.delete(item.url)
        })
    })

  }, [detected, dispatch])

  useEffect(() => {
    const controllers = controllersRef
    return () => {
      controllers.current.forEach(controller => controller.abort())
      controllers.current.clear()
    }
  }, [])
}
