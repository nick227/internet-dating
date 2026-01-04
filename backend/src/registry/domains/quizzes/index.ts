import type { DomainRegistry } from '../../types.js';
import { Auth } from '../../../lib/auth/rules.js';
import { prisma } from '../../../lib/prisma/client.js';
import { json } from '../../../lib/http/json.js';
import { parsePositiveBigInt } from '../../../lib/http/parse.js';
// Note: User traits are rebuilt by the build-user-traits backend job only
// Do not import rebuildUserTraits here - it's a worker job, not triggered on quiz submission

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
            tags: { select: { slug: true, label: true } },
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
      id: 'quizzes.GET./quizzes/:quizId',
      method: 'GET',
      path: '/quizzes/:quizId',
      auth: Auth.public(),
      summary: 'Get quiz by id',
      tags: ['quizzes'],
      handler: async (req, res) => {
        const quizParsed = parsePositiveBigInt(req.params.quizId, 'quizId');
        if (!quizParsed.ok) return json(res, { error: quizParsed.error }, 400);
        const quizId = quizParsed.value;

        const quiz = await prisma.quiz.findUnique({
          where: { id: quizId },
          select: {
            id: true,
            slug: true,
            title: true,
            tags: { select: { slug: true, label: true } },
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

        if (!quiz) return json(res, { error: 'Quiz not found' }, 404);
        return json(res, { quiz });
      }
    },
    {
      id: 'quizzes.GET./quizzes',
      method: 'GET',
      path: '/quizzes',
      auth: Auth.public(),
      summary: 'List quizzes',
      tags: ['quizzes'],
      handler: async (req, res) => {
        const { q, status, tag } = req.query as { q?: string; status?: string; tag?: string };
        const userId = req.ctx.userId; // Assuming public auth might populate this if logged in

        const where: any = { isActive: true };
        
        if (q) {
          where.OR = [
            { title: { contains: q } },
            { slug: { contains: q } }
          ];
        }

        if (tag && tag !== 'all') {
             where.tags = { some: { slug: tag } };
        }

        const quizzes = await prisma.quiz.findMany({
          where,
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            slug: true,
            title: true,
            tags: { select: { slug: true, label: true } },
            _count: { select: { questions: true } },
            // If user is logged in, we could fetch results here relationally if we map it
            // but mapped relation with 'where userId' inside 'include' is cleaner if prisma supports it safely
            // easier to just fetch results separately or accept all results and filter in memory if list is small, 
            // but let's try separate query for efficiency if list is paginated (future proofing)
            // ideally: results: { where: { userId } }
          }
        });

        let userResults: Map<string, any> = new Map();
        if (userId) {
            const results = await prisma.quizResult.findMany({
                where: { 
                    userId: BigInt(userId),
                    quizId: { in: quizzes.map(q => q.id) }
                },
                select: { quizId: true, answers: true }
            });
            results.forEach(r => userResults.set(r.quizId.toString(), r));
        }

        const items = quizzes.map(q => {
            const result = userResults.get(q.id.toString());
            let itemStatus = 'new';
            let quizResult = undefined;

            if (result) {
                itemStatus = 'completed'; 
                // Identify result based on scoring if we had the logic here, 
                // for now just say 'Completed' or generic result
                quizResult = 'Completed'; 
            }

            return {
                ...q,
                questionCount: q._count.questions,
                status: itemStatus,
                result: quizResult
            };
        });
        
        // Post-filtering for status since we compute it
        const finalItems = status && status !== 'all' 
            ? items.filter(i => i.status === status) 
            : items;

        return json(res, { items: finalItems });
      }
    },
    {
      id: 'quizzes.GET./quizzes/tags',
      method: 'GET',
      path: '/quizzes/tags',
      auth: Auth.public(),
      summary: 'List quiz tags',
      tags: ['quizzes'],
      handler: async (_req, res) => {
        const tags = await prisma.quizTag.findMany({
          orderBy: { label: 'asc' }
        });
        return json(res, { tags });
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

        // Note: User traits are rebuilt by the build-user-traits backend job only
        // Do not trigger rebuild here - it's a worker job, not triggered on quiz submission

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
