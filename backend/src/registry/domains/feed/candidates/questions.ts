import { prisma } from '../../../../lib/prisma/client.js';
import { feedCandidateCaps } from './caps.js';
import type { FeedQuestionCandidate, ViewerContext } from '../types.js';

export async function getQuestionCandidates(_ctx: ViewerContext): Promise<FeedQuestionCandidate[]> {
  const max = feedCandidateCaps.questions.maxItems;
  if (max <= 0) return [];

  const quiz = await prisma.quiz.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      questions: {
        orderBy: { order: 'asc' },
        select: {
          id: true,
          prompt: true,
          order: true,
          options: {
            orderBy: { order: 'asc' },
            select: { id: true, label: true, value: true, order: true }
          }
        }
      }
    }
  });

  if (!quiz || quiz.questions.length === 0) return [];

  return quiz.questions.slice(0, max).map((question) => ({
    id: question.id,
    quizId: quiz.id,
    quizTitle: quiz.title,
    prompt: question.prompt,
    options: question.options.map((option) => ({
      id: option.id,
      label: option.label,
      value: option.value,
      order: option.order
    })),
    order: question.order
  }));
}
