import { useCallback, useMemo, useState } from 'react'
import type { Id, SwipeAction } from '../../api/types'
import { useLike } from '../../core/actions/useLike'
import { useRate } from '../../core/actions/useRate'
import { useStoredReaction } from '../../core/actions/useStoredReaction'
import { RatingModal, RatingValues } from './RatingModal'

type ToastHandler = (message: string) => void

type ActionBarProps = {
  userId: Id
  onToast?: ToastHandler
}

const DEFAULT_RATING: RatingValues = {
  attractive: 3,
  smart: 3,
  funny: 3,
  interesting: 3
}

const toApiScore = (value: number) => Math.min(10, Math.max(1, value * 2))

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'string') return error
  if (error instanceof Error && error.message) return error.message
  return fallback
}

export function ActionBar({ userId, onToast }: ActionBarProps) {
  const { send: sendLike } = useLike()
  const { submit: submitRate } = useRate(userId)
  const { reaction, setReaction } = useStoredReaction(userId)
  const [ratingOpen, setRatingOpen] = useState(false)
  const [ratingValues, setRatingValues] = useState<RatingValues>(DEFAULT_RATING)
  const [ratingSaving, setRatingSaving] = useState(false)

  const notify = useCallback((message: string) => {
    onToast?.(message)
  }, [onToast])

  const handleSwipe = useCallback(
    async (next: SwipeAction) => {
      setReaction(next)
      notify(next === 'LIKE' ? 'Liked' : 'Passed')
      try {
        await sendLike(userId, next)
      } catch (e: unknown) {
        notify(getErrorMessage(e, 'Saved locally, sync failed'))
      }
    },
    [notify, sendLike, setReaction, userId]
  )

  const handleRate = useCallback(() => {
    setRatingOpen(true)
  }, [])

  const handleRateChange = useCallback((key: keyof RatingValues, value: number) => {
    setRatingValues((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleRateSubmit = useCallback(async () => {
    setRatingSaving(true)
    try {
      await submitRate({
        attractive: toApiScore(ratingValues.attractive),
        smart: toApiScore(ratingValues.smart),
        funny: toApiScore(ratingValues.funny),
        interesting: toApiScore(ratingValues.interesting)
      })
      notify('Rated')
      setRatingOpen(false)
    } catch (e: unknown) {
      notify(getErrorMessage(e, 'Rating failed'))
    } finally {
      setRatingSaving(false)
    }
  }, [notify, ratingValues, submitRate])

  const likeActive = reaction === 'LIKE'
  const passActive = reaction === 'PASS'
  const rateActive = ratingOpen

  const actionClass = useMemo(
    () => ({
      like: 'actionBtn actionBtn--like' + (likeActive ? ' actionBtn--active' : ''),
      pass: 'actionBtn actionBtn--nope' + (passActive ? ' actionBtn--active' : ''),
      rate: 'actionBtn actionBtn--rate' + (rateActive ? ' actionBtn--active' : '')
    }),
    [likeActive, passActive, rateActive]
  )

  return (
    <>
      <div className="actionBar">
        <button className={actionClass.pass} type="button" onClick={() => handleSwipe('PASS')}>
          <svg className="actionBtn__icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span>Pass</span>
        </button>
        <button className={actionClass.rate} type="button" onClick={handleRate}>
          <svg className="actionBtn__icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 2l2.8 5.6L21 8.4l-4.5 4.4 1.1 6.2L12 16.6 6.4 19l1.1-6.2L3 8.4l6.2-.8z"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
          <span>Rate</span>
        </button>
        <button className={actionClass.like} type="button" onClick={() => handleSwipe('LIKE')}>
          <svg className="actionBtn__icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 20s-7-4.3-7-9a4.5 4.5 0 0 1 7-3.8A4.5 4.5 0 0 1 19 11c0 4.7-7 9-7 9z"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
          <span>Like</span>
        </button>
      </div>

      <RatingModal
        open={ratingOpen}
        values={ratingValues}
        submitting={ratingSaving}
        onClose={() => setRatingOpen(false)}
        onChange={handleRateChange}
        onSubmit={handleRateSubmit}
      />
    </>
  )
}
