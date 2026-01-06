import { useMemo } from 'react'
import type { RefObject } from 'react'
import { SmartTextarea, type DetectedMedia } from '../form/SmartTextarea'
import { Media } from '../ui/Media'
import { TagInput } from '../form/TagInput'
import type { FileWithPreview, LinkPreviewState, UploadProgress } from './postComposerState'
import type { FeedTarget } from './usePostFormState'

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
  feedTarget: FeedTarget
  targetUserId: string | null
  busy: boolean
  onVisibilityChange: (visibility: 'PUBLIC' | 'PRIVATE') => void
  onFeedTargetChange: (feedTarget: FeedTarget) => void
  onTargetUserIdChange: (targetUserId: string | null) => void
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
  feedTarget,
  targetUserId,
  busy,
  onVisibilityChange,
  onFeedTargetChange,
  onTargetUserIdChange,
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

      <FeedSelector
        feedTarget={feedTarget}
        targetUserId={targetUserId}
        busy={busy}
        onFeedTargetChange={onFeedTargetChange}
        onTargetUserIdChange={onTargetUserIdChange}
      />

      <VisibilityToggle
        visibility={visibility}
        busy={busy}
        onVisibilityChange={onVisibilityChange}
      />

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

type FeedSelectorProps = {
  feedTarget: FeedTarget
  targetUserId: string | null
  busy: boolean
  onFeedTargetChange: (feedTarget: FeedTarget) => void
  onTargetUserIdChange: (targetUserId: string | null) => void
}

function FeedSelector({ feedTarget, targetUserId: _targetUserId, busy, onFeedTargetChange, onTargetUserIdChange }: FeedSelectorProps) {
  return (
    <div className="u-row u-gap-3" style={{ alignItems: 'center' }}>
      <label style={{ fontSize: 'var(--fs-2)', color: 'var(--muted)' }}>Post to:</label>
      <div className="u-row u-gap-2">
        <button
          className={`topBar__btn ${feedTarget === 'profile' ? 'topBar__btn--primary' : ''}`}
          type="button"
          onClick={() => {
            onFeedTargetChange('profile')
            onTargetUserIdChange(null)
          }}
          disabled={busy}
          data-testid="post-content-feed-profile"
        >
          Profile
        </button>
        <button
          className={`topBar__btn ${feedTarget === 'main' ? 'topBar__btn--primary' : ''}`}
          type="button"
          onClick={() => {
            onFeedTargetChange('main')
            onTargetUserIdChange(null)
          }}
          disabled={busy}
          data-testid="post-content-feed-main"
        >
          Main Feed
        </button>
        <button
          className={`topBar__btn ${feedTarget === 'both' ? 'topBar__btn--primary' : ''}`}
          type="button"
          onClick={() => {
            onFeedTargetChange('both')
            onTargetUserIdChange(null)
          }}
          disabled={busy}
          data-testid="post-content-feed-both"
        >
          Both
        </button>
      </div>
      <span className="profile__meta" style={{ fontSize: 'var(--fs-1)' }}>
        {feedTarget === 'profile' && 'Your profile feed only'}
        {feedTarget === 'main' && 'Main site feed only'}
        {feedTarget === 'both' && 'Both feeds'}
      </span>
    </div>
  )
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

type MediaKind = 'image' | 'video' | 'audio' | 'unknown'

const mediaExtensionMap: Record<string, MediaKind> = {
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  gif: 'image',
  webp: 'image',
  heic: 'image',
  heif: 'image',
  mp4: 'video',
  mov: 'video',
  webm: 'video',
  ogg: 'video',
  mp3: 'audio',
  wav: 'audio',
  m4a: 'audio',
  aac: 'audio',
  oga: 'audio',
}

const getFileKind = (file: File): MediaKind => {
  const mime = file.type?.toLowerCase()
  if (mime?.startsWith('image/')) return 'image'
  if (mime?.startsWith('video/')) return 'video'
  if (mime?.startsWith('audio/')) return 'audio'
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext && mediaExtensionMap[ext]) return mediaExtensionMap[ext]
  return 'unknown'
}

type MediaPreviewItemProps = {
  item: FileWithPreview
  label: string
  isThumbnail?: boolean
}

function MediaPreviewItem({ item, label, isThumbnail = false }: MediaPreviewItemProps) {
  const kind = getFileKind(item.file)

  if (kind === 'image') {
    return (
      <Media
        src={item.preview}
        alt={label}
        type="image"
        enableViewer={false}
        overlay="light"
        className="profile__postMediaMedia"
      />
    )
  }

  if (kind === 'video') {
    return (
      <Media
        src={item.preview}
        type="video"
        enableViewer={false}
        controls
        muted={false}
        className="profile__postMediaMedia"
      />
    )
  }

  if (kind === 'audio') {
    if (isThumbnail) {
      return (
        <div className="profile__postMediaAudioThumb" aria-label={label}>
          <span className="profile__postMediaAudioIcon" aria-hidden="true">
            ♪
          </span>
          <span className="profile__postMediaAudioLabel">{item.file.name}</span>
        </div>
      )
    }
    return (
      <Media
        src={item.preview}
        alt={label}
        type="audio"
        enableViewer={false}
        controls
        className="profile__postMediaMedia"
      />
    )
  }

  return (
    <div className="profile__postMediaUnknown" aria-label={label}>
      Unsupported file
    </div>
  )
}

function MediaPreview({
  files,
  uploadProgress: _uploadProgress,
  progressMeta,
  busy: _busy,
  onRemoveFile: _onRemoveFile,
  onReorderFile: _onReorderFile,
}: MediaPreviewProps) {
  if (files.length === 0) return null
  const mainFiles = files.length > 3 ? files.slice(0, 3) : files
  const extraFiles = files.length > 3 ? files.slice(3) : []
  const layoutCount = Math.min(files.length, 3)
  return (
    <div className="u-stack upload-container" style={{ gap: 'var(--s-2)' }}>
      <div className="srOnly" role="status" aria-live="polite" aria-atomic="true">
        Uploading {progressMeta.completed} of {files.length} files. Overall{' '}
        {progressMeta.totalProgress}% complete.
      </div>
      <div
        className={`profile__postMedia profile__postMedia--count-${layoutCount}${
          extraFiles.length ? ' profile__postMedia--with-thumbs' : ''
        }`}
      >
        {mainFiles.map((fileWithPreview, index) => {
          return (
            <div
              key={fileWithPreview.id}
              className={`profile__postMediaTile profile__postMediaTile--${index + 1}`}
            >
              <MediaPreviewItem item={fileWithPreview} label={fileWithPreview.file.name} />
            </div>
          )
        })}
      </div>
      {extraFiles.length > 0 && (
        <div className="profile__postMediaThumbRow">
          {extraFiles.map(fileWithPreview => (
            <div key={fileWithPreview.id} className="profile__postMediaThumb">
              <MediaPreviewItem
                item={fileWithPreview}
                label={fileWithPreview.file.name}
                isThumbnail
              />
            </div>
          ))}
        </div>
      )}
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
    <div className="u-stack tags-container" style={{ gap: 'var(--s-2)' }}>
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
              <div className="u-stack youtube" style={{ gap: 'var(--s-2)' }}>
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

