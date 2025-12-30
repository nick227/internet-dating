import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Id, LikeAction, RatingScores } from '../../api/types'
import { useLike } from '../../core/actions/useLike'
import { useRate } from '../../core/actions/useRate'
import { useStoredReaction } from '../../core/actions/useStoredReaction'
import { RatingModal, type RatingValues } from './RatingModal'
import { getErrorMessage } from '../../core/utils/errors'

type ToastHandler = (message: string) => void

type ActionBarProps = {
  userId: Id
  onToast?: ToastHandler
  initialRating?: RatingScores | null
  onRated?: (values: RatingScores) => void
  onComment?: () => void
  commentLabel?: string
}

const DEFAULT_RATING: RatingValues = {
  attractive: 3,
  smart: 3,
  funny: 3,
  interesting: 3,
}

const toApiScore = (value: number) => Math.min(10, Math.max(1, value * 2))
const fromApiScore = (value: number) => Math.min(5, Math.max(1, Math.round(value / 2)))

export function ActionBar({
  userId,
  onToast,
  initialRating,
  onRated,
  onComment,
  commentLabel,
}: ActionBarProps) {
  const { send: sendLike } = useLike()
  const { submit: submitRate } = useRate(userId)
  const { reaction, setReaction } = useStoredReaction(userId)
  const [ratingOpen, setRatingOpen] = useState(false)
  const [ratingValues, setRatingValues] = useState<RatingValues>(() => toUiRating(initialRating))
  const [ratingSaving, setRatingSaving] = useState(false)

  const notify = useCallback(
    (message: string) => {
      onToast?.(message)
    },
    [onToast]
  )

  const handleReaction = useCallback(
    async (next: LikeAction) => {
      setReaction(next)
      notify(next === 'LIKE' ? 'Liked' : 'Disliked')
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
    setRatingValues(prev => ({ ...prev, [key]: value }))
  }, [])

  useEffect(() => {
    if (ratingOpen) return
    setRatingValues(toUiRating(initialRating))
  }, [initialRating, ratingOpen])

  const handleRateSubmit = useCallback(async () => {
    setRatingSaving(true)
    try {
      const payload = toApiRating(ratingValues)
      await submitRate(payload)
      notify('Rated')
      onRated?.(payload)
      setRatingOpen(false)
    } catch (e: unknown) {
      notify(getErrorMessage(e, 'Rating failed'))
    } finally {
      setRatingSaving(false)
    }
  }, [notify, onRated, ratingValues, submitRate])

  const likeActive = reaction === 'LIKE'
  const dislikeActive = reaction === 'DISLIKE'
  const rateActive = ratingOpen
  const commentEnabled = Boolean(onComment)

  const actionClass = useMemo(
    () => ({
      like: 'actionBtn actionBtn--like' + (likeActive ? ' actionBtn--active' : ''),
      pass: 'actionBtn actionBtn--nope' + (dislikeActive ? ' actionBtn--active' : ''),
      rate: 'actionBtn actionBtn--rate' + (rateActive ? ' actionBtn--active' : ''),
      comment: 'actionBtn actionBtn--comment',
    }),
    [likeActive, dislikeActive, rateActive]
  )

  return (
    <>
      <div className="actionBar">
        <button
          className={actionClass.pass}
          type="button"
          onClick={() => handleReaction('DISLIKE')}
        >
          <svg className="actionBtn__icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span>Dislike</span>
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
        {commentEnabled && (
          <button className={actionClass.comment} type="button" onClick={onComment}>
            <svg className="actionBtn__icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M6 17l-2 4 4-2h10a4 4 0 0 0 4-4V8a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v5a4 4 0 0 0 4 4z"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
            <span>{commentLabel ?? 'Comment'}</span>
          </button>
        )}
        <button className={actionClass.like} type="button" onClick={() => handleReaction('LIKE')}>
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

function toUiRating(values?: RatingScores | null): RatingValues {
  if (!values) return DEFAULT_RATING
  return {
    attractive: fromApiScore(values.attractive),
    smart: fromApiScore(values.smart),
    funny: fromApiScore(values.funny),
    interesting: fromApiScore(values.interesting),
  }
}

function toApiRating(values: RatingValues): RatingScores {
  return {
    attractive: toApiScore(values.attractive),
    smart: toApiScore(values.smart),
    funny: toApiScore(values.funny),
    interesting: toApiScore(values.interesting),
  }
}
