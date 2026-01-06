# Quiz Results Page Design

## Overview

After quiz submission, redirect user to `/quiz/:quizId/results` showing their answers compared to demographic averages. Each question is displayed as a card with answer breakdowns.

## Design

### Layout

Each question is a **small card container**:
- Question text as card title
- User's selected answer (highlighted)
- Trait map for user's selected answer (from QuizOption.traitValues)
- Percentage comparisons for user's answer:
  - User's answer vs site average
  - User's answer vs their gender average  
  - User's answer vs opposite gender average  
  - User's answer vs their age-group average  
  - User's answer vs their city average
  - User's answer vs random other city average

### Data Display

**Always show:**
- Logged-in user's gender, age, and city
- User's selected answer for each question
- Percentage of people who selected the same answer as the user, broken down by:
  - Site-wide average
  - User's gender
  - Opposite gender
  - User's age group
  - User's city
  - Random other city

**Comparison format:**
- "Your answer: 45% of your gender | 38% site average"
- Visual indicator (bar or simple text)

### Component Structure

```
QuizResultsPage
└── QuestionCard (one per question)
    ├── Question title (prompt)
    ├── User's selected answer (highlighted)
    ├── Trait map for selected answer
    └── AnswerComparison
        ├── Site average: X% selected your answer
        ├── Your gender: X% | Opposite gender: Y%
        ├── Your age group: X%
        └── Your city: X% | Other city: Y%
```

## Data Structure

```typescript
interface QuizResults {
  quizId: string
  quizTitle: string
  userDemo: {
    gender: string
    age: number
    city: string
  }
  questions: QuestionResult[]
}

interface QuestionResult {
  questionId: string
  questionPrompt: string
  userSelectedAnswer: {
    optionId: string
    optionLabel: string
    traitValues: Record<string, number> // from QuizOption.traitValues
    percentages: {
      siteAverage: number           // % of all users who selected this answer
      userGender: number            // % of user's gender who selected this answer
      oppositeGender: number       // % of opposite gender who selected this answer
      userAgeGroup: number          // % of user's age group who selected this answer
      userCity: number              // % of user's city who selected this answer
      otherCity: number             // % of random other city who selected this answer
    }
  }
}
```

## API Response

```
GET /api/quizzes/:quizId/results
```

Returns:
- User's demographic info (gender, age, city)
- For each question:
  - Question prompt
  - User's selected answer with:
    - Answer label
    - Trait map
    - Percentages showing % who selected same answer:
      - Site average
      - User's gender
      - Opposite gender
      - User's age group
      - User's city
      - Random other city

## UI Components

### QuestionCard
- Small card container
- Question prompt as title
- User's selected answer (prominently displayed)
- Trait map for selected answer
- Answer comparison percentages

### AnswerComparison
- Shows percentage of people who selected the same answer as the user
- Six comparisons:
  - Site average: "38% of all users"
  - User's gender: "45% of your gender"
  - Opposite gender: "32% of opposite gender"
  - User's age group: "52% of your age group"
  - User's city: "41% of your city"
  - Other city: "35% of [city name]"

## Implementation

### Route
- `/quiz/:quizId/results` in `App.tsx`
- Update `useQuizState.submitQuiz()` to navigate on success

### Files
- `frontend/src/ui/pages/QuizResultsPage.tsx`
- `frontend/src/ui/quiz/results/QuestionCard.tsx`
- `frontend/src/ui/quiz/results/AnswerOption.tsx`
- `frontend/src/ui/quiz/results/useQuizResults.ts`
- `frontend/src/ui/quiz/results/types.ts`
- `frontend/src/api/client.ts` (add `quizzes.results()`)

### Styling
- Minimal, typography-focused
- Card-based layout
- Clean percentage displays
- Trait map as simple key-value list
