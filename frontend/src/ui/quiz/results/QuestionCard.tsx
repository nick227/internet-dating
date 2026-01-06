import type { QuestionResult } from './types'
import { AnswerComparison } from './AnswerComparison'

type Props = {
  question: QuestionResult
}

export function QuestionCard({ question }: Props) {
  const { questionPrompt, userSelectedAnswer } = question

  return (
    <div className="question-card">
      <h6 className="question-card-title">{questionPrompt}</h6>
      
      <div className="question-card-answer">
        <div className="question-card-answer-label">{userSelectedAnswer.optionLabel}</div>
        
        {Object.keys(userSelectedAnswer.traitValues).length > 0 && (
          <div className="question-card-traits">
            {Object.entries(userSelectedAnswer.traitValues)
              .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a)) // Sort by absolute value
              .slice(0, 30) // Show top 30 traits only
              .map(([key, value]) => (
                <div key={key} className="trait-item">
                  <span className="trait-key">{key}</span>
                  <span className="trait-value">{value > 0 ? '+' : ''}{value}</span>
                </div>
              ))}
            {Object.keys(userSelectedAnswer.traitValues).length > 30 && (
              <div className="trait-more u-muted">
                +{Object.keys(userSelectedAnswer.traitValues).length - 30} more
              </div>
            )}
          </div>
        )}
      </div>

      <AnswerComparison percentages={userSelectedAnswer.percentages} />
    </div>
  )
}
