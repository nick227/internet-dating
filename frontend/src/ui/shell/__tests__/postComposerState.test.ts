import { describe, it, expect } from 'vitest'
import {
  initialPostComposerState,
  postComposerReducer,
  type PostComposerState,
} from '../postComposerState'

describe('postComposerReducer', () => {
  it('restores draft data without overriding files', () => {
    const state: PostComposerState = {
      ...initialPostComposerState,
      files: [{ id: '1', preview: 'blob:1', file: {} as File }],
    }

    const next = postComposerReducer(state, {
      type: 'restoreDraft',
      value: {
        text: 'Draft text',
        fileIds: ['1'],
        visibility: 'PRIVATE',
        tags: ['travel'],
        timestamp: Date.now(),
      },
    })

    expect(next.text).toBe('Draft text')
    expect(next.visibility).toBe('PRIVATE')
    expect(next.tags).toEqual(['travel'])
    expect(next.files).toHaveLength(1)
  })

  it('removes file and clears its upload progress', () => {
    const state: PostComposerState = {
      ...initialPostComposerState,
      files: [
        { id: 'keep', preview: 'blob:keep', file: {} as File },
        { id: 'drop', preview: 'blob:drop', file: {} as File },
      ],
      uploadProgress: {
        keep: { fileId: 'keep', progress: 100, status: 'complete' },
        drop: { fileId: 'drop', progress: 10, status: 'uploading' },
      },
    }

    const next = postComposerReducer(state, { type: 'removeFile', value: 'drop' })

    expect(next.files.map(file => file.id)).toEqual(['keep'])
    expect(next.uploadProgress.drop).toBeUndefined()
    expect(next.uploadProgress.keep).toBeDefined()
  })

  it('resets to initial state', () => {
    const dirtyState: PostComposerState = {
      ...initialPostComposerState,
      text: 'Hello',
      busy: true,
      visibility: 'PRIVATE',
    }

    const next = postComposerReducer(dirtyState, { type: 'reset' })

    expect(next).toEqual(initialPostComposerState)
  })
})
