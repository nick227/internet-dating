import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { useAuth } from '../../core/auth/useAuth'
import { useActiveQuiz } from '../../core/quiz/useActiveQuiz'
import { useQuizById } from '../../core/quiz/useQuizById'
import { getErrorMessage } from '../../core/utils/errors'
import { AnswerMap, Quiz } from './types'

interface QuizState {
  step: number
  answers: AnswerMap
  editMode: boolean
  submitting: boolean
  message: string | null
  quizDraft: Quiz | null
}

type Action =
  | { type: 'INIT_QUIZ'; payload: { quiz: Quiz | null; editMode: boolean } }
  | { type: 'SET_STEP'; payload: number }
  | { type: 'SET_ANSWER'; payload: { questionId: string; value: string } }
  | { type: 'TOGGLE_EDIT_MODE' }
  | { type: 'UPDATE_DRAFT'; payload: Partial<Quiz> }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_SUCCESS'; payload: string }
  | { type: 'SUBMIT_FAILURE'; payload: string }
  | { type: 'CLEAR_MESSAGE' }

function quizReducer(state: QuizState, action: Action): QuizState {
  switch (action.type) {
    case 'INIT_QUIZ':
      return {
        ...state,
        quizDraft: action.payload.quiz,
        editMode: action.payload.editMode,
        step: 0,
        answers: {},
        message: null,
      }
    case 'SET_STEP':
      return { ...state, step: action.payload }
    case 'SET_ANSWER':
      return {
        ...state,
        answers: { ...state.answers, [action.payload.questionId]: action.payload.value },
      }
    case 'TOGGLE_EDIT_MODE':
      return { ...state, editMode: !state.editMode }
    case 'UPDATE_DRAFT':
      if (!state.quizDraft) return state
      return { ...state, quizDraft: { ...state.quizDraft, ...action.payload } }
    case 'SUBMIT_START':
      return { ...state, submitting: true, message: null }
    case 'SUBMIT_SUCCESS':
      return { ...state, submitting: false, message: action.payload }
    case 'SUBMIT_FAILURE':
      return { ...state, submitting: false, message: action.payload }
    case 'CLEAR_MESSAGE':
      return { ...state, message: null }
    default:
      return state
  }
}

export function useQuizState(quizId?: string) {
  const nav = useNavigate()
  const location = useLocation()
  const { userId } = useAuth()
  const byIdResponse = useQuizById(quizId)
  const activeResponse = useActiveQuiz(!quizId)
  const { data, loading, error } = quizId ? byIdResponse : activeResponse
  
  // Cast data.quiz to our local Quiz type if it matches structurally
  const quiz = (data?.quiz as unknown as Quiz) ?? null
  
  const errorMessage = error ? getErrorMessage(error, 'Failed to load quiz.') : null

  const editorEnabled = useMemo(() => {
    if (!userId) return false
    const params = new URLSearchParams(location.search)
    return params.has('edit')
  }, [location.search, userId])

  const [state, dispatch] = useReducer(quizReducer, {
    step: 0,
    answers: {},
    editMode: false,
    submitting: false,
    message: null,
    quizDraft: null,
  })

  // Only init when quiz ID changes to avoid race conditions/resets
  const [currentQuizId, setCurrentQuizId] = useState<string | number | null>(null)

  useEffect(() => {
    if (quiz && quiz.id !== currentQuizId) {
      setCurrentQuizId(quiz.id)
      dispatch({ type: 'INIT_QUIZ', payload: { quiz, editMode: editorEnabled } })
    } else if (!quiz && currentQuizId !== null) {
        // If quiz disappears (e.g. error), reset?
        // Maybe better to keep state if transient error
    }
  }, [quiz, currentQuizId, editorEnabled])

  // If editor enabled changes, update edit mode?
  // The original code reset everything. Here we just might want to sync editMode availability.
  // Ideally, if 'edit' param is added/removed, we might want to toggle, but usually that requires a reload or nav.
  
  const activeQuiz = state.quizDraft ?? quiz

  const questions = useMemo(() => activeQuiz?.questions ?? [], [activeQuiz?.questions])
  const currentQuestion = questions[state.step]
  const currentAnswer = currentQuestion ? state.answers[String(currentQuestion.id)] : undefined
  const progress = questions.length ? Math.round(((state.step + 1) / questions.length) * 100) : 0

  const navNext = useCallback(() => {
    dispatch({ type: 'SET_STEP', payload: Math.min(questions.length - 1, state.step + 1) })
  }, [questions.length, state.step])

  const navPrev = useCallback(() => {
    dispatch({ type: 'SET_STEP', payload: Math.max(0, state.step - 1) })
  }, [state.step])

  const selectOption = useCallback((value: string) => {
    if (!currentQuestion) return
    dispatch({ type: 'SET_ANSWER', payload: { questionId: String(currentQuestion.id), value } })
  }, [currentQuestion])

  const submitQuiz = useCallback(async () => {
    if (!activeQuiz) return
    if (!userId) {
       dispatch({type: 'SUBMIT_FAILURE', payload: 'Login required to save your quiz.'})
       return
    }
    
    dispatch({ type: 'SUBMIT_START' })
    try {
      await api.quizzes.submit(activeQuiz.id, { answers: state.answers })
      // Navigate to results page instead of showing message
      nav(`/quiz/${activeQuiz.id}/results`)
    } catch (e) {
      dispatch({ type: 'SUBMIT_FAILURE', payload: getErrorMessage(e, 'Failed to submit quiz.') })
    }
  }, [activeQuiz, userId, state.answers, nav])

  const updateTitle = useCallback(async (title: string) => {
    if (!activeQuiz) return
    try {
      // Assuming res returns the updated fields
      const res = await api.quizzes.update(activeQuiz.id, { title })
      dispatch({ type: 'UPDATE_DRAFT', payload: { title: res.title } })
    } catch (e) {
      console.error('Failed to update title', e)
    }
  }, [activeQuiz])

  const updateQuestionPrompt = useCallback(async (questionId: string | number, prompt: string) => {
    if (!activeQuiz) return
    try {
      const res = await api.quizzes.updateQuestion(activeQuiz.id, questionId, { prompt })
      
      const updatedQuestions = activeQuiz.questions.map(q => 
        String(q.id) === String(questionId) ? { ...q, prompt: res.prompt } : q
      )
      
      dispatch({ type: 'UPDATE_DRAFT', payload: { questions: updatedQuestions } })
    } catch (e) {
       console.error('Failed to update question', e)
    }
  }, [activeQuiz])

  const updateOptionLabel = useCallback(async (questionId: string | number, optionId: string | number, label: string) => {
    if (!activeQuiz) return
    try {
      const res = await api.quizzes.updateOption(activeQuiz.id, questionId, optionId, { label })
      
      const updatedQuestions = activeQuiz.questions.map(q => 
        String(q.id) === String(questionId) 
          ? { 
              ...q, 
              options: q.options.map(o => 
                String(o.id) === String(optionId) ? { ...o, label: res.label } : o
              ) 
            } 
          : q
      )
      
      dispatch({ type: 'UPDATE_DRAFT', payload: { questions: updatedQuestions } })
    } catch (e) {
      console.error('Failed to update option', e)
    }
  }, [activeQuiz])

  return {
    loading,
    error: errorMessage,
    quiz,
    activeQuiz,
    questions,
    currentQuestion,
    currentAnswer,
    progress,
    state,
    editorEnabled,
    dispatch,
    actions: {
      navNext,
      navPrev,
      selectOption,
      submitQuiz,
      skip: () => nav('/feed'),
      updateTitle,
      updateQuestionPrompt,
      updateOptionLabel,
    }
  }
}
