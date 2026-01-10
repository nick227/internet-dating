import type { JobGroup } from '../shared/types.js';

export interface ScheduleDefinition {
  id: string;
  name: string;
  description: string;
  cron: string;
  timezone: string;
  executionMode: 'ALL_JOBS' | 'GROUP';
  jobGroup?: JobGroup;
}

/**
 * Schedule definitions (version controlled)
 * 
 * Admin can enable/disable via UI, but configuration lives here.
 * To add a new schedule: add to this array and deploy.
 */
export const schedules: ScheduleDefinition[] = [
  {
    id: 'daily-full-sync',
    name: 'Daily Full Sync',
    description: 'Run all jobs once per day at 2am UTC',
    cron: '0 2 * * *',
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
  }
];

export function getScheduleDefinition(id: string): ScheduleDefinition | undefined {
  return schedules.find(s => s.id === id);
}
