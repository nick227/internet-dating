import crypto from 'node:crypto';
import { prisma } from '../../prisma/client.js';

type HashEntry = [string, unknown];

function normalizeValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (value === undefined) return null;
  return value;
}

export function isFullRun(): boolean {
  return process.env.JOB_FULL === '1' || process.env.JOB_FORCE === '1';
}

export function hashKeyValues(entries: HashEntry[]): string {
  const payload = JSON.stringify(entries.map(([key, value]) => [key, normalizeValue(value)]));
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export async function isJobFresh(jobName: string, scope: string, inputHash: string): Promise<boolean> {
  if (isFullRun()) return false;
  try {
    const record = await prisma.jobFreshness.findUnique({
      where: { jobName_scope: { jobName, scope } },
      select: { inputHash: true }
    });
    return record?.inputHash === inputHash;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'P2021') {
      return false;
    }
    throw err;
  }
}

export async function upsertJobFreshness(
  jobName: string,
  scope: string,
  inputHash: string,
  computedAt: Date = new Date()
): Promise<void> {
  try {
    await prisma.jobFreshness.upsert({
      where: { jobName_scope: { jobName, scope } },
      create: { jobName, scope, inputHash, computedAt },
      update: { inputHash, computedAt }
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'P2021') {
      return;
    }
    throw err;
  }
}
