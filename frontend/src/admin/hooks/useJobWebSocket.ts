import { useEffect, useCallback } from 'react';
import type { JobWebSocketEvent } from '../types';

interface UseJobWebSocketParams {
  onJobStarted?: (event: JobWebSocketEvent) => void;
  onJobProgress?: (event: JobWebSocketEvent) => void;
  onJobCompleted?: (event: JobWebSocketEvent) => void;
}

export function useJobWebSocket(params: UseJobWebSocketParams) {
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message = JSON.parse(event.data) as JobWebSocketEvent;
      
      switch (message.type) {
        case 'server.admin.job_started':
          params.onJobStarted?.(message);
          break;
        case 'server.admin.job_progress':
          params.onJobProgress?.(message);
          break;
        case 'server.admin.job_completed':
          params.onJobCompleted?.(message);
          break;
      }
    } catch (err) {
      console.error('Failed to parse WebSocket message:', err);
    }
  }, [params]);

  useEffect(() => {
    // WebSocket connection is managed globally
    // Just add our message listener
    const ws = (window as any).__ws__;
    if (ws) {
      ws.addEventListener('message', handleMessage);
      return () => {
        ws.removeEventListener('message', handleMessage);
      };
    }
  }, [handleMessage]);
}
