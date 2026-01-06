import { useParams, useNavigate } from 'react-router-dom'
import { useQuizResults } from '../quiz/results/useQuizResults'
import { QuestionCard } from '../quiz/results/QuestionCard'

export function QuizResultsPage() {
  const { quizId } = useParams<{ quizId: string }>()
  const nav = useNavigate()
  const { data, loading, error } = useQuizResults(quizId)

  if (loading) {
    return <div className="quiz-results-page u-center-text u-pad-6 u-muted">Loading results...</div>
  }

  if (error || !data) {
    return (
      <div className="quiz-results-page u-center-text u-pad-6">
        <div style={{ fontSize: 'var(--fs-3)' }}>Error loading results</div>
        <div className="u-muted u-mt-2">{error?.message ?? 'Unknown error'}</div>
        <button className="actionBtn u-mt-4" onClick={() => nav('/feed')}>
          Return Home
        </button>
      </div>
    )
  }

  return (
    <div className="quiz-results-page">
      <div className="quiz-results-header">
        <div className="u-muted">
          {data.userDemo.gender} • Age {data.userDemo.age} • {data.userDemo.city ?? 'No city'}
        </div>
      </div>
      
      <div className="quiz-results-questions">
        {data.questions.map((question) => (
          <QuestionCard key={question.questionId} question={question} />
        ))}

        <div className="quiz-results-footer">
            <p>You have completed: {data.quiz.title}</p> 
            <button className="actionBtn" onClick={() => nav('/quizzes')}>Return to Quizzes</button>
        </div>

      </div>

    </div>
  )
}
