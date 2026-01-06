// Immediate logging to verify process starts
process.stdout.write('[server] Starting application...\n');
process.stderr.write('[server] Starting application (stderr)...\n');

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

try {
  process.stdout.write('[server] Loading environment variables...\n');
  loadEnv();
  process.stdout.write('[server] Environment variables loaded\n');

  process.stdout.write('[server] Creating Express app...\n');
  const app = createApp();
  process.stdout.write('[server] Express app created successfully\n');

  const portEnv = process.env.PORT ?? process.env.RAILWAY_PORT ?? '4000';
  const port = Number(portEnv);
  if (isNaN(port) || port <= 0 || port > 65535) {
    console.error(`[server] Invalid port: ${portEnv} (parsed as ${port})`);
    process.exit(1);
  }
  process.stdout.write(`[server] Starting server on port ${port} (from PORT=${process.env.PORT}, RAILWAY_PORT=${process.env.RAILWAY_PORT})\n`);

  process.stdout.write('[server] Creating HTTP server...\n');
  const server = createServer(app);
  process.stdout.write('[server] HTTP server created\n');
  
  process.stdout.write('[server] Creating WebSocket server...\n');
  createWsServer(server);
  process.stdout.write('[server] WebSocket server created\n');

  process.on('unhandledRejection', (reason) => {
    process.stderr.write(`[server] Unhandled rejection: ${String(reason)}\n`);
    if (reason instanceof Error && reason.stack) {
      process.stderr.write(`[server] Stack: ${reason.stack}\n`);
    }
  });

  process.on('uncaughtException', (err) => {
    process.stderr.write(`[server] Uncaught exception: ${err.message}\n`);
    if (err.stack) {
      process.stderr.write(`[server] Stack: ${err.stack}\n`);
    }
    process.exit(1);
  });

  server.on('error', (err) => {
    process.stderr.write(`[server] HTTP server error: ${err.message}\n`);
    if (err.stack) {
      process.stderr.write(`[server] Stack: ${err.stack}\n`);
    }
    process.exit(1);
  });

  // Handle graceful shutdown
  const shutdown = (signal: string) => {
    process.stdout.write(`[server] Received ${signal}, shutting down gracefully...\n`);
    server.close(() => {
      process.stdout.write('[server] Server closed\n');
      process.exit(0);
    });
    // Force shutdown after 10 seconds
    setTimeout(() => {
      process.stderr.write('[server] Forced shutdown after timeout\n');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.stdout.write(`[server] Attempting to listen on port ${port}\n`);
  server.listen(port, '0.0.0.0', () => {
    process.stdout.write(`[server] ✓ API listening on 0.0.0.0:${port}\n`);
    process.stdout.write(`[server] ✓ Health endpoint available at http://0.0.0.0:${port}/health\n`);
    // Keep process alive
    process.stdout.write('[server] Server is ready and waiting for requests\n');
  }).on('error', (err) => {
    process.stderr.write(`[server] ✗ Failed to start server: ${err.message}\n`);
    if (err.stack) {
      process.stderr.write(`[server] Stack: ${err.stack}\n`);
    }
    process.exit(1);
  });
} catch (err) {
  process.stderr.write(`[server] ✗ Fatal error during startup: ${String(err)}\n`);
  if (err instanceof Error) {
    if (err.stack) {
      process.stderr.write(`[server] Error stack: ${err.stack}\n`);
    }
  }
  process.exit(1);
}
