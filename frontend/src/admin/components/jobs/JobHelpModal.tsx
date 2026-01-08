import { useState } from 'react';
import { getJobDescription, getJobPurpose, getJobImpact, GROUP_DESCRIPTIONS_DETAILED } from './JobDescriptions';
import type { JobDefinition, JobGroup } from '../../types';

interface JobHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  definitions: JobDefinition[];
  groups: JobGroup[];
}

export function JobHelpModal({ isOpen, onClose, definitions, groups }: JobHelpModalProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'groups' | 'jobs'>('overview');

  if (!isOpen) return null;

  const jobsByGroup = new Map<JobGroup, JobDefinition[]>();
  definitions.forEach(def => {
    if (def.group) {
      const existing = jobsByGroup.get(def.group) || [];
      jobsByGroup.set(def.group, [...existing, def]);
    }
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content job-help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📖 Job Manager Guide</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="help-tabs">
          <button
            className={`help-tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button
            className={`help-tab ${activeTab === 'groups' ? 'active' : ''}`}
            onClick={() => setActiveTab('groups')}
          >
            Job Groups
          </button>
          <button
            className={`help-tab ${activeTab === 'jobs' ? 'active' : ''}`}
            onClick={() => setActiveTab('jobs')}
          >
            All Jobs
          </button>
        </div>

        <div className="modal-body help-content">
          {activeTab === 'overview' && (
            <div className="help-section">
              <h3>What Are Jobs?</h3>
              <p>
                <strong>Jobs</strong> are automated tasks that keep your dating platform running smoothly. 
                Think of them as maintenance crews—each one has a specific job to do.
              </p>

              <h3>How They Work</h3>
              <div className="help-info-box">
                <p><strong>Automatic:</strong> Most jobs run on a schedule (daily, weekly)</p>
                <p><strong>Manual:</strong> You can run jobs manually when needed</p>
                <p><strong>Safe:</strong> Jobs can be cancelled and safely rerun</p>
              </div>

              <h3>Job Status</h3>
              <ul>
                <li><strong>Queued</strong> - Waiting to run</li>
                <li><strong>Running</strong> - Currently processing</li>
                <li><strong>Success</strong> - Completed successfully</li>
                <li><strong>Failed</strong> - Something went wrong (check error details)</li>
                <li><strong>Cancelled</strong> - Stopped by admin</li>
              </ul>

              <h3>Quick Start</h3>
              <ol className="help-steps">
                <li>Click <strong>"Bulk Enqueue"</strong> to run multiple jobs</li>
                <li>Select <strong>"Enqueue All Jobs"</strong> for first-time setup</li>
                <li>Monitor progress in the <strong>"Active Jobs"</strong> section</li>
                <li>Check <strong>"Job History"</strong> to see past runs</li>
              </ol>

              <h3>Need Help?</h3>
              <p>
                <strong>Hover over any job name</strong> to see what it does.<br />
                <strong>Click on job groups</strong> to see which jobs run together.
              </p>
            </div>
          )}

          {activeTab === 'groups' && (
            <div className="help-section">
              <h3>Job Groups</h3>
              <p>Jobs are organized into 6 functional groups:</p>

              {groups.map((group) => {
                const info = GROUP_DESCRIPTIONS_DETAILED[group];
                const jobs = jobsByGroup.get(group) || [];
                
                return (
                  <div key={group} className="help-group-card">
                    <h4>{info?.title || group}</h4>
                    <p className="help-group-purpose">{info?.purpose}</p>
                    <p className="help-group-when">
                      <strong>When to run:</strong> {info?.when}
                    </p>
                    <div className="help-group-jobs">
                      <strong>{jobs.length} jobs:</strong> {jobs.map(j => j.name).join(', ')}
                    </div>
                  </div>
                );
              })}

              <div className="help-tip">
                <strong>💡 Tip:</strong> Use <strong>"Bulk Enqueue"</strong> to run entire groups 
                with one click. Dependencies are handled automatically!
              </div>
            </div>
          )}

          {activeTab === 'jobs' && (
            <div className="help-section">
              <h3>All Jobs ({definitions.length})</h3>
              <p>Hover over any job name in the UI for a quick description.</p>

              {groups.map((group) => {
                const jobs = jobsByGroup.get(group) || [];
                const info = GROUP_DESCRIPTIONS_DETAILED[group];
                
                return (
                  <div key={group} className="help-job-group">
                    <h4>{info?.title || group}</h4>
                    <div className="help-job-list">
                      {jobs.map((job) => (
                        <div key={job.id} className="help-job-item">
                          <div className="help-job-header">
                            <code>{job.name}</code>
                            {job.dependencies && job.dependencies.length > 0 && (
                              <span className="help-job-deps">
                                Needs: {job.dependencies.join(', ')}
                              </span>
                            )}
                          </div>
                          <p className="help-job-desc">{getJobDescription(job.id)}</p>
                          <div className="help-job-details">
                            <span><strong>Purpose:</strong> {getJobPurpose(job.id)}</span>
                            <span><strong>Impact:</strong> {getJobImpact(job.id)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-primary" onClick={onClose}>
            Got It!
          </button>
        </div>
      </div>
    </div>
  );
}
