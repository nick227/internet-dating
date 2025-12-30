import { useCallback } from 'react'
import type { FeedCard } from '../../api/types'

type RiverCardQuestionProps = {
  question?: FeedCard['question']
  onAnswer?: (value: string) => void
  selected?: string | null
}

export function RiverCardQuestion({ question, onAnswer, selected }: RiverCardQuestionProps) {
  const prompt = question?.prompt
  const options = question?.options ?? []
  const handleAnswer = useCallback(
    (value: string) => {
      if (selected === value) return
      onAnswer?.(value)
    },
    [onAnswer, selected]
  )

  if (!prompt || !options.length) return null

  return (
    <div className="riverCard__question" onClick={stopPropagation} onKeyDown={stopPropagation}>
      <div className="riverCard__questionPrompt">{prompt}</div>
      <div className="riverCard__questionOptions">
        {options.map(option => (
          <button
            key={option.id}
            className={`riverCard__questionOption${selected === option.value ? ' riverCard__questionOption--active' : ''}`}
            type="button"
            onClick={() => handleAnswer(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function stopPropagation(event: { stopPropagation: () => void }) {
  event.stopPropagation()
}
