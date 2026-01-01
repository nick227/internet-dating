import { useNavigate } from 'react-router-dom'
import { QuizListItem } from './types'

interface QuizCardProps {
  quiz: QuizListItem
}

export function QuizCard({ quiz }: QuizCardProps) {
  const nav = useNavigate()
  
  const statusLabel = {
    new: 'New',
    in_progress: `Resume (${quiz.progress}%)`,
    completed: quiz.result ? `Result: ${quiz.result}` : 'Completed',
  }

  return (
    <div 
      className="u-glass u-pad-4 u-mt-4 quiz-card" 
      onClick={() => nav(`/quiz?id=${quiz.id}`)}
    >
      {quiz.status === 'in_progress' && (
        <div className="quiz-progress-track">
          <div 
            className="quiz-progress-bar"
            style={{ width: `${quiz.progress}%` }} 
          />
        </div>
      )}

      <div className="quiz-card__header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
            <div className="quiz-card__title">{quiz.title}</div>
            <div 
            className={`quiz-badge${quiz.status === 'in_progress' 
                ? ' quiz-badge--in-progress' 
                : quiz.status === 'completed' 
                ? ' quiz-badge--completed' 
                : ' quiz-badge--new'}`}
            >
            {statusLabel[quiz.status || 'new']}
            </div>
        </div>
      </div>
      
      {quiz.description && (
        <div className="quiz-card__description">
          {quiz.description}
        </div>
      )}

      <div className="quiz-card__meta-row">
        {quiz.tags?.map(tag => (
          <span key={tag.slug} className="badge badge--neutral" style={{ fontSize: '10px', padding: '2px 6px' }}>
            {tag.label}
          </span>
        ))}
      </div>

      <div className="quiz-card__footer">
         <span>{quiz.questionCount} Questions</span>
         {quiz.status === 'completed' && quiz.result && (
            <span style={{ color: 'var(--color-success)' }}>{quiz.result}</span>
         )}
      </div>
    </div>
  )
}
