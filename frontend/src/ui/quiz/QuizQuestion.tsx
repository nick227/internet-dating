import { QuizQuestion as IQuizQuestion } from './types'

interface QuizQuestionProps {
  question: IQuizQuestion
  selectedValue?: string
  onSelect: (value: string) => void
}

export function QuizQuestion({ question, selectedValue, onSelect }: QuizQuestionProps) {
  return (
    <>
      {question.options.map((opt, idx) => {
        const active = selectedValue === opt.value
        const letter = String.fromCharCode(65 + idx) // A, B, C...

        return (
          <button
            key={String(opt.id)}
            type="button"
            className={`quiz-option-btn${active ? ' quiz-option-btn--selected' : ''}`}
            onClick={() => onSelect(opt.value)}
          >
            <span style={{ opacity: 0.5, marginRight: '12px', fontWeight: 400 }}>{letter}</span>
            {opt.label}
          </button>
        )
      })}
    </>
  )
}
