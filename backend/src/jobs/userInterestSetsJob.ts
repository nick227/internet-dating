import { prisma } from '../lib/prisma/client.js';

type UserInterestSetsJobOptions = {
  batchSize?: number;
  pauseMs?: number;
};

const DEFAULT_CONFIG = {
  batchSize: 1000,
  pauseMs: 50
};

function sleep(ms: number) {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function buildUserInterestSets(options: UserInterestSetsJobOptions = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  
  // Clear existing sets
  await prisma.interestUserSet.deleteMany({});
  await prisma.interestSubjectUserSet.deleteMany({});
  
  // Process UserInterest in batches
  let skip = 0;
  let hasMore = true;
  
  const interestSets = new Map<string, Set<bigint>>();
  const subjectSets = new Map<string, Set<bigint>>();
  
  while (hasMore) {
    const userInterests = await prisma.userInterest.findMany({
      skip,
      take: config.batchSize,
      include: {
        interest: true
      }
    });
    
    if (userInterests.length === 0) {
      hasMore = false;
      break;
    }
    
    for (const ui of userInterests) {
      const interestKey = ui.interestId.toString();
      if (!interestSets.has(interestKey)) {
        interestSets.set(interestKey, new Set());
      }
      interestSets.get(interestKey)!.add(ui.userId);
      
      const subjectKey = ui.subjectId.toString();
      if (!subjectSets.has(subjectKey)) {
        subjectSets.set(subjectKey, new Set());
      }
      subjectSets.get(subjectKey)!.add(ui.userId);
    }
    
    skip += config.batchSize;
    
    // Periodically flush to database to avoid memory issues
    if (interestSets.size > 10000 || subjectSets.size > 1000) {
      await flushSetsToDatabase(interestSets, subjectSets);
      interestSets.clear();
      subjectSets.clear();
    }
    
    await sleep(config.pauseMs);
  }
  
  // Flush remaining sets
  if (interestSets.size > 0 || subjectSets.size > 0) {
    await flushSetsToDatabase(interestSets, subjectSets);
  }
}

async function flushSetsToDatabase(
  interestSets: Map<string, Set<bigint>>,
  subjectSets: Map<string, Set<bigint>>
) {
  // Build records for InterestUserSet
  const interestRecords: Array<{ interestId: bigint; userId: bigint }> = [];
  for (const [interestIdStr, userIds] of interestSets.entries()) {
    const interestId = BigInt(interestIdStr);
    for (const userId of userIds) {
      interestRecords.push({ interestId, userId });
    }
  }
  
  // Build records for InterestSubjectUserSet
  const subjectRecords: Array<{ subjectId: bigint; userId: bigint }> = [];
  for (const [subjectIdStr, userIds] of subjectSets.entries()) {
    const subjectId = BigInt(subjectIdStr);
    for (const userId of userIds) {
      subjectRecords.push({ subjectId, userId });
    }
  }
  
  // Bulk insert in batches to avoid query size limits
  const batchSize = 5000;
  for (let i = 0; i < interestRecords.length; i += batchSize) {
    const batch = interestRecords.slice(i, i + batchSize);
    await prisma.interestUserSet.createMany({
      data: batch,
      skipDuplicates: true
    });
  }
  
  for (let i = 0; i < subjectRecords.length; i += batchSize) {
    const batch = subjectRecords.slice(i, i + batchSize);
    await prisma.interestSubjectUserSet.createMany({
      data: batch,
      skipDuplicates: true
    });
  }
}

export async function buildUserInterestSetsForAll(options: UserInterestSetsJobOptions = {}) {
  return buildUserInterestSets(options);
}
