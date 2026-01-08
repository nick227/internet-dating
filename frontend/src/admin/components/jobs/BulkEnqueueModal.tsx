import { useState } from 'react';
import type { JobGroup, JobDefinition } from '../../types';
import { GROUP_DESCRIPTIONS_DETAILED } from './JobDescriptions';

interface BulkEnqueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (type: 'all' | 'group', group?: JobGroup) => Promise<void>;
  groups: JobGroup[];
  jobsByGroup: Map<JobGroup, JobDefinition[]>;
  totalJobs: number;
}


export function BulkEnqueueModal({
  isOpen,
  onClose,
  onConfirm,
  groups,
  jobsByGroup,
  totalJobs
}: BulkEnqueueModalProps) {
  const [selectedOption, setSelectedOption] = useState<'all' | 'group'>('all');
  const [selectedGroup, setSelectedGroup] = useState<JobGroup | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (selectedOption === 'group' && !selectedGroup) {
      alert('Please select a job group');
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm(selectedOption, selectedOption === 'group' ? selectedGroup as JobGroup : undefined);
      onClose();
    } catch (err) {
      console.error('Failed to enqueue jobs:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedGroupJobs = selectedGroup ? jobsByGroup.get(selectedGroup as JobGroup) || [] : [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content bulk-enqueue-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Enqueue Multiple Jobs</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="bulk-option">
            <label className="bulk-option-label">
              <input
                type="radio"
                name="bulk-option"
                value="all"
                checked={selectedOption === 'all'}
                onChange={() => {
                  setSelectedOption('all');
                  setSelectedGroup('');
                }}
              />
              <div className="bulk-option-content">
                <strong>Enqueue All Jobs</strong>
                <p>Enqueue all {totalJobs} jobs in dependency order</p>
              </div>
            </label>
          </div>

          <div className="bulk-option">
            <label className="bulk-option-label">
              <input
                type="radio"
                name="bulk-option"
                value="group"
                checked={selectedOption === 'group'}
                onChange={() => setSelectedOption('group')}
              />
              <div className="bulk-option-content">
                <strong>Enqueue Job Group</strong>
                <p>Enqueue all jobs in a specific group (with dependencies)</p>
              </div>
            </label>

            {selectedOption === 'group' && (
              <div className="group-selector">
                <select
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value as JobGroup)}
                  className="group-select"
                >
                  <option value="">Select a group...</option>
                  {groups.map((group) => {
                    const jobs = jobsByGroup.get(group) || [];
                    return (
                      <option key={group} value={group}>
                        {group} ({jobs.length} {jobs.length === 1 ? 'job' : 'jobs'})
                      </option>
                    );
                  })}
                </select>

                {selectedGroup && (
                  <div className="group-info">
                    <h4>{GROUP_DESCRIPTIONS_DETAILED[selectedGroup as JobGroup]?.title || `${selectedGroup} Group`}</h4>
                    <p className="group-description">{GROUP_DESCRIPTIONS_DETAILED[selectedGroup as JobGroup]?.purpose}</p>
                    <p className="group-when"><strong>When to run:</strong> {GROUP_DESCRIPTIONS_DETAILED[selectedGroup as JobGroup]?.when}</p>
                    <div className="group-jobs">
                      <strong>Jobs to enqueue ({selectedGroupJobs.length}):</strong>
                      <ul>
                        {selectedGroupJobs.map((job) => (
                          <li key={job.id}>
                            <code>{job.name}</code>
                            {job.dependencies && job.dependencies.length > 0 && (
                              <span className="job-deps">
                                {' '}
                                (depends on: {job.dependencies.join(', ')})
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bulk-warning">
            <strong>⚠️ Important:</strong>
            <ul>
              <li>Jobs will be enqueued in dependency order</li>
              <li>The worker will process them sequentially</li>
              <li>You can monitor progress in the Active Jobs section</li>
              <li>Individual jobs can be cancelled if needed</li>
            </ul>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={isSubmitting || (selectedOption === 'group' && !selectedGroup)}
          >
            {isSubmitting ? 'Enqueueing...' : 'Enqueue Jobs'}
          </button>
        </div>
      </div>
    </div>
  );
}
