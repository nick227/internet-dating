/**
 * User-friendly job descriptions for UI tooltips and help text
 */

export const JOB_DESCRIPTIONS: Record<string, { short: string; purpose: string; impact: string }> = {
  'build-user-traits': {
    short: 'Analyzes quiz answers to understand each user\'s personality',
    purpose: 'Creates personality profiles from quiz responses',
    impact: 'Better match recommendations for all users'
  },
  'match-scores': {
    short: 'Calculates compatibility between users',
    purpose: 'Compares personality traits to score how compatible users are',
    impact: 'Users see updated match percentages'
  },
  'compatibility': {
    short: 'Creates detailed compatibility reports',
    purpose: 'Analyzes specific areas of compatibility (communication, lifestyle, values)',
    impact: 'Users get "why you match" explanations'
  },
  'content-features': {
    short: 'Analyzes posts to understand their content',
    purpose: 'Extracts topics, hashtags, and themes from posts',
    impact: 'Better content recommendations in feeds'
  },
  'trending': {
    short: 'Identifies popular content',
    purpose: 'Calculates which posts are getting the most engagement right now',
    impact: 'Users see what\'s hot in the community'
  },
  'affinity': {
    short: 'Learns what each user likes',
    purpose: 'Tracks which posts, topics, and creators each user engages with',
    impact: 'Feeds become more personalized over time'
  },
  'feed-presort': {
    short: 'Pre-organizes each user\'s feed',
    purpose: 'Creates personalized feed sections based on matches and interests',
    impact: 'Users see perfectly organized feeds'
  },
  'feed-presort-cleanup': {
    short: 'Clears old feed cache',
    purpose: 'Deletes pre-sorted feed data that\'s too old to be useful',
    impact: 'Faster database, reduced storage'
  },
  'profile-search-index': {
    short: 'Builds searchable user profiles',
    purpose: 'Creates a fast search index of all user profiles',
    impact: 'Profile search works faster'
  },
  'user-interest-sets': {
    short: 'Organizes users by interests',
    purpose: 'Groups users by shared interests for better matching',
    impact: '"Find people who like X" searches work better'
  },
  'searchable-user': {
    short: 'Updates search-friendly profile snapshots',
    purpose: 'Creates simplified profiles optimized for search',
    impact: 'More accurate search results'
  },
  'interest-relationships': {
    short: 'Finds related interests',
    purpose: 'Discovers which interests often go together',
    impact: 'Better interest suggestions'
  },
  'stats-reconcile': {
    short: 'Fixes counting errors',
    purpose: 'Recalculates counters to make sure they\'re accurate',
    impact: 'Correct numbers throughout the app'
  },
  'media-orphan-cleanup': {
    short: 'Removes abandoned files',
    purpose: 'Finds and deletes uploaded files never attached to posts',
    impact: 'Reduced storage costs'
  },
  'media-metadata': {
    short: 'Extracts file information',
    purpose: 'Analyzes uploaded video/photo for duration and resolution',
    impact: 'Videos show correct duration'
  },
  'media-metadata-batch': {
    short: 'Processes multiple files at once',
    purpose: 'Same as media-metadata, but for many files',
    impact: 'All media has correct metadata'
  },
  'quiz-answer-stats': {
    short: 'Aggregates quiz data',
    purpose: 'Counts how many users chose each quiz answer',
    impact: 'Better insights into your user base'
  }
};

export const GROUP_DESCRIPTIONS_DETAILED: Record<string, { title: string; purpose: string; when: string }> = {
  matching: {
    title: '💝 Matching - Finding Compatible Users',
    purpose: 'Helps users find their perfect match through personality analysis and compatibility scoring.',
    when: 'Run after quiz updates or when match recommendations need refreshing.'
  },
  feed: {
    title: '📰 Feed - Keeping Content Fresh',
    purpose: 'Powers the personalized feed each user sees with trending and relevant content.',
    when: 'Run daily or when users report stale content.'
  },
  search: {
    title: '🔍 Search - Finding People Fast',
    purpose: 'Makes profile searching quick and accurate with optimized indexes.',
    when: 'Run weekly or after significant profile updates.'
  },
  maintenance: {
    title: '🧹 Maintenance - Keeping Things Clean',
    purpose: 'Cleans up old data and fixes counting errors automatically.',
    when: 'Run daily during low-traffic hours (e.g., 3 AM).'
  },
  media: {
    title: '📸 Media - Processing Photos & Videos',
    purpose: 'Handles uploaded media files and extracts important metadata.',
    when: 'Runs automatically after uploads, or manually for backfills.'
  },
  quiz: {
    title: '📝 Quiz - Understanding User Data',
    purpose: 'Analyzes quiz responses to understand your user base better.',
    when: 'Run after quiz updates or when you need fresh statistics.'
  }
};

export function getJobDescription(jobName: string): string {
  return JOB_DESCRIPTIONS[jobName]?.short || 'Automated task';
}

export function getJobPurpose(jobName: string): string {
  return JOB_DESCRIPTIONS[jobName]?.purpose || '';
}

export function getJobImpact(jobName: string): string {
  return JOB_DESCRIPTIONS[jobName]?.impact || '';
}
