// Immediate logging to verify process starts
process.stdout.write('[server] Starting application...\n');

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createApp } from './app/createApp.js';
import { createWsServer } from './ws/index.js';

function loadEnv() {
  if (process.env.DATABASE_URL) return;
  try {
    const raw = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, valueRaw] = match;
      if (process.env[key] != null) continue;
      let value = valueRaw.trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {}
}

// Error handlers - set up early
process.on('unhandledRejection', (reason, promise) => {
  process.stderr.write(`[error] Unhandled rejection: ${String(reason)}\n`);
  if (reason instanceof Error && reason.stack) {
    process.stderr.write(`[error] ${reason.stack}\n`);
  }
});

process.on('uncaughtException', (err) => {
  process.stderr.write(`[error] Uncaught exception: ${err.message}\n`);
  if (err.stack) {
    process.stderr.write(`[error] ${err.stack}\n`);
  }
  process.exit(1);
});

try {
  // Load environment
  if (process.env.NODE_ENV !== 'production') {
    loadEnv();
  }

  const port = Number(process.env.PORT ?? 4000);
  process.stdout.write(`[server] PORT=${port} NODE_ENV=${process.env.NODE_ENV || 'development'}\n`);

  // Create app and server
  const app = createApp();
  const server = createServer(app);
  
  // Create WebSocket server
  createWsServer(server);

  // Handle graceful shutdown
  const shutdown = (signal: string) => {
    process.stdout.write(`[server] Received ${signal}, shutting down...\n`);
    server.close(() => {
      process.stdout.write('[server] Shutdown complete\n');
      process.exit(0);
    });
    
    // Force shutdown after 10 seconds
    setTimeout(() => {
      process.stderr.write('[server] Forced shutdown\n');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Start server - bind to 0.0.0.0 for Railway
  server.listen(port, '0.0.0.0', () => {
    const address = server.address();
    process.stdout.write(`[server] ✓ Listening on ${JSON.stringify(address)}\n`);
    process.stdout.write('[server] ✓ Ready for requests\n');
  });

  server.on('error', (err) => {
    process.stderr.write(`[server] Failed to start: ${err.message}\n`);
    if (err.stack) {
      process.stderr.write(`[error] ${err.stack}\n`);
    }
    process.exit(1);
  });

} catch (err) {
  process.stderr.write(`[server] Fatal error: ${String(err)}\n`);
  if (err instanceof Error && err.stack) {
    process.stderr.write(`[error] ${err.stack}\n`);
  }
  process.exit(1);
}