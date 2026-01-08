import { useState } from 'react';
import type { JobDefinition } from '../types';

interface JobTriggerModalProps {
  definitions: JobDefinition[];
  onTrigger: (jobName: string, parameters?: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}

export function JobTriggerModal({ definitions, onTrigger, onClose }: JobTriggerModalProps) {
  const [selectedJob, setSelectedJob] = useState('');
  const [parameters, setParameters] = useState('{}');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedJob) {
      setError('Please select a job');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      let params = undefined;
      if (parameters.trim()) {
        params = JSON.parse(parameters);
      }
      
      await onTrigger(selectedJob, params);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger job');
    } finally {
      setLoading(false);
    }
  };

  const selectedDefinition = definitions.find(d => d.id === selectedJob);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Trigger Job</h2>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="job-select">Select Job:</label>
            <select
              id="job-select"
              value={selectedJob}
              onChange={(e) => setSelectedJob(e.target.value)}
              disabled={loading}
            >
              <option value="">-- Select a job --</option>
              {definitions.map((def) => (
                <option key={def.id} value={def.id}>
                  {def.name}
                </option>
              ))}
            </select>
          </div>

          {selectedDefinition && (
            <div className="job-description">
              <p>{selectedDefinition.description}</p>
              <details>
                <summary>Examples</summary>
                <ul>
                  {selectedDefinition.examples.map((example, i) => (
                    <li key={i}><code>{example}</code></li>
                  ))}
                </ul>
              </details>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="parameters">Parameters (JSON):</label>
            <textarea
              id="parameters"
              value={parameters}
              onChange={(e) => setParameters(e.target.value)}
              placeholder='{"scope": "all"}'
              rows={5}
              disabled={loading}
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" disabled={loading || !selectedJob}>
              {loading ? 'Triggering...' : 'Trigger Job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
