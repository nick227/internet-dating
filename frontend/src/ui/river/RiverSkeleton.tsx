export function RiverSkeleton() {
  return (
    <div className="riverCard" aria-hidden="true" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.06)' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(255,255,255,.05), rgba(255,255,255,.08), rgba(255,255,255,.05))', opacity: .4, transform: 'translateX(-40%)', animation: 'shimmer 1.2s infinite' }} />
      <style>{`@keyframes shimmer{0%{transform:translateX(-40%)}100%{transform:translateX(40%)}}`}</style>
    </div>
  )
}
