import { prisma } from '../prisma/client.js';
import { emitJobEvent } from '../../ws/domains/admin.js';

export type LogLevel = 'debug' | 'info' | 'milestone' | 'warning' | 'error';

export interface LogContext {
  [key: string]: unknown;
}

export interface OutcomeSummary {
  updates?: number;
  inserts?: number;
  deletes?: number;
  errors?: number;
  warnings?: number;
  skipped?: number;
  [key: string]: number | undefined;
}

/**
 * JobLogger - Provides structured logging and progress tracking for jobs
 * 
 * Features:
 * - Structured log entries stored in database
 * - Real-time WebSocket broadcasting
 * - Progress tracking (stages, percentages, counters)
 * - Outcome summaries
 * - Adaptive to unknown vs known totals
 */
export class JobLogger {
  private jobRunId: bigint;
  private jobName: string;
  private currentStage: string | null = null;
  private progressCurrent: number = 0;
  private progressTotal: number | null = null;
  private outcomeSummary: OutcomeSummary = {};
  private startTime: number = Date.now();

  constructor(jobRunId: bigint, jobName: string) {
    this.jobRunId = jobRunId;
    this.jobName = jobName;
  }

  /**
   * Set the current stage (e.g., "Scanning users", "Saving results")
   */
  async setStage(stage: string, message?: string): Promise<void> {
    this.currentStage = stage;
    
    await prisma.jobRun.update({
      where: { id: this.jobRunId },
      data: { currentStage: stage }
    });

    await this.milestone(message || `Starting: ${stage}`, { stage });
    
    // Broadcast stage change
    this.broadcastProgress();
  }

  /**
   * Set total entities to process (enables percentage calculation)
   */
  async setTotal(total: number, entityType?: string): Promise<void> {
    this.progressTotal = total;
    
    await prisma.jobRun.update({
      where: { id: this.jobRunId },
      data: { 
        progressTotal: total,
        entitiesTotal: total
      }
    });

    await this.info(`Will process ${total.toLocaleString()} ${entityType || 'entities'}`, {
      total,
      entityType
    });
    
    this.broadcastProgress();
  }

  /**
   * Increment progress counter
   */
  async incrementProgress(count: number = 1, message?: string): Promise<void> {
    this.progressCurrent += count;
    
    const percent = this.progressTotal 
      ? Math.min(100, Math.floor((this.progressCurrent / this.progressTotal) * 100))
      : null;
    
    await prisma.jobRun.update({
      where: { id: this.jobRunId },
      data: {
        progressCurrent: this.progressCurrent,
        progressPercent: percent,
        progressMessage: message || undefined
      }
    });

    // Broadcast progress every 100 entities or on significant milestones
    if (this.progressCurrent % 100 === 0 || percent === 100) {
      this.broadcastProgress();
    }
  }

  /**
   * Set current progress directly (for batch operations)
   */
  async setProgress(current: number, message?: string): Promise<void> {
    this.progressCurrent = current;
    
    const percent = this.progressTotal 
      ? Math.min(100, Math.floor((this.progressCurrent / this.progressTotal) * 100))
      : null;
    
    await prisma.jobRun.update({
      where: { id: this.jobRunId },
      data: {
        progressCurrent: current,
        progressPercent: percent,
        progressMessage: message || undefined
      }
    });
    
    this.broadcastProgress();
  }

  /**
   * Add to outcome summary (e.g., updates: 100, deletes: 5)
   */
  addOutcome(key: string, count: number): void {
    this.outcomeSummary[key] = (this.outcomeSummary[key] || 0) + count;
  }

  /**
   * Save final outcome summary to database
   */
  async saveOutcome(): Promise<void> {
    await prisma.jobRun.update({
      where: { id: this.jobRunId },
      data: {
        entitiesProcessed: this.progressCurrent,
        outcomeSummary: this.outcomeSummary as any
      }
    });
  }

  /**
   * Log a debug message
   */
  async debug(message: string, context?: LogContext): Promise<void> {
    await this.log('debug', message, context);
  }

  /**
   * Log an info message
   */
  async info(message: string, context?: LogContext): Promise<void> {
    await this.log('info', message, context);
  }

  /**
   * Log a milestone (important progress point)
   */
  async milestone(message: string, context?: LogContext): Promise<void> {
    await this.log('milestone', message, context);
    
    // Broadcast milestones immediately
    this.broadcastLog('milestone', message, context);
  }

  /**
   * Log a warning
   */
  async warning(message: string, context?: LogContext): Promise<void> {
    await this.log('warning', message, context);
    this.addOutcome('warnings', 1);
    this.broadcastLog('warning', message, context);
  }

  /**
   * Log an error
   */
  async error(message: string, context?: LogContext): Promise<void> {
    await this.log('error', message, context);
    this.addOutcome('errors', 1);
    this.broadcastLog('error', message, context);
  }

  /**
   * Internal log method
   */
  private async log(level: LogLevel, message: string, context?: LogContext): Promise<void> {
    try {
      await prisma.jobLog.create({
        data: {
          jobRunId: this.jobRunId,
          level,
          stage: this.currentStage || undefined,
          message,
          context: context as any || undefined
        }
      });
    } catch (err) {
      console.error(`[job-logger] Failed to write log:`, err);
    }
  }

  /**
   * Broadcast progress update via WebSocket
   */
  private broadcastProgress(): void {
    const percent = this.progressTotal 
      ? Math.min(100, Math.floor((this.progressCurrent / this.progressTotal) * 100))
      : undefined;

    emitJobEvent('server.admin.job_progress', {
      jobRunId: this.jobRunId.toString(),
      jobName: this.jobName,
      progressPercent: percent || 0,
      progressMessage: this.formatProgressMessage()
    });
  }

  /**
   * Broadcast log entry via WebSocket
   */
  private broadcastLog(level: LogLevel, message: string, context?: LogContext): void {
    // Could add a new WebSocket event type for logs if needed
    // For now, milestones/warnings/errors can update progress message
    if (level === 'milestone' || level === 'warning' || level === 'error') {
      this.broadcastProgress();
    }
  }

  /**
   * Format progress message for display
   */
  private formatProgressMessage(): string {
    if (!this.currentStage) {
      return 'Processing...';
    }

    if (this.progressTotal) {
      return `${this.currentStage} (${this.progressCurrent.toLocaleString()} / ${this.progressTotal.toLocaleString()})`;
    }

    return `${this.currentStage} (${this.progressCurrent.toLocaleString()} processed)`;
  }

  /**
   * Get elapsed time in ms
   */
  getElapsedMs(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Log final summary
   */
  async logSummary(): Promise<void> {
    const elapsed = this.getElapsedMs();
    const durationStr = formatDuration(elapsed);
    
    const summaryParts = [
      `Completed in ${durationStr}`,
      `Processed: ${this.progressCurrent.toLocaleString()} entities`
    ];

    // Add outcome details
    if (this.outcomeSummary.updates) {
      summaryParts.push(`Updates: ${this.outcomeSummary.updates.toLocaleString()}`);
    }
    if (this.outcomeSummary.inserts) {
      summaryParts.push(`Inserts: ${this.outcomeSummary.inserts.toLocaleString()}`);
    }
    if (this.outcomeSummary.deletes) {
      summaryParts.push(`Deletes: ${this.outcomeSummary.deletes.toLocaleString()}`);
    }
    if (this.outcomeSummary.skipped) {
      summaryParts.push(`Skipped: ${this.outcomeSummary.skipped.toLocaleString()}`);
    }
    if (this.outcomeSummary.errors) {
      summaryParts.push(`Errors: ${this.outcomeSummary.errors}`);
    }
    if (this.outcomeSummary.warnings) {
      summaryParts.push(`Warnings: ${this.outcomeSummary.warnings}`);
    }

    await this.milestone(summaryParts.join(' | '), {
      summary: this.outcomeSummary,
      elapsed,
      processed: this.progressCurrent
    });

    await this.saveOutcome();
  }
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Create a job logger for a job run
 */
export function createJobLogger(jobRunId: bigint, jobName: string): JobLogger {
  return new JobLogger(jobRunId, jobName);
}
