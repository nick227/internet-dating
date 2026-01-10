import { useState, useEffect } from 'react';
import { adminApi } from '../api/admin';
import { trackError } from '../utils/errorTracking';
import type { JobSchedule, DaemonStatus } from '../types';
import './SchedulesPage.css';

export function SchedulesPage() {
  const [schedules, setSchedules] = useState<JobSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [daemonStatus, setDaemonStatus] = useState<DaemonStatus | null>(null);

  useEffect(() => {
    loadSchedules();
    loadDaemonStatus();
    
    // Refresh daemon status every 30 seconds
    const interval = setInterval(loadDaemonStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadSchedules = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminApi.getSchedules();
      setSchedules(response.schedules);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load schedules';
      setError(errorMsg);
      trackError(err, { action: 'loadSchedules', component: 'SchedulesPage' });
      console.error('Failed to load schedules:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadDaemonStatus = async () => {
    try {
      const status = await adminApi.getDaemonStatus();
      setDaemonStatus(status);
    } catch (err) {
      console.error('Failed to load daemon status:', err);
      // Don't set error state, just log it (non-critical)
    }
  };

  const formatUptime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  };

  const handleToggle = async (scheduleId: string, currentEnabled: boolean) => {
    try {
      await adminApi.updateSchedule(scheduleId, { enabled: !currentEnabled });
      // Optimistic update
      setSchedules(prev =>
        prev.map(s =>
          s.id === scheduleId ? { ...s, enabled: !currentEnabled } : s
        )
      );
    } catch (err) {
      trackError(err, {
        action: 'toggleSchedule',
        component: 'SchedulesPage',
        scheduleId,
        enabled: !currentEnabled
      });
      console.error('Failed to toggle schedule:', err);
      alert('Failed to update schedule. Please try again.');
      // Reload to get actual state
      loadSchedules();
    }
  };

  const handleTrigger = async (scheduleId: string, scheduleName: string) => {
    if (!confirm(`Run "${scheduleName}" now?`)) {
      return;
    }

    try {
      setTriggeringId(scheduleId);
      const result = await adminApi.triggerSchedule(scheduleId);
      alert(`✓ ${result.message}\nEnqueued ${result.count} jobs`);
      loadSchedules(); // Refresh to show updated lastRunAt
    } catch (err) {
      trackError(err, {
        action: 'triggerSchedule',
        component: 'SchedulesPage',
        scheduleId
      });
      console.error('Failed to trigger schedule:', err);
      alert('Failed to trigger schedule. Please try again.');
    } finally {
      setTriggeringId(null);
    }
  };

  const formatRelativeTime = (dateStr: string | null): string => {
    if (!dateStr) return 'Never';
    
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return 'Just now';
  };

  const formatNextRun = (dateStr: string | null): string => {
    if (!dateStr) return 'Not scheduled';
    
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    
    if (diffMs < 0) return 'Overdue';
    
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) return `in ${diffDays}d`;
    if (diffHours > 0) return `in ${diffHours}h`;
    if (diffMins > 0) return `in ${diffMins}m`;
    return 'Soon';
  };

  const getCronDescription = (cron: string): string => {
    // Simple cron description
    if (cron === '0 2 * * *') return 'Daily at 2am';
    if (cron === '0 * * * *') return 'Every hour';
    if (cron === '*/15 * * * *') return 'Every 15 minutes';
    if (cron === '*/30 * * * *') return 'Every 30 minutes';
    if (cron === '0 */4 * * *') return 'Every 4 hours';
    if (cron === '0 3 * * 0') return 'Weekly (Sunday 3am)';
    return cron;
  };

  if (loading) {
    return (
      <div className="schedules-page">
        <div className="page-header">
          <h1>Job Schedules</h1>
        </div>
        <div className="loading">Loading schedules...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="schedules-page">
        <div className="page-header">
          <h1>Job Schedules</h1>
        </div>
        <div className="error">
          <p>❌ {error}</p>
          <button onClick={loadSchedules}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="schedules-page">
      <div className="page-header">
        <h1>Job Schedules</h1>
        <button onClick={loadSchedules} className="btn-secondary">
          🔄 Refresh
        </button>
      </div>

      {/* Daemon Status Banner */}
      {daemonStatus && (
        <div className={`daemon-status daemon-status-${daemonStatus.health}`}>
          <div className="daemon-status-icon">
            {daemonStatus.health === 'healthy' && '✓'}
            {daemonStatus.health === 'warning' && '⚠️'}
            {daemonStatus.health === 'critical' && '❌'}
          </div>
          <div className="daemon-status-content">
            <div className="daemon-status-message">
              <strong>Schedule Daemon:</strong> {daemonStatus.healthMessage}
            </div>
            {daemonStatus.daemon && (
              <div className="daemon-status-details">
                <span>Host: {daemonStatus.daemon.hostname}</span>
                <span>Uptime: {formatUptime(daemonStatus.daemon.uptime)}</span>
                <span>Heartbeat: {formatRelativeTime(daemonStatus.daemon.lastHeartbeatAt)}</span>
              </div>
            )}
            {!daemonStatus.daemon && (
              <div className="daemon-status-warning">
                Schedules will not execute automatically. Check Railway deployment or start daemon locally.
              </div>
            )}
          </div>
        </div>
      )}

      <div className="info-banner">
        <div className="info-section">
          <strong>ℹ️ About Schedules:</strong> Schedule definitions are version-controlled in code.
          Use the toggles below to enable or disable automatic execution.
        </div>
        <div className="info-section warning">
          <strong>⚠️ Missed Run Policy (SKIP):</strong> If the schedule daemon is down during a scheduled time,
          the run will be <strong>skipped permanently</strong>. Schedules do not catch up.
          Next run will wait for the next scheduled interval.
        </div>
      </div>

      {schedules.length === 0 ? (
        <div className="empty-state">
          <p>No schedules defined.</p>
          <p>Add schedules to <code>backend/src/lib/jobs/schedules/definitions.ts</code></p>
        </div>
      ) : (
        <div className="schedules-table-container">
          <table className="schedules-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Name</th>
                <th>Schedule</th>
                <th>Execution</th>
                <th>Last Run</th>
                <th>Next Run</th>
                <th>Stats</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map(schedule => (
                <tr key={schedule.id} className={schedule.enabled ? 'enabled' : 'disabled'}>
                  <td>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={schedule.enabled}
                        onChange={() => handleToggle(schedule.id, schedule.enabled)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                    <span className={`status-badge ${schedule.enabled ? 'enabled' : 'disabled'}`}>
                      {schedule.enabled ? 'ON' : 'OFF'}
                    </span>
                  </td>
                  
                  <td>
                    <div className="schedule-name">
                      <strong>{schedule.name}</strong>
                      <span className="schedule-description">{schedule.description}</span>
                    </div>
                  </td>
                  
                  <td>
                    <div className="schedule-cron">
                      <code>{schedule.cron}</code>
                      <span className="cron-description">{getCronDescription(schedule.cron)}</span>
                    </div>
                  </td>
                  
                  <td>
                    <div className="schedule-execution">
                      <span className="execution-mode">{schedule.executionMode}</span>
                      {schedule.jobGroup && (
                        <span className="job-group">{schedule.jobGroup}</span>
                      )}
                    </div>
                  </td>
                  
                  <td>
                    {schedule.lastRunAt ? (
                      <div className="last-run">
                        <span className="relative-time">{formatRelativeTime(schedule.lastRunAt)}</span>
                        {schedule.lastRun && (
                          <span className={`run-status status-${schedule.lastRun.status.toLowerCase()}`}>
                            {schedule.lastRun.status}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="never-run">Never</span>
                    )}
                  </td>
                  
                  <td>
                    {schedule.enabled ? (
                      <div className="next-run-cell">
                        <span className="next-run">{formatNextRun(schedule.nextRunAt)}</span>
                        <span className="next-run-hint" title="If daemon is down at this time, this run will be skipped (not caught up)">
                          ⓘ
                        </span>
                      </div>
                    ) : (
                      <span className="disabled-text">Disabled</span>
                    )}
                  </td>
                  
                  <td>
                    <div className="schedule-stats">
                      <span>✓ {schedule.runCount}</span>
                      {schedule.failureCount > 0 && (
                        <span className="failures">✗ {schedule.failureCount}</span>
                      )}
                    </div>
                  </td>
                  
                  <td>
                    <div className="action-buttons">
                      <button
                        onClick={() => handleTrigger(schedule.id, schedule.name)}
                        disabled={triggeringId === schedule.id}
                        className="btn-action"
                        title="Run now"
                      >
                        {triggeringId === schedule.id ? '⏳' : '▶️'} Run Now
                      </button>
                      <a
                        href={`/admin/jobs?scheduleId=${schedule.id}`}
                        className="btn-link"
                        title="View history"
                      >
                        📊 History
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
