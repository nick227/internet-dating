export type JobGroup = 'matching' | 'feed' | 'search' | 'maintenance' | 'media' | 'quiz';

export interface JobDefinition {
  name: string;
  description: string;
  examples: string[];
  defaultParams?: Record<string, unknown>;
  group?: JobGroup;
  dependencies?: string[]; // Job names that must complete before this job
  run: () => Promise<void>;
}

export interface JobRegistry {
  [key: string]: JobDefinition;
}

export function validateJobDefinition(name: string, job: JobDefinition): void {
  if (!job.description || job.description.trim() === '') {
    throw new Error(`Job "${name}": description is required`);
  }
  
  if (!job.examples || job.examples.length === 0) {
    throw new Error(`Job "${name}": at least one example is required`);
  }
  
  if (job.defaultParams) {
    try {
      JSON.stringify(job.defaultParams);
    } catch (err) {
      throw new Error(`Job "${name}": defaultParams must be JSON-serializable`);
    }
  }
}
