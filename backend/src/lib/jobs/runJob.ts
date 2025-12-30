import { prisma } from '../prisma/client.js';
import { Prisma } from '@prisma/client';

type JobTrigger = 'CRON' | 'EVENT' | 'MANUAL';

type RunJobOptions = {
  jobName: string;
  trigger?: JobTrigger;
  scope?: string | null;
  algorithmVersion?: string | null;
  attempt?: number;
  metadata?: Record<string, unknown> | null;
};

function toErrorMessage(err: unknown) {
  if (err instanceof Error) return err.stack ?? err.message;
  return typeof err === 'string' ? err : JSON.stringify(err);
}

export async function runJob<T>(options: RunJobOptions, handler: () => Promise<T>): Promise<T> {
  const startedAt = new Date();
  const jobRun = await prisma.jobRun.create({
    data: {
      jobName: options.jobName,
      status: 'RUNNING',
      trigger: options.trigger ?? 'MANUAL',
      scope: options.scope ?? null,
      algorithmVersion: options.algorithmVersion ?? null,
      attempt: options.attempt ?? 1,
      startedAt,
      metadata: options.metadata ? (options.metadata as Prisma.InputJsonValue) : Prisma.JsonNull
    },
    select: { id: true }
  });

  try {
    const result = await handler();
    const finishedAt = new Date();
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: 'SUCCESS',
        finishedAt,
        durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime())
      }
    });
    return result;
  } catch (err) {
    const finishedAt = new Date();
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: 'FAILED',
        finishedAt,
        durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
        error: toErrorMessage(err)
      }
    });
    throw err;
  }
}
