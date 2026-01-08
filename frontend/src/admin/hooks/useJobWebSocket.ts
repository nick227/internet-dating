import { useEffect, useCallback, useState } from 'react';
import type { JobWebSocketEvent } from '../types';

interface UseJobWebSocketParams {
  onJobStarted?: (event: JobWebSocketEvent) => void;
  onJobProgress?: (event: JobWebSocketEvent) => void;
  onJobCompleted?: (event: JobWebSocketEvent) => void;
  onConnectionChange?: (connected: boolean) => void;
}

export function useJobWebSocket(params: UseJobWebSocketParams) {
  const [isConnected, setIsConnected] = useState(false);
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
      // Check initial connection state
      const initialState = ws.readyState === WebSocket.OPEN;
      setIsConnected(initialState);
      params.onConnectionChange?.(initialState);

      // Add message listener
      ws.addEventListener('message', handleMessage);

      // Monitor connection state changes
      const handleOpen = () => {
        setIsConnected(true);
        params.onConnectionChange?.(true);
      };

      const handleClose = () => {
        setIsConnected(false);
        params.onConnectionChange?.(false);
      };

      const handleError = () => {
        setIsConnected(false);
        params.onConnectionChange?.(false);
      };

      ws.addEventListener('open', handleOpen);
      ws.addEventListener('close', handleClose);
      ws.addEventListener('error', handleError);

      return () => {
        ws.removeEventListener('message', handleMessage);
        ws.removeEventListener('open', handleOpen);
        ws.removeEventListener('close', handleClose);
        ws.removeEventListener('error', handleError);
      };
    }
  }, [handleMessage, params]);

  return { isConnected };
}
