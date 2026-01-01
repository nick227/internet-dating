type Props = {
  title?: string
  subtitle?: string
}

export function PostContentModalHeader({
  title = 'Create Post',
  subtitle = 'Posting to Feed',
}: Props) {
  return (
    <div className="modal__header">
      <div style={{ fontSize: 'var(--fs-5)', fontWeight: 700 }}>{title}</div>
      <div className="u-muted" style={{ fontSize: 'var(--fs-2)' }}>
        {subtitle}
      </div>
    </div>
  )
}
