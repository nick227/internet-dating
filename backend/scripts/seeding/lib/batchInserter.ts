/**
 * Efficient batch insertion utilities
 * Handles chunking, pausing, and error recovery
 */

import { prisma } from '../../../src/lib/prisma/client.js';

interface BatchOptions {
  batchSize?: number;
  pauseMs?: number;
  skipDuplicates?: boolean;
  onProgress?: (inserted: number, total: number) => void;
}

export async function insertBatch<T extends object>(
  table: string,
  rows: T[],
  options: BatchOptions = {}
): Promise<void> {
  const {
    batchSize = 100,
    pauseMs = 20,
    skipDuplicates = true,
    onProgress
  } = options;
  
  if (rows.length === 0) return;
  
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    chunks.push(rows.slice(i, i + batchSize));
  }
  
  let inserted = 0;
  for (const chunk of chunks) {
    // Type-safe batch insert
    const model = (prisma as unknown as Record<string, unknown>)[table] as {
      createMany: (args: { data: unknown[]; skipDuplicates?: boolean }) => Promise<unknown>;
    };
    
    if (!model?.createMany) {
      throw new Error(`Table ${table} does not support createMany`);
    }
    
    await model.createMany({
      data: chunk as unknown[],
      skipDuplicates
    });
    
    inserted += chunk.length;
    onProgress?.(inserted, rows.length);
    
    if (pauseMs > 0 && inserted < rows.length) {
      await new Promise(resolve => setTimeout(resolve, pauseMs));
    }
  }
}

export async function pause(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

interface ProgressTracker {
  start: number;
  total: number;
  label: string;
  log: (current: number) => void;
}

export function createProgressTracker(label: string, total: number): ProgressTracker {
  const start = Date.now();
  
  return {
    start,
    total,
    label,
    log(current: number) {
      const elapsed = Date.now() - start;
      const rate = current / (elapsed / 1000);
      const pct = ((current / total) * 100).toFixed(1);
      console.log(`  ${label}: ${current}/${total} (${pct}%) - ${rate.toFixed(0)}/sec`);
    }
  };
}
