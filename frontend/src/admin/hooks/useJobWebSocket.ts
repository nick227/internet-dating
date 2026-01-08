import { useEffect, useState } from 'react';
import { realtime } from '../../api/realtime';
import type { JobWebSocketEvent } from '../types';

interface UseJobWebSocketParams {
  onJobStarted?: (event: JobWebSocketEvent) => void;
  onJobProgress?: (event: JobWebSocketEvent) => void;
  onJobCompleted?: (event: JobWebSocketEvent) => void;
  onConnectionChange?: (connected: boolean) => void;
}

export function useJobWebSocket(params: UseJobWebSocketParams) {
  const [isConnected, setIsConnected] = useState(() => realtime.isConnected());

  useEffect(() => {
    // Subscribe to admin job events (broadcast to all admin WebSockets automatically)
    const unsubscribeStarted = realtime.on('server.admin.job_started', (data) => {
      params.onJobStarted?.({ type: 'server.admin.job_started', data });
    });

    const unsubscribeProgress = realtime.on('server.admin.job_progress', (data) => {
      params.onJobProgress?.({ type: 'server.admin.job_progress', data });
    });

    const unsubscribeCompleted = realtime.on('server.admin.job_completed', (data) => {
      params.onJobCompleted?.({ type: 'server.admin.job_completed', data });
    });

    // Subscribe to connection status changes
    const unsubscribeConnection = realtime.onConnectionChange((connected) => {
      setIsConnected(connected);
      params.onConnectionChange?.(connected);
    });

    return () => {
      unsubscribeStarted();
      unsubscribeProgress();
      unsubscribeCompleted();
      unsubscribeConnection();
    };
  }, [params]);

  return { isConnected };
}
