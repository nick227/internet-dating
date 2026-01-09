import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { prisma } from '../../src/lib/prisma/client.js';
import { reconcileStats } from '../../src/jobs/statsReconcileJob.js';

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

function parseIntArg(flag: string, fallback: number) {
  const raw = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (!raw) return fallback;
  const value = raw.split('=')[1];
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function main() {
  loadEnv();
  const batchSize = parseIntArg('--batchSize', 200);
  const pauseMs = parseIntArg('--pauseMs', 50);

  const result = await reconcileStats({ full: true, batchSize, pauseMs });
  console.log('Backfill complete:', result);
}

const isDirect = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirect) {
  main()
    .catch((err) => {
      console.error('Backfill failed:', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
