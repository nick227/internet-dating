export interface QuizResults {
  quiz: {
    id: string
    title: string
  }
  userDemo: {
    gender: 'MALE' | 'FEMALE' | 'NONBINARY' | 'OTHER' | 'UNSPECIFIED'
    age: number
    city: string | null
  }
  questions: QuestionResult[]
}

export interface QuestionResult {
  questionId: string
  questionPrompt: string
  userSelectedAnswer: {
    optionId: string
    optionLabel: string
    traitValues: Record<string, number>
    percentages: {
      siteAverage: number
      userGender: number
      oppositeGender: number
      userAgeGroup: number
      userCity: number
      otherCity: number
    }
  }
}
