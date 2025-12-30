import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { useAuth } from '../../core/auth/useAuth'
import { useActiveQuiz } from '../../core/quiz/useActiveQuiz'
import { getErrorMessage } from '../../core/utils/errors'
import { InlineField } from '../form/InlineField'
import { InlineTextarea } from '../form/InlineTextarea'

type AnswerMap = Record<string, string>

export function QuizPage() {
  const nav = useNavigate()
  const location = useLocation()
  const { userId } = useAuth()
  const { data, loading, error } = useActiveQuiz()
  const quiz = data?.quiz ?? null
  const errorMessage = error == null ? null : getErrorMessage(error, 'Failed to load quiz.')
  const [quizDraft, setQuizDraft] = useState(quiz)
  const editorEnabled = useMemo(() => {
    if (!userId) return false
    const params = new URLSearchParams(location.search)
    return params.has('edit')
  }, [location.search, userId])
  const [editMode, setEditMode] = useState(false)
  const activeQuiz = quizDraft ?? quiz
  const questions = useMemo(() => activeQuiz?.questions ?? [], [activeQuiz?.questions])
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<AnswerMap>({})
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    setStep(0)
    setAnswers({})
    setMessage(null)
    setEditMode(editorEnabled)
    setQuizDraft(quiz ?? null)
  }, [editorEnabled, quiz])

  const current = questions[step]
  const selected = current ? answers[String(current.id)] : undefined
  const progress = questions.length ? Math.round(((step + 1) / questions.length) * 100) : 0

  function handleSelect(value: string) {
    if (!current) return
    setAnswers(prev => ({ ...prev, [String(current.id)]: value }))
  }

  async function handleSubmit() {
    if (!activeQuiz) return
    if (!userId) {
      setMessage('Login required to save your quiz.')
      return
    }
    setSubmitting(true)
    setMessage(null)
    try {
      await api.quizzes.submit(activeQuiz.id, { answers })
      setMessage('Quiz saved to your profile.')
    } catch (e: unknown) {
      setMessage(getErrorMessage(e, 'Failed to submit quiz.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="quiz u-hide-scroll">
      <div className="quiz__pad">
        <div className="u-title">Quiz</div>
        {loading && <div className="u-muted u-mt-4">Loading quiz...</div>}
        {errorMessage && (
          <div className="u-glass u-pad-4 u-mt-4" style={{ borderRadius: 'var(--r-4)' }}>
            <div style={{ fontSize: 'var(--fs-3)' }}>Quiz error</div>
            <div className="u-muted u-mt-2" style={{ fontSize: 'var(--fs-2)' }}>
              {errorMessage}
            </div>
          </div>
        )}
        {!loading && !errorMessage && !quiz && (
          <div className="u-glass u-pad-4 u-mt-4" style={{ borderRadius: 'var(--r-4)' }}>
            <div style={{ fontSize: 'var(--fs-3)' }}>No active quiz</div>
            <div className="u-muted u-mt-2" style={{ fontSize: 'var(--fs-2)' }}>
              Check back later for the next personality quiz.
            </div>
          </div>
        )}

        {activeQuiz && current && (
          <div className="quiz__card u-glass u-pad-6 u-mt-4">
            <div className="quiz__meta">
              <div className="quiz__title">{activeQuiz.title}</div>
              <div className="quiz__progress">{progress}%</div>
            </div>
            {editorEnabled && (
              <div className="u-row-between" style={{ marginBottom: 12 }}>
                <div className="u-muted" style={{ fontSize: 'var(--fs-2)' }}>
                  Edit mode uses autosave.
                </div>
                <button
                  className={`topBar__btn${editMode ? ' topBar__btn--primary' : ''}`}
                  type="button"
                  onClick={() => setEditMode(value => !value)}
                >
                  {editMode ? 'Editing' : 'Edit'}
                </button>
              </div>
            )}
            {editMode ? (
              <div className="u-stack">
                <InlineField
                  label="Quiz title"
                  value={activeQuiz.title}
                  onSave={async value => {
                    if (!value) return
                    const res = await api.quizzes.update(activeQuiz.id, { title: value })
                    setQuizDraft(prev => (prev ? { ...prev, title: res.title } : prev))
                  }}
                />
                <InlineTextarea
                  label={`Question ${step + 1}`}
                  value={current.prompt}
                  placeholder="Question prompt"
                  maxLength={220}
                  onSave={async value => {
                    if (!value) return
                    const res = await api.quizzes.updateQuestion(activeQuiz.id, current.id, {
                      prompt: value,
                    })
                    setQuizDraft(prev =>
                      prev
                        ? {
                            ...prev,
                            questions: prev.questions.map(q =>
                              String(q.id) === String(current.id) ? { ...q, prompt: res.prompt } : q
                            ),
                          }
                        : prev
                    )
                  }}
                />
                <div className="u-stack">
                  {current.options.map((opt, idx) => (
                    <InlineField
                      key={String(opt.id)}
                      label={`Option ${idx + 1}`}
                      value={opt.label}
                      onSave={async value => {
                        if (!value) return
                        const res = await api.quizzes.updateOption(
                          activeQuiz.id,
                          current.id,
                          opt.id,
                          { label: value }
                        )
                        setQuizDraft(prev =>
                          prev
                            ? {
                                ...prev,
                                questions: prev.questions.map(q =>
                                  String(q.id) === String(current.id)
                                    ? {
                                        ...q,
                                        options: q.options.map(o =>
                                          String(o.id) === String(opt.id)
                                            ? { ...o, label: res.label }
                                            : o
                                        ),
                                      }
                                    : q
                                ),
                              }
                            : prev
                        )
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="quiz__prompt">{current.prompt}</div>
                <div className="quiz__options">
                  {current.options.map(opt => {
                    const active = selected === opt.value
                    return (
                      <button
                        key={String(opt.id)}
                        type="button"
                        className={`quiz__option${active ? ' quiz__option--active' : ''}`}
                        onClick={() => handleSelect(opt.value)}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            <div className="quiz__actions">
              <button className="actionBtn" type="button" onClick={() => nav('/feed')}>
                Skip for now
              </button>
              <div className="quiz__nav">
                <button
                  className="actionBtn"
                  type="button"
                  onClick={() => setStep(s => Math.max(0, s - 1))}
                  disabled={step === 0}
                >
                  Back
                </button>
                {step < questions.length - 1 && (
                  <button
                    className="actionBtn actionBtn--like"
                    type="button"
                    onClick={() => setStep(s => Math.min(questions.length - 1, s + 1))}
                    disabled={!editMode && !selected}
                  >
                    Next
                  </button>
                )}
                {step === questions.length - 1 && (
                  <button
                    className="actionBtn actionBtn--like"
                    type="button"
                    onClick={handleSubmit}
                    disabled={editMode || !selected || submitting}
                  >
                    {submitting ? 'Saving...' : 'Submit'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {message && <div className="u-muted u-mt-4">{message}</div>}
      </div>
    </div>
  )
}
