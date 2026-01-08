  import type { JobDefinition, JobRegistry, JobGroup } from './types.js';
  import { validateJobDefinition } from './types.js';
  import { matchScoresJob } from './matchScores.js';
  import { compatibilityJob } from './compatibility.js';
  import { contentFeaturesJob } from './contentFeatures.js';
  import { trendingJob } from './trending.js';
  import { affinityJob } from './affinity.js';
  import { feedPresortJob } from './feedPresort.js';
  import { feedPresortCleanupJob } from './feedPresortCleanup.js';
  import { statsReconcileJob } from './statsReconcile.js';
  import { mediaOrphanCleanupJob } from './mediaOrphanCleanup.js';
  import { mediaMetadataJob } from './mediaMetadata.js';
  import { mediaMetadataBatchJob } from './mediaMetadataBatch.js';
  import { buildUserTraitsJob } from './buildUserTraits.js';
  import { profileSearchIndexJob } from './profileSearchIndex.js';
  import { userInterestSetsJob } from './userInterestSets.js';
  import { searchableUserJob } from './searchableUser.js';
  import { quizAnswerStatsJob } from './quizAnswerStats.js';
  import { interestRelationshipsJob } from './interestRelationships.js';

  const jobs: JobRegistry = {
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
  };

  // Validate all jobs at startup (fail fast)
  for (const [name, job] of Object.entries(jobs)) {
    validateJobDefinition(name, job);
  }

  export function getJob(name: string): JobDefinition | undefined {
    return jobs[name];
  }

  export function getAllJobs(): JobRegistry {
    return jobs;
  }

  export function listJobNames(): string[] {
    return Object.keys(jobs);
  }

  export function getJobsByGroup(group: JobGroup): JobDefinition[] {
    return Object.values(jobs).filter(job => job.group === group);
  }

  export function getJobGroups(): JobGroup[] {
    const groups = new Set<JobGroup>();
    for (const job of Object.values(jobs)) {
      if (job.group) {
        groups.add(job.group);
      }
    }
    return Array.from(groups).sort();
  }

  export function getJobsMap(): Map<string, JobDefinition> {
    return new Map(Object.entries(jobs));
  }

  export function printUsage() {
    console.log('Usage: tsx scripts/runJobs.ts <job> [options]');
    console.log(`Jobs: ${listJobNames().join(' | ')} | all`);
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
