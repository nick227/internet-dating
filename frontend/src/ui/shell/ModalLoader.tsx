export function ModalLoader() {
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-busy="true">
      <div className="modal__backdrop" />
      <div className="modal__panel">
        <div className="modal__body" style={{ padding: 'var(--s-6)', textAlign: 'center' }}>
          <div className="u-muted">Loading...</div>
        </div>
      </div>
    </div>
  )
}
