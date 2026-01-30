import type { JobGroup } from '../shared/types.js';

export interface ScheduleDefinition {
  id: string;
  name: string;
  description: string;
  cron: string;
  timezone: string;
  executionMode: 'ALL_JOBS' | 'GROUP';
  jobGroup?: JobGroup;
  environments?: ('development' | 'production')[];
}

const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Schedule definitions (version controlled)
 * 
 * Admin can enable/disable via UI, but configuration lives here.
 * To add a new schedule: add to this array and deploy.
 * 
 * Environment filtering:
 *   - If `environments` is undefined: available in all environments
 *   - If `environments` is specified: only available in listed environments
 */
const allSchedules: ScheduleDefinition[] = [
  {
    id: 'daily-full-sync',
    name: 'Daily Full Sync',
    description: 'Run all jobs once per day at midnight UTC',
    cron: '0 0 * * *',
    timezone: 'UTC',
    executionMode: 'ALL_JOBS'
  },
  {
    id: 'hourly-matching',
    name: 'Hourly Matching',
    description: 'Update match scores every hour',
    cron: '0 * * * *',
    timezone: 'UTC',
    executionMode: 'GROUP',
    jobGroup: 'matching'
  },
  {
    id: 'feed-refresh',
    name: 'Feed Refresh',
    description: 'Refresh user feeds every 15 minutes',
    cron: '*/15 * * * *',
    timezone: 'UTC',
    executionMode: 'GROUP',
    jobGroup: 'feed'
  },
  // Development-only: More frequent for testing
  {
    id: 'dev-quick-test',
    name: 'Dev Quick Test',
    description: 'Run all jobs every 5 minutes (dev only)',
    cron: '*/5 * * * *',
    timezone: 'UTC',
    executionMode: 'ALL_JOBS',
    environments: ['development']
  }
];

/**
 * Export only schedules appropriate for current environment
 */
export const schedules: ScheduleDefinition[] = allSchedules.filter(schedule => {
  if (!schedule.environments) return true; // No restriction = available everywhere
  return schedule.environments.includes(NODE_ENV as any);
});

export function getScheduleDefinition(id: string): ScheduleDefinition | undefined {
  return schedules.find(s => s.id === id);
}
