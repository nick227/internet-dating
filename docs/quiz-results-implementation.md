# Quiz Results Implementation Guide

## Overview

This guide implements the quiz results feature: after quiz submission, users are redirected to a results page showing their answers compared to demographic averages. The implementation uses a job-based aggregation system for performance.

## Implementation Order

### Phase 1: Database Schema
1. Add `QuizAnswerStats` model to Prisma schema
2. Create and run migration
3. Add indexes

### Phase 2: Backend Job
1. Create `quizAnswerStatsJob.ts`
2. Implement aggregation logic
3. Register job in registry
4. Test job execution

### Phase 3: Backend API
1. Add results endpoint to quizzes domain
2. Implement request handler
3. Add job trigger on quiz submission
4. Test API endpoint

### Phase 4: Frontend Types & API Client
1. Create TypeScript types
2. Add API client method
3. Generate OpenAPI types

### Phase 5: Frontend Components
1. Create route in `App.tsx`
2. Build `QuizResultsPage` component
3. Build `QuestionCard` component
4. Build `AnswerComparison` component
5. Update `useQuizState` to navigate on submit

### Phase 6: Styling
1. Create CSS for quiz results
2. Style cards and comparisons
3. Mobile responsiveness

## Phase 1: Database Schema

### Prisma Schema Addition

Add to `backend/prisma/schema/quiz.prisma`:

```prisma
model QuizAnswerStats {
  id          BigInt   @id @default(autoincrement())
  quizId      BigInt
  questionId  BigInt
  optionValue String
  dimension   String   // 'site' | 'gender' | 'age' | 'city'
  bucket      String   // 'ALL', 'MALE', '25-34', 'NYC', etc.
  count       Int      // Number of users in this bucket who chose this option
  total       Int      // Total users in this bucket who answered this question (any option)
  updatedAt   DateTime @updatedAt
  
  quiz        Quiz     @relation(fields: [quizId], references: [id])
  question    QuizQuestion @relation(fields: [questionId], references: [id])
  
  @@unique([quizId, questionId, optionValue, dimension, bucket])
  @@index([quizId, questionId, optionValue, dimension])
  @@index([dimension, bucket])
}
```

Add relations to existing models:

```prisma
model Quiz {
  // ... existing fields
  answerStats QuizAnswerStats[]
}

model QuizQuestion {
  // ... existing fields
  answerStats QuizAnswerStats[]
}
```

### Migration

```bash
cd backend
npx prisma migrate dev --name add_quiz_answer_stats
```

## Phase 2: Backend Job

### File Structure

Create `backend/src/jobs/quizAnswerStatsJob.ts`:

```typescript
import { prisma } from '../lib/prisma/client.js';

type QuizAnswerStatsJobOptions = {
  quizId?: bigint | null;
  questionIds?: bigint[] | null;  // For incremental updates
  fullRefresh?: boolean;
};

const TOP_CITIES_COUNT = 20;

/**
 * Freeze top N cities at job start (per job run, not per quiz)
 * This ensures consistency for "other city" comparisons
 */
async function getTopCities(): Promise<string[]> {
  const cities = await prisma.profileSearchIndex.groupBy({
    by: ['locationCity'],
    where: {
      locationCity: { not: null },
      isVisible: true,
      isDeleted: false
    },
    _count: { userId: true },
    orderBy: { _count: { userId: 'desc' } },
    take: TOP_CITIES_COUNT
  });
  
  return cities
    .map(c => c.locationCity)
    .filter((city): city is string => city !== null);
}

/**
 * Calculate age bucket from ageBucket number
 */
function ageBucketToString(bucket: number | null): string | null {
  if (bucket === null) return null;
  const ranges = ['18-24', '25-34', '35-44', '45-54', '55+'];
  return ranges[bucket] ?? null;
}

/**
 * Process entire quiz - fetch all results once, build in-memory counters
 * CRITICAL: This scans QuizResult once per quiz, never per option
 */
async function processQuiz(quizId: bigint, topCities: string[], questionIds?: bigint[]): Promise<void> {
  // Fetch quiz structure
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: {
      questions: {
        where: questionIds ? { id: { in: questionIds } } : undefined,
        select: {
          id: true,
          options: {
            select: { value: true }
          }
        }
      }
    }
  });

  if (!quiz || quiz.questions.length === 0) return;

  const questionIdSet = new Set(quiz.questions.map(q => q.id));

  // Fetch ALL QuizResults for this quiz ONCE
  const allResults = await prisma.quizResult.findMany({
    where: { quizId },
    select: {
      userId: true,
      answers: true
    }
  });

  if (allResults.length === 0) {
    // No results, delete all stats for this quiz
    await prisma.quizAnswerStats.deleteMany({
      where: { quizId }
    });
    return;
  }

  // Fetch ALL user demographics ONCE
  const userIds = allResults.map(r => r.userId);
  const profiles = await prisma.profile.findMany({
    where: { userId: { in: userIds }, deletedAt: null },
    select: { userId: true, gender: true }
  });

  const searchIndex = await prisma.profileSearchIndex.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, ageBucket: true, locationCity: true }
  });

  const profileByUserId = new Map(profiles.map(p => [p.userId, p]));
  const searchIndexByUserId = new Map(searchIndex.map(s => [s.userId, s]));

  // Build in-memory data structures
  // Structure: questionId -> optionValue -> dimension -> bucket -> count
  const counts = new Map<string, number>();
  // Structure: questionId -> dimension -> bucket -> total
  const totals = new Map<string, number>();

  // Process each result
  for (const result of allResults) {
    const answers = result.answers as Record<string, string>;
    const userId = result.userId;
    const profile = profileByUserId.get(userId);
    const idx = searchIndexByUserId.get(userId);

    const gender = profile?.gender ?? 'UNSPECIFIED';
    const ageStr = idx?.ageBucket !== null ? ageBucketToString(idx.ageBucket) : null;
    const city = idx?.locationCity && topCities.includes(idx.locationCity) ? idx.locationCity : null;

    // Process each question
    for (const question of quiz.questions) {
      const questionId = question.id;
      const optionValue = answers[String(questionId)];

      if (!optionValue) continue; // User didn't answer this question

      // Increment counts for this option
      const countKey = `${questionId}:${optionValue}:site:ALL`;
      counts.set(countKey, (counts.get(countKey) ?? 0) + 1);

      if (gender) {
        const key = `${questionId}:${optionValue}:gender:${gender}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }

      if (ageStr) {
        const key = `${questionId}:${optionValue}:age:${ageStr}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }

      if (city) {
        const key = `${questionId}:${optionValue}:city:${city}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }

      // Increment totals for this question (all options)
      // CRITICAL: Totals are per question, not per option
      totals.set(`${questionId}:site:ALL`, (totals.get(`${questionId}:site:ALL`) ?? 0) + 1);

      if (gender) {
        totals.set(`${questionId}:gender:${gender}`, (totals.get(`${questionId}:gender:${gender}`) ?? 0) + 1);
      }

      if (ageStr) {
        totals.set(`${questionId}:age:${ageStr}`, (totals.get(`${questionId}:age:${ageStr}`) ?? 0) + 1);
      }

      if (city) {
        totals.set(`${questionId}:city:${city}`, (totals.get(`${questionId}:city:${city}`) ?? 0) + 1);
      }
    }
  }

  // Now upsert all stats
  const statsToUpsert: Array<{
    quizId: bigint;
    questionId: bigint;
    optionValue: string;
    dimension: string;
    bucket: string;
    count: number;
    total: number;
  }> = [];

  for (const question of quiz.questions) {
    const questionId = question.id;
    
    for (const option of question.options) {
      const optionValue = option.value;

      // Site-wide
      const siteCount = counts.get(`${questionId}:${optionValue}:site:ALL`) ?? 0;
      const siteTotal = totals.get(`${questionId}:site:ALL`) ?? 0;
      if (siteTotal > 0) {
        statsToUpsert.push({
          quizId,
          questionId,
          optionValue,
          dimension: 'site',
          bucket: 'ALL',
          count: siteCount,
          total: siteTotal
        });
      }

      // Gender
      for (const gender of ['MALE', 'FEMALE', 'NONBINARY', 'OTHER', 'UNSPECIFIED'] as const) {
        const count = counts.get(`${questionId}:${optionValue}:gender:${gender}`) ?? 0;
        const total = totals.get(`${questionId}:gender:${gender}`) ?? 0;
        if (total > 0) {
          statsToUpsert.push({
            quizId,
            questionId,
            optionValue,
            dimension: 'gender',
            bucket: gender,
            count,
            total
          });
        }
      }

      // Age
      for (const ageStr of ['18-24', '25-34', '35-44', '45-54', '55+'] as const) {
        const count = counts.get(`${questionId}:${optionValue}:age:${ageStr}`) ?? 0;
        const total = totals.get(`${questionId}:age:${ageStr}`) ?? 0;
        if (total > 0) {
          statsToUpsert.push({
            quizId,
            questionId,
            optionValue,
            dimension: 'age',
            bucket: ageStr,
            count,
            total
          });
        }
      }

      // City (only top cities)
      for (const city of topCities) {
        const count = counts.get(`${questionId}:${optionValue}:city:${city}`) ?? 0;
        const total = totals.get(`${questionId}:city:${city}`) ?? 0;
        if (total > 0) {
          statsToUpsert.push({
            quizId,
            questionId,
            optionValue,
            dimension: 'city',
            bucket: city,
            count,
            total
          });
        }
      }
    }
  }

  // Batch upsert (delete old stats for affected questions first)
  if (questionIds && questionIds.length > 0) {
    await prisma.quizAnswerStats.deleteMany({
      where: {
        quizId,
        questionId: { in: questionIds }
      }
    });
  } else {
    // Full refresh - delete all stats for this quiz
    await prisma.quizAnswerStats.deleteMany({
      where: { quizId }
    });
  }

  // Upsert in batches
  const BATCH_SIZE = 100;
  for (let i = 0; i < statsToUpsert.length; i += BATCH_SIZE) {
    const batch = statsToUpsert.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(stat =>
        prisma.quizAnswerStats.upsert({
          where: {
            quizId_questionId_optionValue_dimension_bucket: {
              quizId: stat.quizId,
              questionId: stat.questionId,
              optionValue: stat.optionValue,
              dimension: stat.dimension,
              bucket: stat.bucket
            }
          },
          update: {
            count: stat.count,
            total: stat.total
          },
          create: stat
        })
      )
    );
  }
}

export const quizAnswerStatsJob = {
  name: 'quiz-answer-stats',
  description: 'Aggregate quiz answer statistics by demographics',
  examples: [
    'tsx scripts/runJobs.ts quiz-answer-stats',
    'tsx scripts/runJobs.ts quiz-answer-stats --quizId=1',
    'tsx scripts/runJobs.ts quiz-answer-stats --quizId=1 --questionIds=1,2,3',
    'tsx scripts/runJobs.ts quiz-answer-stats --fullRefresh'
  ],
  run: async (options: QuizAnswerStatsJobOptions = {}) => {
    const topCities = await getTopCities();
    
    if (options.quizId) {
      await processQuiz(options.quizId, topCities, options.questionIds ?? undefined);
    } else {
      // Process all active quizzes
      const quizzes = await prisma.quiz.findMany({
        where: { isActive: true },
        select: { id: true }
      });
      
      for (const quiz of quizzes) {
        await processQuiz(quiz.id, topCities);
      }
    }
  }
};
```

### Register Job

Add to `backend/scripts/jobs/registry.ts`:

```typescript
import { quizAnswerStatsJob } from './quizAnswerStats.js';

const jobs: JobRegistry = {
  // ... existing jobs
  'quiz-answer-stats': quizAnswerStatsJob,
};
```

## Phase 3: Backend API

### Add Results Endpoint

Add to `backend/src/registry/domains/quizzes/index.ts`:

```typescript
{
  id: 'quizzes.GET./quizzes/:quizId/results',
  method: 'GET',
  path: '/quizzes/:quizId/results',
  auth: Auth.user(),
  summary: 'Get quiz results with demographic comparisons',
  tags: ['quizzes'],
  handler: async (req, res) => {
    const userId = req.ctx.userId!;
    const quizParsed = parsePositiveBigInt(req.params.quizId, 'quizId');
    if (!quizParsed.ok) return json(res, { error: quizParsed.error }, 400);
    const quizId = quizParsed.value;

    // Fetch user's quiz result
    const userResult = await prisma.quizResult.findUnique({
      where: { userId_quizId: { userId, quizId } },
      select: { answers: true }
    });

    if (!userResult) {
      return json(res, { error: 'Quiz not completed' }, 404);
    }

    // Fetch quiz with questions
    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      select: {
        id: true,
        title: true,
        questions: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            prompt: true,
            options: {
              orderBy: { order: 'asc' },
              select: { id: true, label: true, value: true, traitValues: true }
            }
          }
        }
      }
    });

    if (!quiz) {
      return json(res, { error: 'Quiz not found' }, 404);
    }

    // Fetch user demographics
    const profile = await prisma.profile.findUnique({
      where: { userId },
      select: { gender: true, birthdate: true }
    });

    const searchIndex = await prisma.profileSearchIndex.findUnique({
      where: { userId },
      select: { ageBucket: true, locationCity: true }
    });

    // Calculate user age
    const age = profile?.birthdate
      ? Math.floor((Date.now() - profile.birthdate.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : null;

    const userGender = profile?.gender ?? 'UNSPECIFIED';
    const userAgeBucket = searchIndex?.ageBucket !== null
      ? (['18-24', '25-34', '35-44', '45-54', '55+'][searchIndex.ageBucket] ?? null)
      : null;
    const userCity = searchIndex?.locationCity ?? null;

    // Determine opposite gender
    const oppositeGender = userGender === 'MALE' ? 'FEMALE' : userGender === 'FEMALE' ? 'MALE' : 'UNSPECIFIED';

    // Determine other city (highest total responses overall, not user's city)
    // This is computed once per quiz, not per request
    // Find city with highest total across all questions
    const topCityStats = await prisma.quizAnswerStats.findFirst({
      where: {
        quizId,
        dimension: 'city',
        bucket: userCity ? { not: userCity } : undefined
      },
      orderBy: { total: 'desc' },
      select: { bucket: true },
      distinct: ['bucket']
    });
    const otherCity = topCityStats?.bucket ?? null;

    // Extract user's answers
    const answers = userResult.answers as Record<string, string>;
    const questionIds = quiz.questions.map(q => q.id);
    const optionValues = quiz.questions
      .map(q => answers[String(q.id)])
      .filter((v): v is string => v !== undefined);

    // Fetch all needed stats in one query
    const stats = await prisma.quizAnswerStats.findMany({
      where: {
        quizId,
        questionId: { in: questionIds },
        optionValue: { in: optionValues },
        dimension: { in: ['site', 'gender', 'age', 'city'] }
      }
    });

    // Build stats lookup map
    const statsMap = new Map<string, { count: number; total: number }>();
    for (const stat of stats) {
      const key = `${stat.questionId}:${stat.optionValue}:${stat.dimension}:${stat.bucket}`;
      statsMap.set(key, { count: stat.count, total: stat.total });
    }

    // Build response
    const questions = quiz.questions.map(question => {
      const optionValue = answers[String(question.id)];
      const selectedOption = question.options.find(o => o.value === optionValue);

      if (!selectedOption) {
        return null;
      }

      const getStat = (dimension: string, bucket: string) => {
        const key = `${question.id}:${optionValue}:${dimension}:${bucket}`;
        return statsMap.get(key);
      };

      const siteStat = getStat('site', 'ALL');
      const genderStat = getStat('gender', userGender);
      const oppositeGenderStat = getStat('gender', oppositeGender);
      const ageStat = userAgeBucket ? getStat('age', userAgeBucket) : null;
      const cityStat = userCity ? getStat('city', userCity) : null;
      const otherCityStat = otherCity ? getStat('city', otherCity) : null;

      const calculatePercentage = (stat: { count: number; total: number } | null | undefined) => {
        if (!stat || stat.total === 0) return 0;
        return Math.round((stat.count / stat.total) * 100);
      };

      return {
        questionId: String(question.id),
        questionPrompt: question.prompt,
        userSelectedAnswer: {
          optionId: String(selectedOption.id),
          optionLabel: selectedOption.label,
          traitValues: (selectedOption.traitValues as Record<string, number>) ?? {},
          percentages: {
            siteAverage: calculatePercentage(siteStat),
            userGender: calculatePercentage(genderStat),
            oppositeGender: calculatePercentage(oppositeGenderStat),
            userAgeGroup: calculatePercentage(ageStat),
            userCity: calculatePercentage(cityStat),
            otherCity: calculatePercentage(otherCityStat)
          }
        }
      };
    }).filter((q): q is NonNullable<typeof q> => q !== null);

    return json(res, {
      quiz: {
        id: String(quiz.id),
        title: quiz.title
      },
      userDemo: {
        gender: userGender,
        age: age ?? 0,
        city: userCity
      },
      questions
    });
  }
}
```

### Trigger Job on Quiz Submission

Update the submit handler in `backend/src/registry/domains/quizzes/index.ts`:

```typescript
{
  id: 'quizzes.POST./quizzes/:quizId/submit',
  // ... existing config
  handler: async (req, res) => {
    const userId = req.ctx.userId!;
    const quizParsed = parsePositiveBigInt(req.params.quizId, 'quizId');
    if (!quizParsed.ok) return json(res, { error: quizParsed.error }, 400);
    const quizId = quizParsed.value;
    const { answers, scoreVec } = (req.body ?? {}) as { answers?: any; scoreVec?: any };

    if (answers === undefined) return json(res, { error: 'answers required' }, 400);

    await prisma.quizResult.upsert({
      where: { userId_quizId: { userId, quizId } },
      update: { answers, scoreVec: scoreVec ?? undefined },
      create: { userId, quizId, answers, scoreVec: scoreVec ?? undefined }
    });

    // Trigger incremental stats update (async, don't wait)
    // Extract question IDs from answers - only update affected questions
    const answerMap = answers as Record<string, string>;
    const questionIds = Object.keys(answerMap).map(id => BigInt(id));
    
    // Enqueue incremental update for affected questions only
    // This is much cheaper than recomputing the entire quiz
    setImmediate(async () => {
      try {
        // Import job dynamically to avoid circular dependencies
        const { quizAnswerStatsJob } = await import('../../jobs/quizAnswerStatsJob.js');
        await quizAnswerStatsJob.run({ quizId, questionIds });
      } catch (err) {
        console.error('Failed to update quiz answer stats:', err);
        // Don't fail the request if stats update fails
      }
    });

    return json(res, { ok: true });
  }
}
```

## Phase 4: Frontend Types & API Client

### Create Types

Create `frontend/src/ui/quiz/results/types.ts`:

```typescript
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
```

### Add API Client Method

Add to `frontend/src/api/client.ts`:

```typescript
// In API_PATHS
quizResults: '/api/quizzes/{quizId}/results',

// In api.quizzes object
results: (quizId: string | number, signal?: AbortSignal) => {
  const path = fillPath(API_PATHS.quizResults, { quizId })
  return http<QuizResults>(`${API_BASE_URL}${path}`, 'GET', { signal })
}
```

## Phase 5: Frontend Components

### Add Route

Update `frontend/src/App.tsx`:

```typescript
const QuizResultsPage = lazy(() => import('./ui/pages/QuizResultsPage').then(m => ({ default: m.QuizResultsPage })))

// In routes
<Route
  path="/quiz/:quizId/results"
  element={
    <ProtectedRoute>
      <Suspense fallback={<RouteLoader />}>
        <QuizResultsPage />
      </Suspense>
    </ProtectedRoute>
  }
/>
```

### Create QuizResultsPage

Create `frontend/src/ui/pages/QuizResultsPage.tsx`:

```typescript
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
        <h1>{data.quiz.title}</h1>
        <div className="u-muted">
          {data.userDemo.gender} • Age {data.userDemo.age} • {data.userDemo.city ?? 'No city'}
        </div>
      </div>
      
      <div className="quiz-results-questions">
        {data.questions.map((question) => (
          <QuestionCard key={question.questionId} question={question} />
        ))}
      </div>
    </div>
  )
}
```

### Create useQuizResults Hook

Create `frontend/src/ui/quiz/results/useQuizResults.ts`:

```typescript
import { useState, useEffect } from 'react'
import { api } from '../../../api/client'
import type { QuizResults } from './types'

export function useQuizResults(quizId?: string) {
  const [data, setData] = useState<QuizResults | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!quizId) {
      setError(new Error('Quiz ID required'))
      setLoading(false)
      return
    }

    let cancelled = false
    const controller = new AbortController()

    api.quizzes.results(quizId, controller.signal)
      .then((result) => {
        if (!cancelled) {
          setData(result)
          setError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [quizId])

  return { data, loading, error }
}
```

### Create QuestionCard Component

Create `frontend/src/ui/quiz/results/QuestionCard.tsx`:

```typescript
import type { QuestionResult } from './types'
import { AnswerComparison } from './AnswerComparison'

type Props = {
  question: QuestionResult
}

export function QuestionCard({ question }: Props) {
  const { questionPrompt, userSelectedAnswer } = question

  return (
    <div className="question-card">
      <h2 className="question-card-title">{questionPrompt}</h2>
      
      <div className="question-card-answer">
        <div className="question-card-answer-label">{userSelectedAnswer.optionLabel}</div>
        
        {Object.keys(userSelectedAnswer.traitValues).length > 0 && (
          <div className="question-card-traits">
            {Object.entries(userSelectedAnswer.traitValues)
              .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a)) // Sort by absolute value
              .slice(0, 3) // Show top 3 traits only
              .map(([key, value]) => (
                <div key={key} className="trait-item">
                  <span className="trait-key">{key}</span>
                  <span className="trait-value">{value > 0 ? '+' : ''}{value}</span>
                </div>
              ))}
            {Object.keys(userSelectedAnswer.traitValues).length > 3 && (
              <div className="trait-more u-muted">
                +{Object.keys(userSelectedAnswer.traitValues).length - 3} more
              </div>
            )}
          </div>
        )}
      </div>

      <AnswerComparison percentages={userSelectedAnswer.percentages} />
    </div>
  )
}
```

### Create AnswerComparison Component

Create `frontend/src/ui/quiz/results/AnswerComparison.tsx`:

```typescript
type Props = {
  percentages: {
    siteAverage: number
    userGender: number
    oppositeGender: number
    userAgeGroup: number
    userCity: number
    otherCity: number
  }
}

export function AnswerComparison({ percentages }: Props) {
  return (
    <div className="answer-comparison">
      <div className="comparison-item">
        <span className="comparison-label">Site average</span>
        <span className="comparison-value">{percentages.siteAverage}%</span>
      </div>
      
      <div className="comparison-item">
        <span className="comparison-label">Your gender</span>
        <span className="comparison-value">{percentages.userGender}%</span>
      </div>
      
      <div className="comparison-item">
        <span className="comparison-label">Opposite gender</span>
        <span className="comparison-value">{percentages.oppositeGender}%</span>
      </div>
      
      <div className="comparison-item">
        <span className="comparison-label">Your age group</span>
        <span className="comparison-value">{percentages.userAgeGroup}%</span>
      </div>
      
      <div className="comparison-item">
        <span className="comparison-label">Your city</span>
        <span className="comparison-value">{percentages.userCity}%</span>
      </div>
      
      <div className="comparison-item">
        <span className="comparison-label">Other city</span>
        <span className="comparison-value">{percentages.otherCity}%</span>
      </div>
    </div>
  )
}
```

### Update useQuizState

Update `frontend/src/ui/quiz/useQuizState.ts`:

```typescript
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
```

## Phase 6: Styling

Create `frontend/src/styles/quiz-results.css`:

```css
.quiz-results-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

.quiz-results-header {
  margin-bottom: 3rem;
  text-align: center;
}

.quiz-results-header h1 {
  font-size: 2.5rem;
  font-weight: bold;
  margin-bottom: 0.5rem;
}

.quiz-results-questions {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.question-card {
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 2rem;
}

.question-card-title {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 1.5rem;
}

.question-card-answer {
  margin-bottom: 1.5rem;
}

.question-card-answer-label {
  font-size: 1.25rem;
  font-weight: 500;
  margin-bottom: 1rem;
}

.question-card-traits {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1rem;
}

.trait-item {
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: #f5f5f5;
  border-radius: 4px;
  font-size: 0.9rem;
}

.trait-key {
  color: #666;
}

.trait-value {
  font-weight: 600;
}

.answer-comparison {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-top: 1.5rem;
  border-top: 1px solid #e0e0e0;
}

.comparison-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 0;
}

.comparison-label {
  color: #666;
  font-size: 0.95rem;
}

.comparison-value {
  font-weight: 600;
  font-size: 1.1rem;
}

@media (max-width: 768px) {
  .quiz-results-page {
    padding: 1rem;
  }
  
  .question-card {
    padding: 1.5rem;
  }
  
  .question-card-title {
    font-size: 1.25rem;
  }
}
```

Import in `frontend/src/main.tsx` or appropriate entry point.

## Testing Checklist

### Backend
- [ ] Job processes quiz correctly
- [ ] Job handles missing demographics gracefully
- [ ] Job updates incrementally on new submissions
- [ ] API returns correct percentages
- [ ] API handles missing quiz result (404)
- [ ] API handles missing demographics (null checks)
- [ ] "Other city" is deterministic

### Frontend
- [ ] Route redirects correctly after submission
- [ ] Results page loads and displays data
- [ ] Question cards render correctly
- [ ] Percentages display correctly
- [ ] Trait maps display correctly
- [ ] Mobile responsive
- [ ] Error states handled
- [ ] Loading states shown

## Performance Notes

### Job Performance
- **O(users) per quiz**: Job scans QuizResult once per quiz, not per option
- **In-memory aggregation**: All counting happens in memory after fetching data
- **Batch upserts**: Stats are written in batches for efficiency

### JSON Path Queries
- The job uses JSON path queries (`answers: { path: [...] }`) which is acceptable for now
- **Future optimization**: Consider normalizing QuizResult.answers into a separate table for better scaling
- This is a known scaling ceiling but acceptable for current volume

### Incremental Updates
- On quiz submission, only affected questions are recomputed
- This keeps updates fast and real-time-feeling
- Full refresh can be run periodically (e.g., daily) to catch any inconsistencies

## Deployment Notes

1. **Run initial job**: After deploying schema, run full refresh:
   ```bash
   tsx scripts/runJobs.ts quiz-answer-stats --fullRefresh
   ```

2. **Monitor job performance**: 
   - Watch for slow queries on large quizzes
   - Consider batching if processing multiple quizzes
   - Monitor memory usage for quizzes with many questions/options

3. **Cache considerations**: 
   - Consider caching API responses per quiz (invalidate on job run)
   - Cache "other city" selection per quiz (computed once)

4. **Incremental updates**: 
   - Ensure job triggers work correctly on quiz submission
   - Monitor that only affected questions are updated (not entire quiz)
