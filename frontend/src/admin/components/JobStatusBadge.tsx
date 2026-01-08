import type { JobRunStatus } from '../types';

interface JobStatusBadgeProps {
  status: JobRunStatus;
}

export function JobStatusBadge({ status }: JobStatusBadgeProps) {
  const getStatusColor = () => {
    switch (status) {
      case 'QUEUED': return 'gray';
      case 'RUNNING': return 'blue';
      case 'SUCCESS': return 'green';
      case 'FAILED': return 'red';
      case 'CANCELLED': return 'orange';
      default: return 'gray';
    }
  };

  const color = getStatusColor();

  return (
    <span className={`job-status-badge job-status-${color}`}>
      {status}
    </span>
  );
}
