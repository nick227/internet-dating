import { useState } from 'react'
import type { Id } from '../../api/types'
import { ActionBar } from '../actions/ActionBar'
import { Toast } from '../ui/Toast'

export function ProfileActions({ userId }: { userId: Id }) {
  const [toast, setToast] = useState<string | null>(null)

  return (
    <>
      <Toast message={toast} onClose={() => setToast(null)} />
      <div className="u-glass profile__card">
        <ActionBar userId={userId} onToast={setToast} />
        <div className="u-muted u-mt-4" style={{ fontSize: 'var(--fs-2)' }}>
          Next: swipe gestures, haptics (mobile), shared-element transitions.
        </div>
      </div>
    </>
  )
}
