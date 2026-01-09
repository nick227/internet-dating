/**
 * seedMassProfiles - Phase A: Identity & Profile Creation
 * Creates users, profiles, media, interests, and quiz answers
 * No activity graph edges (likes, matches, messages) - that's Phase B
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { prisma } from '../../../src/lib/prisma/client.js';
import { generateProfiles } from '../lib/profileGenerator.js';
import { makeUserRng } from '../lib/prng.js';
import { insertBatch, createProgressTracker } from '../lib/batchInserter.js';

function loadEnv() {
  if (process.env.DATABASE_URL) return;
  try {
    const raw = readFileSync(new URL('../../../.env', import.meta.url), 'utf8');
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

interface SeedOptions {
  runSeed: string;
  count: number;
  batchSize?: number;
  pauseMs?: number;
}

async function ensureInterests() {
  const subjects = [
    { key: 'music', label: 'Music', interests: [
      { key: 'indie', label: 'Indie' },
      { key: 'hiphop', label: 'Hip-hop' },
      { key: 'jazz', label: 'Jazz' },
      { key: 'rock', label: 'Rock' },
      { key: 'edm', label: 'EDM' }
    ]},
    { key: 'film', label: 'Film', interests: [
      { key: 'documentary', label: 'Documentary' },
      { key: 'thriller', label: 'Thriller' },
      { key: 'romance', label: 'Romance' },
      { key: 'comedy', label: 'Comedy' },
      { key: 'sci-fi', label: 'Sci-Fi' }
    ]},
    { key: 'sports', label: 'Sports', interests: [
      { key: 'soccer', label: 'Soccer' },
      { key: 'basketball', label: 'Basketball' },
      { key: 'tennis', label: 'Tennis' },
      { key: 'running', label: 'Running' },
      { key: 'climbing', label: 'Climbing' }
    ]},
    { key: 'food', label: 'Food', interests: [
      { key: 'sushi', label: 'Sushi' },
      { key: 'bbq', label: 'BBQ' },
      { key: 'baking', label: 'Baking' },
      { key: 'coffee', label: 'Coffee' },
      { key: 'tacos', label: 'Tacos' }
    ]},
    { key: 'travel', label: 'Travel', interests: [
      { key: 'roadtrips', label: 'Road Trips' },
      { key: 'beaches', label: 'Beaches' },
      { key: 'mountains', label: 'Mountains' },
      { key: 'cities', label: 'Cities' },
      { key: 'weekenders', label: 'Weekend Trips' }
    ]}
  ];
  
  const interestMap = new Map<string, { subjectId: bigint; interestId: bigint }>();
  
  for (const subject of subjects) {
    const subjectRow = await prisma.interestSubject.upsert({
      where: { key: subject.key },
      update: { label: subject.label },
      create: { key: subject.key, label: subject.label },
      select: { id: true }
    });
    
    for (const interest of subject.interests) {
      const interestRow = await prisma.interest.upsert({
        where: { subjectId_key: { subjectId: subjectRow.id, key: interest.key } },
        update: { label: interest.label },
        create: { subjectId: subjectRow.id, key: interest.key, label: interest.label },
        select: { id: true }
      });
      
      interestMap.set(`${subject.key}:${interest.key}`, {
        subjectId: subjectRow.id,
        interestId: interestRow.id
      });
    }
  }
  
  return interestMap;
}

async function ensureQuiz() {
  const QUIZ_SEED = {
    slug: 'core-preferences',
    title: 'Core Preferences',
    questions: [
      {
        prompt: 'Ideal Friday night?',
        options: [
          { label: 'Cozy movie at home', value: 'cozy' },
          { label: 'Live music or comedy', value: 'live' },
          { label: 'Outdoor adventure', value: 'adventure' }
        ]
      },
      {
        prompt: 'Pick a travel style',
        options: [
          { label: 'City weekends', value: 'city' },
          { label: 'Nature retreats', value: 'nature' },
          { label: 'Beach reset', value: 'beach' }
        ]
      },
      {
        prompt: 'Pick a playlist',
        options: [
          { label: 'Indie discoveries', value: 'indie' },
          { label: 'Hip-hop classics', value: 'hiphop' },
          { label: 'Pop energy', value: 'pop' }
        ]
      },
      {
        prompt: 'How social are you?',
        options: [
          { label: 'Low-key and selective', value: 'low' },
          { label: 'Balanced mix', value: 'balanced' },
          { label: 'Always up for plans', value: 'social' }
        ]
      },
      {
        prompt: 'Weekend ritual?',
        options: [
          { label: 'Farmers market + brunch', value: 'brunch' },
          { label: 'Hike or workout', value: 'active' },
          { label: 'Museum or gallery', value: 'culture' }
        ]
      }
    ]
  };
  
  await prisma.quiz.updateMany({
    where: { isActive: true, slug: { not: QUIZ_SEED.slug } },
    data: { isActive: false }
  });
  
  const quiz = await prisma.quiz.upsert({
    where: { slug: QUIZ_SEED.slug },
    update: { title: QUIZ_SEED.title, isActive: true },
    create: { slug: QUIZ_SEED.slug, title: QUIZ_SEED.title, isActive: true },
    select: { id: true }
  });
  
  const existingQuestions = await prisma.quizQuestion.findMany({
    where: { quizId: quiz.id },
    select: { id: true }
  });
  
  if (existingQuestions.length) {
    const questionIds = existingQuestions.map(q => q.id);
    await prisma.quizOption.deleteMany({ where: { questionId: { in: questionIds } } });
    await prisma.quizQuestion.deleteMany({ where: { id: { in: questionIds } } });
  }
  
  const questions: Array<{ id: bigint; options: Array<{ value: string }> }> = [];
  for (const [idx, question] of QUIZ_SEED.questions.entries()) {
    const created = await prisma.quizQuestion.create({
      data: {
        quizId: quiz.id,
        prompt: question.prompt,
        order: idx + 1,
        options: {
          create: question.options.map((opt, optIdx) => ({
            label: opt.label,
            value: opt.value,
            order: optIdx + 1
          }))
        }
      },
      select: {
        id: true,
        options: { orderBy: { order: 'asc' }, select: { value: true } }
      }
    });
    questions.push(created);
  }
  
  return { quizId: quiz.id, questions };
}

export async function seedMassProfiles(options: SeedOptions) {
  const { runSeed, count, batchSize = 50, pauseMs = 20 } = options;
  
  console.log(`\n=== Phase A: Seeding ${count} profiles ===`);
  console.log(`Run seed: ${runSeed}`);
  
  // Step 1: Generate all profiles in-memory
  console.log('\n[1/7] Generating profiles...');
  const profiles = generateProfiles(runSeed, count);
  console.log(`  Generated ${profiles.length} profiles`);
  
  // Step 2: Ensure interests and quiz exist
  console.log('\n[2/7] Ensuring interests...');
  const interestMap = await ensureInterests();
  console.log(`  Loaded ${interestMap.size} interests`);
  
  console.log('\n[3/7] Ensuring quiz...');
  const quiz = await ensureQuiz();
  console.log(`  Quiz ready with ${quiz.questions.length} questions`);
  
  // Step 3: Insert users
  console.log('\n[4/7] Inserting users...');
  const passwordHash = await bcrypt.hash('Password123!', 10);
  const userRows = profiles.map(p => ({
    email: p.email,
    passwordHash
  }));
  
  const tracker1 = createProgressTracker('Users', userRows.length);
  await insertBatch('user', userRows, {
    batchSize,
    pauseMs,
    onProgress: tracker1.log.bind(tracker1)
  });
  
  // Get inserted user IDs
  const users = await prisma.user.findMany({
    where: { email: { in: profiles.map(p => p.email) } },
    select: { id: true, email: true }
  });
  const emailToUserId = new Map(users.map(u => [u.email, u.id]));
  
  // Update profile userIds with actual DB IDs
  for (const profile of profiles) {
    const actualUserId = emailToUserId.get(profile.email);
    if (actualUserId) {
      profile.userId = actualUserId;
    }
  }
  
  // Step 4: Insert profiles
  console.log('\n[5/7] Inserting profiles...');
  const profileRows = profiles.map(p => ({
    userId: p.userId,
    displayName: p.displayName,
    bio: p.bio,
    birthdate: p.birthdate,
    locationText: p.locationText,
    lat: p.lat,
    lng: p.lng,
    gender: p.gender,
    intent: p.intent,
    isVisible: true
  }));
  
  const tracker2 = createProgressTracker('Profiles', profileRows.length);
  await insertBatch('profile', profileRows, {
    batchSize,
    pauseMs,
    onProgress: tracker2.log.bind(tracker2)
  });
  
  // Step 5: Insert media
  console.log('\n[6/7] Inserting media...');
  const mediaRows = profiles.flatMap(p =>
    p.media.map((m) => ({
      userId: p.userId,
      ownerUserId: p.userId,
      status: 'READY' as const,
      visibility: 'PUBLIC' as const,
      type: m.type,
      url: m.url,
      thumbUrl: m.thumbUrl,
      width: m.width,
      height: m.height,
      durationSec: m.durationSec
    }))
  );
  
  const tracker3 = createProgressTracker('Media', mediaRows.length);
  await insertBatch('media', mediaRows, {
    batchSize: 100,
    pauseMs,
    onProgress: tracker3.log.bind(tracker3)
  });
  
  // Get media IDs and set avatar/hero
  const mediaByUser = await prisma.media.findMany({
    where: { userId: { in: profiles.map(p => p.userId) } },
    select: { id: true, userId: true },
    orderBy: { id: 'asc' }
  });
  
  const userMediaMap = new Map<bigint, bigint[]>();
  for (const media of mediaByUser) {
    if (!userMediaMap.has(media.userId)) {
      userMediaMap.set(media.userId, []);
    }
    userMediaMap.get(media.userId)!.push(media.id);
  }
  
  // Update profiles with avatar and hero
  for (const [userId, mediaIds] of userMediaMap) {
    if (mediaIds.length > 0) {
      await prisma.profile.update({
        where: { userId },
        data: {
          avatarMediaId: mediaIds[0],
          heroMediaId: mediaIds[Math.min(1, mediaIds.length - 1)]
        }
      });
    }
  }
  
  // Step 6: Insert interests
  console.log('\n[7/7] Inserting interests and quiz answers...');
  const interestRows: Array<{ userId: bigint; subjectId: bigint; interestId: bigint }> = [];
  const dirtyInterests = new Set<bigint>();
  
  for (const profile of profiles) {
    for (const interestKey of profile.interests) {
      const interest = interestMap.get(interestKey);
      if (interest) {
        interestRows.push({
          userId: profile.userId,
          subjectId: interest.subjectId,
          interestId: interest.interestId
        });
        dirtyInterests.add(interest.interestId);
      }
    }
  }
  
  await insertBatch('userInterest', interestRows, {
    batchSize: 100,
    pauseMs: 10
  });
  
  // Mark interests dirty
  const dirtyRows = Array.from(dirtyInterests).map(interestId => ({ interestId }));
  await insertBatch('interestDirty', dirtyRows, {
    batchSize: 100,
    pauseMs: 10,
    skipDuplicates: true
  });
  
  // Step 7: Insert quiz answers
  const quizAnswerRows: Array<{
    userId: bigint;
    quizId: bigint;
    answers: Record<string, string>;
    scoreVec: number[];
  }> = [];
  
  for (const profile of profiles) {
    if (!profile.completeQuiz) continue;
    
    const rng = makeUserRng(runSeed, profile.userId, 'quiz');
    const answers: Record<string, string> = {};
    const scoreVec: number[] = [];
    
    for (const question of quiz.questions) {
      // Pick answer based on personality (90% archetype match, 10% random)
      const optIndex = rng.bool(0.9)
        ? rng.nextInt(question.options.length)
        : rng.nextInt(question.options.length);
      
      const option = question.options[optIndex] || question.options[0]!;
      answers[question.id.toString()] = option.value;
      
      const denom = Math.max(1, question.options.length - 1);
      scoreVec.push(optIndex / denom);
    }
    
    quizAnswerRows.push({
      userId: profile.userId,
      quizId: quiz.quizId,
      answers,
      scoreVec
    });
  }
  
  await insertBatch('quizResult', quizAnswerRows, {
    batchSize: 100,
    pauseMs: 10
  });
  
  console.log(`\n✓ Phase A complete: ${profiles.length} profiles created`);
  console.log(`  - ${quizAnswerRows.length} quiz results (${((quizAnswerRows.length / profiles.length) * 100).toFixed(1)}%)`);
  console.log(`  - ${interestRows.length} user interests (avg ${(interestRows.length / profiles.length).toFixed(1)}/user)`);
  
  return {
    runSeed,
    count: profiles.length,
    userIds: profiles.map(p => p.userId)
  };
}

function parseArg(flag: string, fallback: string): string {
  const raw = process.argv.find(arg => arg.startsWith(`${flag}=`));
  if (!raw) return fallback;
  const value = raw.split('=')[1];
  return value?.length ? value : fallback;
}

function parseIntArg(flag: string, fallback: number): number {
  const raw = process.argv.find(arg => arg.startsWith(`${flag}=`));
  if (!raw) return fallback;
  const value = raw.split('=')[1];
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function main() {
  const runSeed = parseArg('--runSeed', `seed-${Date.now()}`);
  const count = parseIntArg('--count', 100);
  const batchSize = parseIntArg('--batchSize', 50);
  
  await seedMassProfiles({ runSeed, count, batchSize });
}

const isDirect = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirect) {
  main()
    .catch(err => {
      console.error('Seed failed:', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
