import { useState, useEffect } from 'react';
import type { JobDefinition, JobRun, ApiError } from '../../types';
import { getJobDescription, getJobPurpose, getJobImpact } from './JobDescriptions';

interface RunJobModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (jobName: string, params: Record<string, unknown>) => Promise<void>;
  definitions: JobDefinition[];
  activeJobs: JobRun[];
  prefillJob?: { jobName: string; params: Record<string, unknown> } | null;
}

export function RunJobModal({ open, onClose, onSubmit, definitions, activeJobs, prefillJob }: RunJobModalProps) {
  const [selectedJobId, setSelectedJobId] = useState('');
  const [jsonParams, setJsonParams] = useState('{}');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedJob = definitions.find(d => d.id === selectedJobId);
  const isDuplicateRunning = activeJobs.some(
    job => job.jobName === selectedJobId && job.status === 'RUNNING'
  );

  useEffect(() => {
    if (open && definitions.length > 0) {
      if (prefillJob) {
        // Pre-fill with job from re-run
        setSelectedJobId(prefillJob.jobName);
        setJsonParams(JSON.stringify(prefillJob.params, null, 2));
        setError(null);
      } else if (!selectedJobId) {
        // Default to first job
        setSelectedJobId(definitions[0].id);
        loadDefaults(definitions[0]);
      }
    }
  }, [open, definitions, prefillJob, selectedJobId]);

  const loadDefaults = (job: JobDefinition) => {
    if (job.defaultParams) {
      setJsonParams(JSON.stringify(job.defaultParams, null, 2));
    } else {
      setJsonParams('{}');
    }
    setError(null);
  };

  const handleJobChange = (jobId: string) => {
    setSelectedJobId(jobId);
    const job = definitions.find(d => d.id === jobId);
    if (job) {
      loadDefaults(job);
    }
  };

  const handleLoadDefaults = () => {
    if (selectedJob) {
      loadDefaults(selectedJob);
    }
  };

  const handleSubmit = async () => {
    setError(null);

    // Client-side JSON syntax check
    let params: Record<string, unknown>;
    try {
      params = JSON.parse(jsonParams);
    } catch (err) {
      setError('Invalid JSON syntax');
      return;
    }

    if (typeof params !== 'object' || Array.isArray(params)) {
      setError('Parameters must be a JSON object');
      return;
    }

    try {
      setSubmitting(true);
      await onSubmit(selectedJobId, params);
      onClose();
      // Reset for next time
      setSelectedJobId('');
      setJsonParams('{}');
      setError(null);
    } catch (err) {
      const apiError = err as ApiError;
      if (apiError.details) {
        setError(apiError.details);
      } else if (apiError.error) {
        setError(apiError.error);
      } else {
        setError('Failed to enqueue job');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content run-job-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Run New Job</h2>
          <button onClick={onClose} className="btn-icon close-btn">✕</button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label htmlFor="job-select">Select Job:</label>
            <select
              id="job-select"
              value={selectedJobId}
              onChange={(e) => handleJobChange(e.target.value)}
              className="form-select"
            >
              {definitions.map(job => (
                <option key={job.id} value={job.id}>
                  {job.name}
                </option>
              ))}
            </select>
          </div>

          {selectedJob && (
            <>
              <div className="job-info-card">
                <div className="job-info-header">
                  <strong>{selectedJob.name}</strong>
                  {selectedJob.group && (
                    <span className="job-group-badge">{selectedJob.group}</span>
                  )}
                </div>
                <p className="job-short-desc">{getJobDescription(selectedJob.id)}</p>
                
                <div className="job-details">
                  <div className="job-detail-row">
                    <span className="detail-label">Purpose:</span>
                    <span className="detail-value">{getJobPurpose(selectedJob.id) || selectedJob.description}</span>
                  </div>
                  <div className="job-detail-row">
                    <span className="detail-label">Impact:</span>
                    <span className="detail-value">{getJobImpact(selectedJob.id) || 'Improves system performance'}</span>
                  </div>
                  {selectedJob.dependencies && selectedJob.dependencies.length > 0 && (
                    <div className="job-detail-row">
                      <span className="detail-label">Depends on:</span>
                      <span className="detail-value dep-list">{selectedJob.dependencies.join(', ')}</span>
                    </div>
                  )}
                </div>
              </div>

              {isDuplicateRunning && (
                <div className="warning-banner">
                  ⚠️ Another instance of this job is currently running.
                </div>
              )}

              <div className="form-group">
                <div className="label-with-button">
                  <label htmlFor="params-json">Parameters (JSON):</label>
                  {selectedJob.defaultParams && (
                    <button onClick={handleLoadDefaults} className="btn-link btn-small">
                      Load Defaults
                    </button>
                  )}
                </div>
                <textarea
                  id="params-json"
                  value={jsonParams}
                  onChange={(e) => setJsonParams(e.target.value)}
                  className="form-textarea json-editor"
                  rows={10}
                  spellCheck={false}
                />
                <div className="field-hint">
                  ⚠️ Server-side validation on submit
                </div>
              </div>

              {error && (
                <div className="error-message">{error}</div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn-secondary" disabled={submitting}>
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            className="btn-primary"
            disabled={!selectedJobId || submitting}
          >
            {submitting ? 'Enqueueing...' : 'Enqueue Job'}
          </button>
        </div>
      </div>
    </div>
  );
}
