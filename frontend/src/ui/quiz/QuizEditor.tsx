import { InlineField } from '../form/InlineField'
import { InlineTextarea } from '../form/InlineTextarea'
import { Quiz, QuizQuestion } from './types'

interface QuizEditorProps {
  quiz: Quiz
  question: QuizQuestion
  step: number
  onUpdateTitle: (title: string) => Promise<void>
  onUpdatePrompt: (qid: string | number, prompt: string) => Promise<void>
  onUpdateOption: (qid: string | number, oid: string | number, label: string) => Promise<void>
}

export function QuizEditor({
  quiz,
  question,
  step,
  onUpdateTitle,
  onUpdatePrompt,
  onUpdateOption,
}: QuizEditorProps) {
  return (
    <div className="u-stack">
      <InlineField
        label="Quiz title"
        value={quiz.title}
        onSave={async (value) => {
          if (!value) return
          await onUpdateTitle(value)
        }}
      />
      <InlineTextarea
        label={`Question ${step + 1}`}
        value={question.prompt}
        placeholder="Question prompt"
        maxLength={220}
        onSave={async (value) => {
          if (!value) return
          await onUpdatePrompt(question.id, value)
        }}
      />
      <div className="u-stack">
        {question.options.map((opt, idx) => (
          <InlineField
            key={String(opt.id)}
            label={`Option ${idx + 1}`}
            value={opt.label}
            onSave={async (value) => {
              if (!value) return
              await onUpdateOption(question.id, opt.id, value)
            }}
          />
        ))}
      </div>
    </div>
  )
}
