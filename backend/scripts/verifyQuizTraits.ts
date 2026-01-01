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

async function main() {
  const quiz = await prisma.quiz.findFirst({
    where: { slug: 'seed-core-quiz' },
    include: {
      questions: {
        orderBy: { order: 'asc' },
        include: {
          options: {
            orderBy: { order: 'asc' }
          }
        }
      }
    }
  });

  if (!quiz) {
    console.log('❌ Quiz not found');
    return;
  }

  console.log(`\n✅ Quiz: "${quiz.title}" (${quiz.slug})`);
  console.log(`   Questions: ${quiz.questions.length}\n`);

  let totalOptions = 0;
  let optionsWithTraits = 0;

  for (const question of quiz.questions) {
    console.log(`   Q${question.order}: ${question.prompt}`);
    
    for (const option of question.options) {
      totalOptions++;
      const hasTraits = option.traitValues && typeof option.traitValues === 'object';
      if (hasTraits) {
        optionsWithTraits++;
        const traits = option.traitValues as Record<string, number>;
        const traitEntries = Object.entries(traits).map(([key, value]) => `${key}=${value}`).join(', ');
        console.log(`      ✓ "${option.label}" → [${traitEntries}]`);
      } else {
        console.log(`      ✗ "${option.label}" → (no traits)`);
      }
    }
    console.log();
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Total options: ${totalOptions}`);
  console.log(`   Options with traits: ${optionsWithTraits}`);
  console.log(`   Coverage: ${Math.round((optionsWithTraits / totalOptions) * 100)}%\n`);
}

main()
  .catch((err) => {
    console.error('Verification failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
