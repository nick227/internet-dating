import { useNavigate } from 'react-router-dom'
import { PortalItemFrame } from '../personality-portal/PortalItemFrame'
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
    <PortalItemFrame
      className="quiz-card"
      intent="navigable"
      accent
      onClick={() => nav(`/personality/quizzes/${quiz.id}`)}
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
        <div className="quiz-card__header-row">
            <div className="quiz-card__title portal-item__title">{quiz.title}</div>
            <div className="portal-item__meta">
              <span 
                className={`quiz-badge${quiz.status === 'in_progress' 
                  ? ' quiz-badge--in-progress' 
                  : quiz.status === 'completed' 
                  ? ' quiz-badge--completed' 
                  : ' quiz-badge--new'}`}
              >
                {statusLabel[quiz.status || 'new']}
              </span>
            </div>
        </div>
      </div>
      
      {quiz.description && (
        <div className="quiz-card__description portal-item__secondary">
          {quiz.description}
        </div>
      )}

      <div className="quiz-card__meta-row portal-item__meta-row">
        {quiz.tags?.map(tag => (
          <span key={tag.slug} className="badge badge--neutral quiz-card__tag portal-item__meta-pill">
            {tag.label}
          </span>
        ))}
      </div>

      <div className="quiz-card__footer portal-item__footer">
         <span className="portal-item__footer-text">{quiz.questionCount} Questions</span>
         {quiz.status === 'completed' && quiz.result ? (
            <span className="portal-item__footer-text portal-item__footer-text--accent">{quiz.result}</span>
         ) : (
            <span className="portal-item__footer-spacer" />
         )}
      </div>
    </PortalItemFrame>
  )
}
