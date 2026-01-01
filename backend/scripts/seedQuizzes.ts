import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { prisma } from '../src/lib/prisma/client.js';

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

type QuizSeed = {
  slug: string;
  title: string;
  questions: Array<{
    prompt: string;
    options: Array<{ 
      label: string; 
      value: string;
      traitValues?: Record<string, number>; // e.g., {"personality.funny": 2, "personality.nice": -5}
    }>;
  }>;
};

const CORE_QUIZ: QuizSeed = {
  slug: 'seed-core-quiz',
  title: 'Core Questions',
  questions: [
    {
      prompt: 'Ideal Friday night?',
      options: [
        { 
          label: 'Cozy movie at home', 
          value: 'cozy_movie',
          traitValues: {
            'personality.introverted': 5,
            'lifestyle.homebody': 7,
            'personality.funny': -2,
            'lifestyle.active': -5
          }
        },
        { 
          label: 'Live music or comedy', 
          value: 'live_show',
          traitValues: {
            'personality.outgoing': 6,
            'personality.funny': 5,
            'lifestyle.social': 7,
            'interests.music': 8,
            'personality.introverted': -4
          }
        },
        { 
          label: 'Outdoor adventure', 
          value: 'adventure',
          traitValues: {
            'lifestyle.active': 8,
            'values.adventure': 9,
            'personality.outgoing': 4,
            'interests.sports': 6,
            'lifestyle.homebody': -7
          }
        }
      ]
    },
    {
      prompt: 'Pick a travel style',
      options: [
        { 
          label: 'City weekends', 
          value: 'city',
          traitValues: {
            'lifestyle.social': 6,
            'interests.culture': 7,
            'values.materialistic': 3,
            'lifestyle.active': 4
          }
        },
        { 
          label: 'Nature retreats', 
          value: 'nature',
          traitValues: {
            'personality.introverted': 4,
            'values.adventure': 6,
            'lifestyle.active': 7,
            'interests.nature': 8,
            'lifestyle.social': -3
          }
        },
        { 
          label: 'Beach reset', 
          value: 'beach',
          traitValues: {
            'personality.introverted': 3,
            'lifestyle.homebody': 2,
            'values.family': 5,
            'lifestyle.active': -2,
            'lifestyle.social': -1
          }
        }
      ]
    },
    {
      prompt: 'How social are you?',
      options: [
        { 
          label: 'Low-key and selective', 
          value: 'low_key',
          traitValues: {
            'personality.introverted': 7,
            'lifestyle.homebody': 5,
            'personality.outgoing': -6,
            'lifestyle.social': -5
          }
        },
        { 
          label: 'Balanced mix', 
          value: 'balanced',
          traitValues: {
            'personality.outgoing': 2,
            'personality.introverted': 0,
            'lifestyle.social': 2,
            'lifestyle.homebody': 2
          }
        },
        { 
          label: 'Always up for plans', 
          value: 'social',
          traitValues: {
            'personality.outgoing': 8,
            'lifestyle.social': 9,
            'personality.introverted': -7,
            'lifestyle.homebody': -6
          }
        }
      ]
    },
    {
      prompt: 'Choose a weekend activity',
      options: [
        { 
          label: 'Farmers market + brunch', 
          value: 'brunch',
          traitValues: {
            'lifestyle.homebody': 4,
            'interests.food': 8,
            'values.family': 5,
            'lifestyle.social': 3,
            'lifestyle.active': -2
          }
        },
        { 
          label: 'Hike or workout', 
          value: 'active',
          traitValues: {
            'lifestyle.active': 9,
            'interests.sports': 7,
            'values.health': 6,
            'personality.outgoing': 3,
            'lifestyle.homebody': -5
          }
        },
        { 
          label: 'Museum or gallery', 
          value: 'culture',
          traitValues: {
            'interests.culture': 8,
            'interests.arts': 7,
            'personality.analytical': 4,
            'personality.introverted': 2,
            'lifestyle.active': -3
          }
        }
      ]
    },
    {
      prompt: 'What makes you laugh?',
      options: [
        { 
          label: 'Dry wit and clever jokes', 
          value: 'dry_wit',
          traitValues: {
            'personality.funny': 6,
            'personality.analytical': 5,
            'personality.nice': -2,
            'interests.culture': 3
          }
        },
        { 
          label: 'Silly memes and physical comedy', 
          value: 'silly',
          traitValues: {
            'personality.funny': 8,
            'personality.outgoing': 4,
            'personality.analytical': -3,
            'lifestyle.social': 3
          }
        },
        { 
          label: 'Heartwarming stories', 
          value: 'heartwarming',
          traitValues: {
            'personality.nice': 7,
            'values.family': 6,
            'personality.funny': 2,
            'personality.outgoing': -2
          }
        }
      ]
    },
    {
      prompt: 'Your approach to decisions?',
      options: [
        { 
          label: 'Trust my gut, act fast', 
          value: 'intuitive',
          traitValues: {
            'personality.analytical': -5,
            'values.adventure': 4,
            'personality.outgoing': 3,
            'personality.introverted': -2
          }
        },
        { 
          label: 'Weigh pros and cons carefully', 
          value: 'analytical',
          traitValues: {
            'personality.analytical': 8,
            'personality.introverted': 3,
            'personality.outgoing': -2,
            'values.adventure': -3
          }
        },
        { 
          label: 'Ask friends for input', 
          value: 'collaborative',
          traitValues: {
            'lifestyle.social': 6,
            'values.family': 5,
            'personality.outgoing': 4,
            'personality.introverted': -4
          }
        }
      ]
    }
  ]
};

function toAnswers(seed: number, optionsCount: number) {
  if (optionsCount <= 1) return 0;
  return seed % optionsCount;
}

export async function seedQuizzes(options: {
  seedResults?: boolean;
  userIds?: bigint[];
  quizSlug?: string;
} = {}) {
  const quizSeed = options.quizSlug && options.quizSlug !== CORE_QUIZ.slug
    ? { ...CORE_QUIZ, slug: options.quizSlug }
    : CORE_QUIZ;

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
            traitValues: opt.traitValues ?? null
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
