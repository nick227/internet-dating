import { useNavigate } from 'react-router-dom'
import { QuizEditor } from '../quiz/QuizEditor'
import { QuizQuestion } from '../quiz/QuizQuestion'
import { useQuizState } from '../quiz/useQuizState'

function getDynamicFontSize(text: string): string {
  const len = text.length
  if (len < 10) return '3rem'
  if (len < 30) return '2rem'
  if (len < 60) return '1.5rem'
  return '1.1rem'
}

type QuizPageProps = {
  quizId?: string
}

export function QuizPage({ quizId }: QuizPageProps) {
  const nav = useNavigate()
  const {
    loading,
    error,
    activeQuiz,
    currentQuestion,
    currentAnswer,
    progress,
    state,
    editorEnabled,
    dispatch,
    actions,
  } = useQuizState(quizId)

  const { editMode, submitting, message } = state

  // Error State
  if (error) {
    return (
      <div className="quiz-page u-center-text u-pad-6">
        <div style={{ fontSize: 'var(--fs-3)' }}>Quiz error</div>
        <div className="u-muted u-mt-2">{error}</div>
        <button className="actionBtn u-mt-4" onClick={() => nav('/feed')}>Return Home</button>
      </div>
    )
  }

  // Loading State
  if (loading) {
     return <div className="quiz-page u-center-text u-pad-6 u-muted">Loading quiz...</div>
  }

  // No Quiz State
  if (!activeQuiz) {
     return (
        <div className="quiz-page u-center-text u-pad-6">
            <div style={{ fontSize: 'var(--fs-3)' }}>No active quiz</div>
            <div className="u-muted u-mt-2">Check back later for independent verification.</div>
            <button className="actionBtn u-mt-4" onClick={() => nav('/feed')}>Return Home</button>
        </div>
     )
  }

  return (
    <div className="quiz-page">
      {/* Top Section: Question */}
      <div className="quiz-split-top">
        {/* Progress Header */}
        <div className="quiz-progress-header">
           <div className="quiz-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        
        {/* Meta Badge */}
        <div className="quiz-meta-badge">
           {activeQuiz.title} • Q{state.step + 1}/{activeQuiz.questions.length}
        </div>

        {editMode ? (
           <div style={{ width: '100%', maxWidth: 600 }}>
              <button 
                className="u-badge u-mb-4"
                onClick={() => dispatch({ type: 'TOGGLE_EDIT_MODE' })}
                style={{ background: 'var(--c-primary)', color: '#fff', border: 'none' }}
              >
                Exit Edit Mode
              </button>
              {currentQuestion && (
                <QuizEditor 
                  quiz={activeQuiz} 
                  question={currentQuestion}
                  step={state.step}
                  onUpdateTitle={actions.updateTitle}
                  onUpdatePrompt={actions.updateQuestionPrompt}
                  onUpdateOption={actions.updateOptionLabel}
                />
              )}
           </div>
        ) : (
          <div 
             className="quiz-question-text"
             style={{ fontSize: currentQuestion ? getDynamicFontSize(currentQuestion.prompt) : '1.5rem' }}
          >
            {currentQuestion?.prompt}
          </div>
        )}
      </div>

      {/* Bottom Section: Answers & Nav */}
      <div className="quiz-split-bottom">
         <div className="quiz-options-list">
            {!editMode && currentQuestion && (
               <QuizQuestion
                 question={currentQuestion}
                 selectedValue={currentAnswer}
                 onSelect={actions.selectOption}
               />
            )}
            {message && <div className="u-muted u-center-text u-mt-2">{message}</div>}
         </div>

         {/* Fixed Bottom Nav */}
         <div className="quiz-nav-bar">
               {editorEnabled && (
                  <button 
                    className="actionBtn" 
                    onClick={() => dispatch({ type: 'TOGGLE_EDIT_MODE' })}
                    style={{ fontSize: '0.9rem', padding: '8px 16px' }}
                  >
                    Edit
                  </button>
               )}
               {!editorEnabled && (
                 <button className="actionBtn" onClick={actions.skip}>Skip</button>
               )}
               <button
                  className="actionBtn"
                  onClick={actions.navPrev}
                  disabled={state.step === 0}
               >
                  Back
               </button>
               
               {state.step < activeQuiz.questions.length - 1 ? (
                  <button
                    className="actionBtn actionBtn--like"
                    onClick={actions.navNext}
                    disabled={!editMode && !currentAnswer}
                  >
                    Next
                  </button>
               ) : (
                  <button
                    className="actionBtn actionBtn--like"
                    onClick={actions.submitQuiz}
                    disabled={editMode || !currentAnswer || submitting}
                  >
                    {submitting ? 'Saving...' : 'Submit'}
                  </button>
               )}
         </div>
      </div>
    </div>
  )
}
