import type { JobDefinition, JobRegistry, JobGroup } from './types.js';
import { validateJobDefinition } from './types.js';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

// Lazy load jobs to avoid importing scripts/ during compilation
// Jobs are only loaded at runtime when needed
let jobsCache: JobRegistry | null = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use dynamic import with path construction to avoid TS checking at compile time
async function dynamicImportJob(path: string): Promise<any> {
  const fullPath = join(__dirname, path);
  return import(pathToFileURL(fullPath).toString());
}

async function loadJobs(): Promise<JobRegistry> {
  if (jobsCache) return jobsCache;
  
  const [
    { matchScoresJob },
    { compatibilityJob },
    { contentFeaturesJob },
    { trendingJob },
    { affinityJob },
    { feedPresortJob },
    { feedPresortCleanupJob },
    { statsReconcileJob },
    { mediaOrphanCleanupJob },
    { mediaMetadataJob },
    { mediaMetadataBatchJob },
    { buildUserTraitsJob },
    { profileSearchIndexJob },
    { userInterestSetsJob },
    { searchableUserJob },
    { quizAnswerStatsJob },
    { interestRelationshipsJob },
    { scienceSamplePairsJob },
    { scienceDailyStatsJob },
    { scienceInterestCorrelationsJob },
  ] = await Promise.all([
    dynamicImportJob('../../../../scripts/jobs/core/matchScores.js'),
    dynamicImportJob('../../../../scripts/jobs/core/compatibility.js'),
    dynamicImportJob('../../../../scripts/jobs/core/contentFeatures.js'),
    dynamicImportJob('../../../../scripts/jobs/core/trending.js'),
    dynamicImportJob('../../../../scripts/jobs/core/affinity.js'),
    dynamicImportJob('../../../../scripts/jobs/core/feedPresort.js'),
    dynamicImportJob('../../../../scripts/jobs/core/feedPresortCleanup.js'),
    dynamicImportJob('../../../../scripts/jobs/core/statsReconcile.js'),
    dynamicImportJob('../../../../scripts/jobs/core/mediaOrphanCleanup.js'),
    dynamicImportJob('../../../../scripts/jobs/core/mediaMetadata.js'),
    dynamicImportJob('../../../../scripts/jobs/core/mediaMetadataBatch.js'),
    dynamicImportJob('../../../../scripts/jobs/core/buildUserTraits.js'),
    dynamicImportJob('../../../../scripts/jobs/core/profileSearchIndex.js'),
    dynamicImportJob('../../../../scripts/jobs/core/userInterestSets.js'),
    dynamicImportJob('../../../../scripts/jobs/core/searchableUser.js'),
    dynamicImportJob('../../../../scripts/jobs/core/quizAnswerStats.js'),
    dynamicImportJob('../../../../scripts/jobs/core/interestRelationships.js'),
    dynamicImportJob('../../../../scripts/jobs/science/samplePairs.js'),
    dynamicImportJob('../../../../scripts/jobs/science/dailyStats.js'),
    dynamicImportJob('../../../../scripts/jobs/science/interestCorrelations.js'),
  ]);

  jobsCache = {
    'match-scores': matchScoresJob,
    'compatibility': compatibilityJob,
    'content-features': contentFeaturesJob,
    'trending': trendingJob,
    'affinity': affinityJob,
    'feed-presort': feedPresortJob,
    'feed-presort-cleanup': feedPresortCleanupJob,
    'stats-reconcile': statsReconcileJob,
    'media-orphan-cleanup': mediaOrphanCleanupJob,
    'media-metadata': mediaMetadataJob,
    'media-metadata-batch': mediaMetadataBatchJob,
    'build-user-traits': buildUserTraitsJob,
    'profile-search-index': profileSearchIndexJob,
    'user-interest-sets': userInterestSetsJob,
    'searchable-user': searchableUserJob,
    'quiz-answer-stats': quizAnswerStatsJob,
    'interest-relationships': interestRelationshipsJob,
    'science-sample-pairs': scienceSamplePairsJob,
    'science-daily-stats': scienceDailyStatsJob,
    'science-interest-correlations': scienceInterestCorrelationsJob,
  };

  // Validate all jobs
  for (const [name, job] of Object.entries(jobsCache)) {
    validateJobDefinition(name, job);
  }

  return jobsCache;
}

export async function getJob(name: string): Promise<JobDefinition | undefined> {
  const jobs = await loadJobs();
  return jobs[name];
}

export async function getAllJobs(): Promise<JobRegistry> {
  return await loadJobs();
}

export async function listJobNames(): Promise<string[]> {
  const jobs = await loadJobs();
  return Object.keys(jobs);
}

export async function getJobsByGroup(group: JobGroup): Promise<JobDefinition[]> {
  const jobs = await loadJobs();
  return Object.values(jobs).filter(job => job.group === group);
}

export async function getJobGroups(): Promise<JobGroup[]> {
  const jobs = await loadJobs();
  const groups = new Set<JobGroup>();
  for (const job of Object.values(jobs)) {
    if (job.group) {
      groups.add(job.group);
    }
  }
  return Array.from(groups).sort();
}

export async function getJobsMap(): Promise<Map<string, JobDefinition>> {
  const jobs = await loadJobs();
  return new Map(Object.entries(jobs));
}

export async function printUsage(): Promise<void> {
  const jobs = await loadJobs();
  console.log('Usage: tsx scripts/jobs/runners/runJobs.ts <job> [options]');
  console.log(`Jobs: ${Object.keys(jobs).join(' | ')} | all`);
  console.log('');
  console.log('📖 For detailed guide, see: backend/scripts/jobs/README.md');
  console.log('');
  console.log('Quick Examples:');
  
  for (const job of Object.values(jobs)) {
    for (const example of job.examples) {
      console.log(`  ${example}`);
    }
  }
}
