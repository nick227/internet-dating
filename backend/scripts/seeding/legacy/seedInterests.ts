import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { prisma } from '../../../src/lib/prisma/client.js';

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

type SeedSubject = {
  key: string;
  label: string;
  interests: Array<{ key: string; label: string }>;
};

const SUBJECTS: SeedSubject[] = [
  {
    key: 'music',
    label: 'Music',
    interests: [
      { key: 'indie', label: 'Indie' },
      { key: 'hiphop', label: 'Hip-hop' },
      { key: 'jazz', label: 'Jazz' },
      { key: 'rock', label: 'Rock' },
      { key: 'edm', label: 'EDM' }
    ]
  },
  {
    key: 'film',
    label: 'Film',
    interests: [
      { key: 'documentary', label: 'Documentary' },
      { key: 'thriller', label: 'Thriller' },
      { key: 'romance', label: 'Romance' },
      { key: 'comedy', label: 'Comedy' },
      { key: 'sci-fi', label: 'Sci-Fi' }
    ]
  },
  {
    key: 'sports',
    label: 'Sports',
    interests: [
      { key: 'soccer', label: 'Soccer' },
      { key: 'basketball', label: 'Basketball' },
      { key: 'tennis', label: 'Tennis' },
      { key: 'running', label: 'Running' },
      { key: 'climbing', label: 'Climbing' }
    ]
  },
  {
    key: 'food',
    label: 'Food',
    interests: [
      { key: 'sushi', label: 'Sushi' },
      { key: 'bbq', label: 'BBQ' },
      { key: 'baking', label: 'Baking' },
      { key: 'coffee', label: 'Coffee' },
      { key: 'tacos', label: 'Tacos' }
    ]
  },
  {
    key: 'travel',
    label: 'Travel',
    interests: [
      { key: 'roadtrips', label: 'Road Trips' },
      { key: 'beaches', label: 'Beaches' },
      { key: 'mountains', label: 'Mountains' },
      { key: 'cities', label: 'Cities' },
      { key: 'weekenders', label: 'Weekend Trips' }
    ]
  }
];

function pick<T>(items: T[], count: number) {
  const out: T[] = [];
  const pool = [...items];
  while (out.length < count && pool.length) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]!);
  }
  return out;
}

export async function seedInterests() {
  for (const subject of SUBJECTS) {
    const subjectRow = await prisma.interestSubject.upsert({
      where: { key: subject.key },
      update: { label: subject.label },
      create: { key: subject.key, label: subject.label },
      select: { id: true }
    });

    for (const interest of subject.interests) {
      await prisma.interest.upsert({
        where: { subjectId_key: { subjectId: subjectRow.id, key: interest.key } },
        update: { label: interest.label },
        create: { subjectId: subjectRow.id, key: interest.key, label: interest.label }
      });
    }
  }

  const users = await prisma.user.findMany({ select: { id: true } });
  const allInterests = await prisma.interest.findMany({
    select: { id: true, subjectId: true }
  });

  await prisma.userInterest.deleteMany({
    where: { userId: { in: users.map((u) => u.id) } }
  });

  for (const user of users) {
    const selections = pick(allInterests, 5);
    if (!selections.length) continue;
    await prisma.userInterest.createMany({
      data: selections.map((interest) => ({
        userId: user.id,
        subjectId: interest.subjectId,
        interestId: interest.id
      })),
      skipDuplicates: true
    });
  }

  console.log(`Seeded ${SUBJECTS.length} subjects and ${allInterests.length} interests.`);
}

async function main() {
  await seedInterests();
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
