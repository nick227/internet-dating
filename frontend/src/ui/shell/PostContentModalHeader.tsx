type Props = {
  title?: string
  subtitle?: string
  onCancel?: () => void
}

export function PostContentModalHeader({
  title = 'Create Post',
  onCancel,
}: Props) {
  return (
    <div className="modal__header">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s-2)' }}>
        <h2>{title}</h2>
        {onCancel && (
          <button className="btn btn-small" type="button" onClick={onCancel}>
            x
          </button>
        )}
      </div>
    </div>
  )
}
