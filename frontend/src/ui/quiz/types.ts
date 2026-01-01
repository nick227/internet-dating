export type QuizId = string | number
export type QuestionId = string | number
export type OptionId = string | number

export interface QuizOption {
  id: OptionId
  label: string
  value: string
}

export interface QuizQuestion {
  id: QuestionId
  prompt: string
  options: QuizOption[]
}

export interface Quiz {
  id: QuizId
  title: string
  questions: QuizQuestion[]
}

export type AnswerMap = Record<string, string>
