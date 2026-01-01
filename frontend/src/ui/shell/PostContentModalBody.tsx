import { useMemo } from 'react'
import type { RefObject } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { SmartTextarea, type DetectedMedia } from '../form/SmartTextarea'
import { TagInput } from '../form/TagInput'
import type { FileWithPreview, LinkPreviewState, UploadProgress } from './postComposerState'

type ProgressMeta = {
  completed: number
  totalProgress: number
  hasErrors: boolean
}

type Props = {
  text: string
  onTextChange: (value: string) => void
  onDetectMedia: (items: DetectedMedia[]) => void
  textInputRef: RefObject<HTMLDivElement>
  maxTextLength: number
  visibility: 'PUBLIC' | 'PRIVATE'
  busy: boolean
  onVisibilityChange: (visibility: 'PUBLIC' | 'PRIVATE') => void
  files: FileWithPreview[]
  uploadProgress: Record<string, UploadProgress>
  progressMeta: ProgressMeta
  onRemoveFile: (id: string) => void
  onReorderFile: (fromIndex: number, toIndex: number) => void
  tags: string[]
  onTagsChange: (tags: string[]) => void
  tagSuggestions: string[]
  linkPreviews: Record<string, LinkPreviewState>
  capturing: 'camera' | 'audio' | null
  onCaptureCamera: () => void
  onCaptureAudio: () => void
  onClearFiles: () => void
  onRetryUpload: () => void
  isOnline: boolean
  fileRef: RefObject<HTMLInputElement>
  acceptedTypes: string
  onFilesSelected: (files: File[]) => void
  detectedCount: number
}

export function PostContentModalBody({
  text,
  onTextChange,
  onDetectMedia,
  textInputRef,
  maxTextLength,
  visibility,
  busy,
  onVisibilityChange,
  files,
  uploadProgress,
  progressMeta,
  onRemoveFile,
  onReorderFile,
  tags,
  onTagsChange,
  tagSuggestions,
  linkPreviews,
  capturing,
  onCaptureCamera,
  onCaptureAudio,
  onClearFiles,
  onRetryUpload,
  isOnline,
  fileRef,
  acceptedTypes,
  onFilesSelected,
  detectedCount,
}: Props) {
  const linkPreviewStatus = useMemo(() => {
    const values = Object.values(linkPreviews)
    const isLoading = values.some(value => value.loading)
    const hasFailures = values.some(value => !value.loading && !value.preview)
    return { isLoading, hasFailures }
  }, [linkPreviews])

  return (
    <div className="modal__body">
      <SmartTextarea
        value={text}
        onChange={onTextChange}
        placeholder="What's on your mind?"
        maxLength={maxTextLength}
        inputRef={textInputRef}
        inputTestId="post-content-text"
        onDetectMedia={onDetectMedia}
        replaceOnDetect={false}
      />

      <VisibilityToggle
        visibility={visibility}
        busy={busy}
        onVisibilityChange={onVisibilityChange}
      />

      <MediaPreview
        files={files}
        uploadProgress={uploadProgress}
        progressMeta={progressMeta}
        busy={busy}
        onRemoveFile={onRemoveFile}
        onReorderFile={onReorderFile}
      />

      <TagSection tags={tags} onTagsChange={onTagsChange} tagSuggestions={tagSuggestions} />

      <LinkPreviewList linkPreviews={linkPreviews} linkPreviewStatus={linkPreviewStatus} />

      <UploadControls
        busy={busy}
        capturing={capturing}
        filesCount={files.length}
        onCaptureCamera={onCaptureCamera}
        onCaptureAudio={onCaptureAudio}
        onClearFiles={onClearFiles}
        onRetryUpload={onRetryUpload}
        isOnline={isOnline}
        hasUploadErrors={progressMeta.hasErrors}
        onOpenFileDialog={() => fileRef.current?.click()}
      />

      {detectedCount > 0 && (
        <div className="profile__meta" style={{ fontSize: 'var(--fs-2)' }}>
          Detected {detectedCount} link{detectedCount > 1 ? 's' : ''}. Embeds coming soon.
        </div>
      )}
      <div className="profile__meta" style={{ fontSize: 'var(--fs-2)' }}>
        Tip: Press Cmd/Ctrl+Enter to post.
      </div>

      <input
        ref={fileRef}
        className="srOnly"
        type="file"
        accept={acceptedTypes}
        multiple
        data-testid="post-content-file-input"
        aria-label="Upload images, videos, or audio"
        onChange={event => {
          const list = Array.from(event.currentTarget.files ?? [])
          event.currentTarget.value = ''
          if (list.length) {
            onFilesSelected(list)
          }
        }}
      />
    </div>
  )
}

type VisibilityProps = {
  visibility: 'PUBLIC' | 'PRIVATE'
  busy: boolean
  onVisibilityChange: (visibility: 'PUBLIC' | 'PRIVATE') => void
}

function VisibilityToggle({ visibility, busy, onVisibilityChange }: VisibilityProps) {
  return (
    <div className="u-row u-gap-3" style={{ alignItems: 'center' }}>
      <label style={{ fontSize: 'var(--fs-2)', color: 'var(--muted)' }}>Visibility:</label>
      <div className="u-row u-gap-2">
        <button
          className={`topBar__btn ${visibility === 'PUBLIC' ? 'topBar__btn--primary' : ''}`}
          type="button"
          onClick={() => onVisibilityChange('PUBLIC')}
          disabled={busy}
          data-testid="post-content-visibility-public"
        >
          Public
        </button>
        <button
          className={`topBar__btn ${visibility === 'PRIVATE' ? 'topBar__btn--primary' : ''}`}
          type="button"
          onClick={() => onVisibilityChange('PRIVATE')}
          disabled={busy}
          data-testid="post-content-visibility-private"
        >
          Private
        </button>
      </div>
      <span className="profile__meta" style={{ fontSize: 'var(--fs-1)' }}>
        {visibility === 'PUBLIC' ? 'Visible to everyone' : 'Only you'}
      </span>
    </div>
  )
}

type MediaPreviewProps = {
  files: FileWithPreview[]
  uploadProgress: Record<string, UploadProgress>
  progressMeta: ProgressMeta
  busy: boolean
  onRemoveFile: (id: string) => void
  onReorderFile: (fromIndex: number, toIndex: number) => void
}

function MediaPreview({
  files,
  uploadProgress,
  progressMeta,
  busy,
  onRemoveFile,
  onReorderFile,
}: MediaPreviewProps) {
  if (files.length === 0) return null

  return (
    <div className="u-stack" style={{ gap: 'var(--s-2)' }}>
      <div className="srOnly" role="status" aria-live="polite" aria-atomic="true">
        Uploading {progressMeta.completed} of {files.length} files. Overall{' '}
        {progressMeta.totalProgress}% complete.
      </div>
      <div className="profile__postMedia u-hide-scroll" style={{ display: 'flex', gap: 'var(--s-2)' }}>
        {files.map((fileWithPreview, index) => {
          const progress = uploadProgress[fileWithPreview.id]
          const isUploading = progress?.status === 'uploading'
          const isError = progress?.status === 'error'
          return (
            <div
              key={fileWithPreview.id}
              className="profile__postMediaThumb u-relative"
              style={{ position: 'relative' }}
            >
              <img
                src={fileWithPreview.preview}
                alt={`Preview ${index + 1}`}
                loading="lazy"
                style={{
                  width: '120px',
                  height: '160px',
                  objectFit: 'cover',
                  borderRadius: 'var(--r-3)',
                }}
              />
              {!busy && (
                <button
                  className="mediaDeleteBtn"
                  type="button"
                  onClick={() => onRemoveFile(fileWithPreview.id)}
                  aria-label="Remove media"
                >
                  X
                </button>
              )}
              {index > 0 && !busy && (
                <button
                  className="topBar__btn"
                  type="button"
                  onClick={() => onReorderFile(index, index - 1)}
                  style={{
                    position: 'absolute',
                    left: '4px',
                    top: '4px',
                    padding: '4px 8px',
                    fontSize: 'var(--fs-1)',
                  }}
                  aria-label="Move left"
                  onKeyDown={event => onReorderKey(event, 'ArrowLeft', () => onReorderFile(index, index - 1))}
                >
                  &lt;
                </button>
              )}
              {index < files.length - 1 && !busy && (
                <button
                  className="topBar__btn"
                  type="button"
                  onClick={() => onReorderFile(index, index + 1)}
                  style={{
                    position: 'absolute',
                    right: '4px',
                    top: '4px',
                    padding: '4px 8px',
                    fontSize: 'var(--fs-1)',
                  }}
                  aria-label="Move right"
                  onKeyDown={event => onReorderKey(event, 'ArrowRight', () => onReorderFile(index, index + 1))}
                >
                  &gt;
                </button>
              )}
              {isUploading && progress && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: 'rgba(0,0,0,0.7)',
                    padding: '4px',
                    fontSize: 'var(--fs-1)',
                  }}
                >
                  Uploading... {Math.round(progress.progress)}%
                </div>
              )}
              {isError && progress?.error && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: 'rgba(251,113,133,0.9)',
                    padding: '4px',
                    fontSize: 'var(--fs-1)',
                    color: 'white',
                  }}
                >
                  Error: {progress.error}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

type TagSectionProps = {
  tags: string[]
  onTagsChange: (tags: string[]) => void
  tagSuggestions: string[]
}

function TagSection({ tags, onTagsChange, tagSuggestions }: TagSectionProps) {
  return (
    <div className="u-stack" style={{ gap: 'var(--s-2)' }}>
      <label style={{ fontSize: 'var(--fs-2)', color: 'var(--muted)' }}>Tags (optional):</label>
      <TagInput
        value={tags}
        onChange={onTagsChange}
        placeholder="Add tags..."
        maxTags={5}
        suggestions={tagSuggestions}
        testId="post-content-tags"
        inputTestId="post-content-tags-input"
      />
    </div>
  )
}

type LinkPreviewStatus = {
  isLoading: boolean
  hasFailures: boolean
}

type LinkPreviewListProps = {
  linkPreviews: Record<string, LinkPreviewState>
  linkPreviewStatus: LinkPreviewStatus
}

function LinkPreviewList({ linkPreviews, linkPreviewStatus }: LinkPreviewListProps) {
  return (
    <>
      {Object.values(linkPreviews).map(state => {
        if (!state.preview) return null
        return (
          <div
            key={state.url}
            className="u-glass"
            style={{ padding: 'var(--s-3)', borderRadius: 'var(--r-3)' }}
          >
            {state.preview.type === 'youtube' && state.preview.image && (
              <div className="u-stack" style={{ gap: 'var(--s-2)' }}>
                <img
                  src={state.preview.image}
                  alt="YouTube thumbnail"
                  style={{ width: '100%', borderRadius: 'var(--r-2)' }}
                />
                <div>
                  <div style={{ fontSize: 'var(--fs-3)', fontWeight: 600 }}>
                    {state.preview.title}
                  </div>
                  <div className="profile__meta" style={{ fontSize: 'var(--fs-2)' }}>
                    {state.preview.siteName}
                  </div>
                </div>
              </div>
            )}
            {state.preview.type === 'image' && state.preview.image && (
              <img
                src={state.preview.image}
                alt="Link preview"
                style={{ width: '100%', borderRadius: 'var(--r-2)' }}
              />
            )}
            {state.preview.type === 'website' && (
              <div className="u-stack" style={{ gap: 'var(--s-1)' }}>
                {state.preview.title && (
                  <div style={{ fontSize: 'var(--fs-3)', fontWeight: 600 }}>
                    {state.preview.title}
                  </div>
                )}
                {state.preview.description && (
                  <div className="profile__meta" style={{ fontSize: 'var(--fs-2)' }}>
                    {state.preview.description}
                  </div>
                )}
                {state.preview.siteName && (
                  <div className="profile__meta" style={{ fontSize: 'var(--fs-1)' }}>
                    {state.preview.siteName}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
      {linkPreviewStatus.isLoading && (
        <div className="profile__meta" style={{ fontSize: 'var(--fs-2)' }}>
          Loading link previews...
        </div>
      )}
      {linkPreviewStatus.hasFailures && !linkPreviewStatus.isLoading && (
        <div className="profile__meta" style={{ fontSize: 'var(--fs-2)' }}>
          Some link previews could not be loaded.
        </div>
      )}
    </>
  )
}

type UploadControlsProps = {
  busy: boolean
  capturing: 'camera' | 'audio' | null
  filesCount: number
  onCaptureCamera: () => void
  onCaptureAudio: () => void
  onClearFiles: () => void
  onRetryUpload: () => void
  isOnline: boolean
  hasUploadErrors: boolean
  onOpenFileDialog: () => void
}

function UploadControls({
  busy,
  capturing,
  filesCount,
  onCaptureCamera,
  onCaptureAudio,
  onClearFiles,
  onRetryUpload,
  isOnline,
  hasUploadErrors,
  onOpenFileDialog,
}: UploadControlsProps) {
  return (
    <div className="u-row u-gap-3 u-wrap">
      <button
        className="topBar__btn"
        type="button"
        onClick={onOpenFileDialog}
        disabled={busy}
        data-testid="post-content-add-media"
      >
        Upload Media
      </button>
      <button
        className="topBar__btn"
        type="button"
        onClick={onCaptureCamera}
        disabled={busy || capturing === 'camera'}
        data-testid="post-content-capture-photo"
      >
        {capturing === 'camera' ? 'Capturing...' : 'Use Camera'}
      </button>
      <button
        className="topBar__btn"
        type="button"
        onClick={onCaptureAudio}
        disabled={busy || capturing === 'audio'}
        data-testid="post-content-capture-audio"
      >
        {capturing === 'audio' ? 'Recording...' : 'Record Audio'}
      </button>
      {filesCount > 0 && (
        <button
          className="topBar__btn"
          type="button"
          onClick={onClearFiles}
          disabled={busy}
          data-testid="post-content-clear-media"
        >
          Clear all ({filesCount})
        </button>
      )}
      {hasUploadErrors && (
        <button
          className="topBar__btn"
          type="button"
          onClick={onRetryUpload}
          disabled={busy || !isOnline}
          data-testid="post-content-retry"
        >
          Retry upload
        </button>
      )}
    </div>
  )
}

function onReorderKey(
  event: ReactKeyboardEvent<HTMLButtonElement>,
  key: 'ArrowLeft' | 'ArrowRight',
  action: () => void
) {
  if (event.key === key) {
    event.preventDefault()
    action()
  }
}
