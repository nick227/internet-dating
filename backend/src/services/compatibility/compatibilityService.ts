import { prisma } from '../../lib/prisma/client.js';

export type CompatibilitySummary = {
  score: number | null;
  status: 'READY' | 'INSUFFICIENT_DATA';
};

export const DEFAULT_COMPATIBILITY: CompatibilitySummary = {
  score: null,
  status: 'INSUFFICIENT_DATA'
};

export async function getCompatibilityMap(
  viewerId: bigint | null,
  targetUserIds: bigint[]
): Promise<Map<bigint, CompatibilitySummary>> {
  if (!viewerId || targetUserIds.length === 0) return new Map();

  const rows = await prisma.userCompatibility.findMany({
    where: {
      viewerUserId: viewerId,
      targetUserId: { in: targetUserIds }
    },
    select: { targetUserId: true, score: true, status: true }
  });

  const map = new Map<bigint, CompatibilitySummary>();
  for (const row of rows) {
    map.set(row.targetUserId, {
      score: row.score ?? null,
      status: row.status
    });
  }

  return map;
}

export function resolveCompatibility(
  viewerId: bigint | null,
  map: Map<bigint, CompatibilitySummary>,
  targetUserId: bigint
) {
  if (!viewerId) return null;
  return map.get(targetUserId) ?? DEFAULT_COMPATIBILITY;
}
