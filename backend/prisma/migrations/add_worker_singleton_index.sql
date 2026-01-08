-- Add unique index to enforce singleton at DB level
-- Only ONE worker of each type can be STARTING or RUNNING at a time
-- This prevents race conditions and dual starts under load

-- MySQL doesn't support partial indexes with WHERE clause
-- Solution: Add generated column that's non-NULL only for active workers
-- Then add unique index (NULL values are ignored in unique indexes)

ALTER TABLE WorkerInstance
ADD COLUMN activeWorkerLock VARCHAR(50) GENERATED ALWAYS AS (
  CASE 
    WHEN status IN ('STARTING', 'RUNNING') THEN workerType
    ELSE NULL
  END
) STORED;

CREATE UNIQUE INDEX idx_one_running_worker 
ON WorkerInstance (activeWorkerLock);
