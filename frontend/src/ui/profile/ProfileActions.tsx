import { useState } from 'react'
import type { Id, RatingScores } from '../../api/types'
import { ActionBar } from '../actions/ActionBar'
import { Toast } from '../ui/Toast'

export function ProfileActions({
  userId,
  initialRating,
  onRated,
}: {
  userId: Id
  initialRating?: RatingScores | null
  onRated?: (rating: RatingScores) => void
}) {
  const [toast, setToast] = useState<string | null>(null)

  return (
    <>
      <Toast message={toast} onClose={() => setToast(null)} />
      <div className="u-glass profile__card">
        <ActionBar
          userId={userId}
          onToast={setToast}
          initialRating={initialRating ?? null}
          onRated={onRated}
        />
      </div>
    </>
  )
}
