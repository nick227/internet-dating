import { useState, useEffect } from 'react';
import type { JobDefinition, JobRun, ApiError } from '../../types';

interface RunJobModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (jobName: string, params: Record<string, unknown>) => Promise<void>;
  definitions: JobDefinition[];
  activeJobs: JobRun[];
}

export function RunJobModal({ open, onClose, onSubmit, definitions, activeJobs }: RunJobModalProps) {
  const [selectedJobId, setSelectedJobId] = useState('');
  const [jsonParams, setJsonParams] = useState('{}');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedJob = definitions.find(d => d.id === selectedJobId);
  const isDuplicateRunning = activeJobs.some(
    job => job.jobName === selectedJobId && job.status === 'RUNNING'
  );

  useEffect(() => {
    if (open && definitions.length > 0 && !selectedJobId) {
      setSelectedJobId(definitions[0].id);
      loadDefaults(definitions[0]);
    }
  }, [open, definitions]);

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
              <div className="job-description">
                <h3>Description:</h3>
                <p>{selectedJob.description}</p>
              </div>

              {selectedJob.examples.length > 0 && (
                <div className="job-examples">
                  <h3>Example Usage:</h3>
                  <pre className="example-code">{selectedJob.examples[0]}</pre>
                </div>
              )}

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
