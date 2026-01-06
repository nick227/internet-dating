import { readFileSync } from 'node:fs';

export function loadEnv() {
  if (process.env.DATABASE_URL) return;
  try {
    const raw = readFileSync(new URL('../../.env', import.meta.url), 'utf8');
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

export function parseIntArg(flag: string, fallback: number): number {
  const raw = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (!raw) return fallback;
  const value = raw.split('=')[1];
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseBigIntArg(flag: string): bigint | null {
  const raw = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (!raw) return null;
  const value = raw.split('=')[1];
  if (!value || !/^\d+$/.test(value)) return null;
  return BigInt(value);
}

export function parseIntArrayArg(flag: string): number[] | null {
  const raw = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (!raw) return null;
  const value = raw.split('=')[1];
  if (!value) return null;
  const parts = value.split(',');
  const parsed = parts
    .map(p => p.trim())
    .filter(p => /^\d+$/.test(p))
    .map(p => Number.parseInt(p, 10))
    .filter(n => Number.isFinite(n) && n > 0);
  return parsed.length > 0 ? parsed : null;
}

export function parseFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

export function getEnvVar(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}
