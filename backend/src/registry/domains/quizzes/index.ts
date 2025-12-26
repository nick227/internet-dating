import type { DomainRegistry } from '../../types.js';
import { Auth } from '../../../lib/auth/rules.js';
import { prisma } from '../../../lib/prisma/client.js';
import { json } from '../../../lib/http/json.js';
import { parsePositiveBigInt } from '../../../lib/http/parse.js';

const quizEditorIds = new Set(
  (process.env.QUIZ_EDITOR_USER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
);
const allowAnyEditor = process.env.NODE_ENV !== 'production';

function assertQuizEditor(userId: bigint) {
  if (quizEditorIds.size === 0) return allowAnyEditor;
  return quizEditorIds.has(userId.toString());
}

export const quizzesDomain: DomainRegistry = {
  domain: 'quizzes',
  routes: [
    {
      id: 'quizzes.GET./quizzes/active',
      method: 'GET',
      path: '/quizzes/active',
      auth: Auth.public(),
      summary: 'Get active quiz',
      tags: ['quizzes'],
      handler: async (_req, res) => {
        const quiz = await prisma.quiz.findFirst({
          where: { isActive: true },
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            slug: true,
            title: true,
            questions: {
              orderBy: { order: 'asc' },
              select: {
                id: true,
                prompt: true,
                order: true,
                options: { orderBy: { order: 'asc' }, select: { id: true, label: true, value: true, order: true } }
              }
            }
          }
        });
        return json(res, { quiz });
      }
    },
    {
      id: 'quizzes.POST./quizzes/:quizId/submit',
      method: 'POST',
      path: '/quizzes/:quizId/submit',
      auth: Auth.user(),
      summary: 'Submit quiz',
      tags: ['quizzes'],
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

        return json(res, { ok: true });
      }
    },
    {
      id: 'quizzes.PATCH./quizzes/:quizId',
      method: 'PATCH',
      path: '/quizzes/:quizId',
      auth: Auth.user(),
      summary: 'Update quiz',
      tags: ['quizzes'],
      handler: async (req, res) => {
        const userId = req.ctx.userId!;
        if (!assertQuizEditor(userId)) {
          return json(res, { error: 'Forbidden' }, 403);
        }
        const quizParsed = parsePositiveBigInt(req.params.quizId, 'quizId');
        if (!quizParsed.ok) return json(res, { error: quizParsed.error }, 400);
        const quizId = quizParsed.value;
        const body = (req.body ?? {}) as { title?: unknown };
        if (!Object.prototype.hasOwnProperty.call(body, 'title')) {
          return json(res, { error: 'title required' }, 400);
        }
        if (typeof body.title !== 'string' || !body.title.trim()) {
          return json(res, { error: 'title must be a non-empty string' }, 400);
        }

        const updated = await prisma.quiz.update({
          where: { id: quizId },
          data: { title: body.title.trim() },
          select: { id: true, title: true, updatedAt: true }
        });
        return json(res, updated);
      }
    },
    {
      id: 'quizzes.PATCH./quizzes/:quizId/questions/:questionId',
      method: 'PATCH',
      path: '/quizzes/:quizId/questions/:questionId',
      auth: Auth.user(),
      summary: 'Update quiz question',
      tags: ['quizzes'],
      handler: async (req, res) => {
        const userId = req.ctx.userId!;
        if (!assertQuizEditor(userId)) {
          return json(res, { error: 'Forbidden' }, 403);
        }
        const quizParsed = parsePositiveBigInt(req.params.quizId, 'quizId');
        if (!quizParsed.ok) return json(res, { error: quizParsed.error }, 400);
        const questionParsed = parsePositiveBigInt(req.params.questionId, 'questionId');
        if (!questionParsed.ok) return json(res, { error: questionParsed.error }, 400);
        const quizId = quizParsed.value;
        const questionId = questionParsed.value;

        const body = (req.body ?? {}) as { prompt?: unknown };
        if (!Object.prototype.hasOwnProperty.call(body, 'prompt')) {
          return json(res, { error: 'prompt required' }, 400);
        }
        if (typeof body.prompt !== 'string' || !body.prompt.trim()) {
          return json(res, { error: 'prompt must be a non-empty string' }, 400);
        }

        const existing = await prisma.quizQuestion.findFirst({
          where: { id: questionId, quizId },
          select: { id: true }
        });
        if (!existing) return json(res, { error: 'Question not found' }, 404);

        const updated = await prisma.quizQuestion.update({
          where: { id: questionId },
          data: { prompt: body.prompt.trim() },
          select: { id: true, prompt: true }
        });
        return json(res, updated);
      }
    },
    {
      id: 'quizzes.PATCH./quizzes/:quizId/questions/:questionId/options/:optionId',
      method: 'PATCH',
      path: '/quizzes/:quizId/questions/:questionId/options/:optionId',
      auth: Auth.user(),
      summary: 'Update quiz option',
      tags: ['quizzes'],
      handler: async (req, res) => {
        const userId = req.ctx.userId!;
        if (!assertQuizEditor(userId)) {
          return json(res, { error: 'Forbidden' }, 403);
        }
        const quizParsed = parsePositiveBigInt(req.params.quizId, 'quizId');
        if (!quizParsed.ok) return json(res, { error: quizParsed.error }, 400);
        const questionParsed = parsePositiveBigInt(req.params.questionId, 'questionId');
        if (!questionParsed.ok) return json(res, { error: questionParsed.error }, 400);
        const optionParsed = parsePositiveBigInt(req.params.optionId, 'optionId');
        if (!optionParsed.ok) return json(res, { error: optionParsed.error }, 400);
        const quizId = quizParsed.value;
        const questionId = questionParsed.value;
        const optionId = optionParsed.value;

        const body = (req.body ?? {}) as { label?: unknown };
        if (!Object.prototype.hasOwnProperty.call(body, 'label')) {
          return json(res, { error: 'label required' }, 400);
        }
        if (typeof body.label !== 'string' || !body.label.trim()) {
          return json(res, { error: 'label must be a non-empty string' }, 400);
        }

        const existing = await prisma.quizOption.findFirst({
          where: { id: optionId, questionId, question: { quizId } },
          select: { id: true }
        });
        if (!existing) return json(res, { error: 'Option not found' }, 404);

        const updated = await prisma.quizOption.update({
          where: { id: optionId },
          data: { label: body.label.trim() },
          select: { id: true, label: true, value: true }
        });
        return json(res, updated);
      }
    }
  ]
};
