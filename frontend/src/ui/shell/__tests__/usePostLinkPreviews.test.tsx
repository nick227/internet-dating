import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import type { DetectedMedia } from '../../form/SmartTextarea'
import type { LinkPreviewState } from '../postComposerState'
import { usePostLinkPreviews } from '../usePostLinkPreviews'
import * as linkPreviewModule from '../../../core/media/linkPreview'

type HarnessProps = {
  detected: DetectedMedia[]
  linkPreviews: Record<string, LinkPreviewState>
  dispatch: (action: unknown) => void
}

function HookHarness({ detected, linkPreviews, dispatch }: HarnessProps) {
  usePostLinkPreviews({ detected, linkPreviews, dispatch })
  return null
}

describe('usePostLinkPreviews', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('dispatches start and success for new link previews', async () => {
    const preview = { url: 'https://example.com', type: 'website', siteName: 'example.com' }
    const fetchSpy = vi
      .spyOn(linkPreviewModule, 'fetchLinkPreview')
      .mockResolvedValue(preview)
    const dispatch = vi.fn()

    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <HookHarness
          detected={[{ kind: 'image', url: 'https://example.com/image.jpg' }]}
          linkPreviews={{}}
          dispatch={dispatch}
        />
      )
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'linkPreviewStart',
      url: 'https://example.com/image.jpg',
    })
    expect(dispatch).toHaveBeenCalledWith({
      type: 'linkPreviewSuccess',
      url: 'https://example.com/image.jpg',
      preview,
    })

    root.unmount()
  })

  it('dispatches failure when preview fetch fails', async () => {
    const fetchSpy = vi
      .spyOn(linkPreviewModule, 'fetchLinkPreview')
      .mockRejectedValue(new Error('boom'))
    const dispatch = vi.fn()

    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <HookHarness
          detected={[{ kind: 'youtube', url: 'https://youtube.com/watch?v=abc' }]}
          linkPreviews={{}}
          dispatch={dispatch}
        />
      )
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'linkPreviewStart',
      url: 'https://youtube.com/watch?v=abc',
    })
    expect(dispatch).toHaveBeenCalledWith({
      type: 'linkPreviewFailure',
      url: 'https://youtube.com/watch?v=abc',
    })

    root.unmount()
  })
})
