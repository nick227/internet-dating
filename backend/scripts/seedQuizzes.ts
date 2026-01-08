import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/lib/prisma/client.js';
import { QUIZ_SEEDS } from './QUIZ_SEEDS';

function loadEnv() {
  if (process.env.DATABASE_URL) return;
  try {
    const raw = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, valueRaw] = match;
      if (process.env[key] != null) continue;
      let value = valueRaw.trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {}
}

loadEnv();

function toAnswers(seed: number, optionsCount: number) {
  if (optionsCount <= 1) return 0;
  return seed % optionsCount;
}

function getQuizSeed(quizSlug?: string) {
  const base = QUIZ_SEEDS.core;
  if (quizSlug && quizSlug !== base.slug) {
    return { ...base, slug: quizSlug };
  }
  return base;
}

export async function seedQuizzes(options: {
  seedResults?: boolean;
  userIds?: bigint[];
  quizSlug?: string;
} = {}) {
  const quizSeed = getQuizSeed(options.quizSlug);

  await prisma.quiz.updateMany({
    where: { isActive: true, slug: { not: quizSeed.slug } },
    data: { isActive: false }
  });

  const quiz = await prisma.quiz.upsert({
    where: { slug: quizSeed.slug },
    update: { title: quizSeed.title, isActive: true },
    create: { slug: quizSeed.slug, title: quizSeed.title, isActive: true },
    select: { id: true }
  });

  const existingQuestions = await prisma.quizQuestion.findMany({
    where: { quizId: quiz.id },
    select: { id: true }
  });
  const questionIds = existingQuestions.map((q) => q.id);
  if (questionIds.length) {
    await prisma.quizOption.deleteMany({ where: { questionId: { in: questionIds } } });
    await prisma.quizQuestion.deleteMany({ where: { id: { in: questionIds } } });
  }

  for (const [idx, question] of quizSeed.questions.entries()) {
    await prisma.quizQuestion.create({
      data: {
        quizId: quiz.id,
        prompt: question.prompt,
        order: idx + 1,
        options: {
          create: question.options.map((opt, optIdx) => ({
            label: opt.label,
            value: opt.value,
            order: optIdx + 1,
            traitValues: opt.traitValues ?? undefined
          }))
        }
      }
    });
  }

  if (options.seedResults === false) {
    return { quizId: quiz.id };
  }

  const userIds =
    options.userIds ??
    (await prisma.user.findMany({ select: { id: true } })).map((u) => u.id);

  if (!userIds.length) return { quizId: quiz.id };

  const quizWithQuestions = await prisma.quiz.findUnique({
    where: { id: quiz.id },
    select: {
      id: true,
      questions: {
        orderBy: { order: 'asc' },
        select: {
          id: true,
          order: true,
          options: { orderBy: { order: 'asc' }, select: { value: true } }
        }
      }
    }
  });
  if (!quizWithQuestions) return { quizId: quiz.id };

  for (const userId of userIds) {
    const seed = Number(userId % 97n);
    const answers: Record<string, string> = {};
    const scoreVec: number[] = [];

    for (const question of quizWithQuestions.questions) {
      const optIndex = toAnswers(seed + question.order, question.options.length);
      const opt = question.options[optIndex];
      answers[question.id.toString()] = opt?.value ?? question.options[0]?.value ?? 'A';
      const denom = Math.max(1, question.options.length - 1);
      scoreVec.push(optIndex / denom);
    }

    await prisma.quizResult.upsert({
      where: { userId_quizId: { userId, quizId: quiz.id } },
      update: { answers, scoreVec },
      create: { userId, quizId: quiz.id, answers, scoreVec }
    });
  }

  return { quizId: quiz.id };
}

function parseFlag(flag: string) {
  return process.argv.includes(flag);
}

function parseStringArg(flag: string, fallback: string | null = null) {
  const raw = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (!raw) return fallback;
  const value = raw.split('=')[1];
  return value?.length ? value : fallback;
}

async function main() {
  const skipResults = parseFlag('--skipResults');
  const quizSlug = parseStringArg('--quizSlug', null) ?? undefined;
  await seedQuizzes({ seedResults: !skipResults, quizSlug });
  console.log('Seeded quiz data.');
}

const isDirect = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirect) {
  main()
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
