type Props = {
  busy: boolean
  isSubmitDisabled: boolean
  onCancel: () => void
  onSubmit: () => void
}

export function PostContentModalActions({ busy, isSubmitDisabled, onCancel, onSubmit }: Props) {
  return (
    <div className="modal__actions">
      <button
        className="actionBtn actionBtn--nope"
        type="button"
        onClick={onCancel}
        disabled={busy}
        data-testid="post-content-cancel"
      >
        Cancel
      </button>
      <button
        className="actionBtn actionBtn--like"
        type="button"
        onClick={onSubmit}
        disabled={isSubmitDisabled}
        data-testid="post-content-submit"
      >
        {busy ? 'Posting...' : 'Post'}
      </button>
    </div>
  )
}
