import type { WsEvents } from '@app/shared/ws/contracts';
import type WebSocket from 'ws';

// Track admin sockets explicitly
const adminSockets = new Set<WebSocket>();

// Register admin socket on connection
export function registerAdminSocket(socket: WebSocket) {
  adminSockets.add(socket);
  socket.on('close', () => {
    adminSockets.delete(socket);
  });
}

// Unregister admin socket
export function unregisterAdminSocket(socket: WebSocket) {
  adminSockets.delete(socket);
}

// Helper to emit job events to all admin users
export function emitJobEvent<T extends 'server.admin.job_started' | 'server.admin.job_progress' | 'server.admin.job_completed'>(
  eventType: T,
  data: WsEvents[T]
) {
  const event = {
    type: eventType,
    data,
    ts: Date.now()
  };

  // Send to all registered admin sockets
  for (const socket of adminSockets) {
    if (socket.readyState === 1) { // WebSocket.OPEN
      socket.send(JSON.stringify(event));
    }
  }
}
