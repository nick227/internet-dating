console.log('[server] Starting application...');

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
  console.log('[server] Loading environment variables...');
  loadEnv();

  console.log('[server] Creating Express app...');
  const app = createApp();
  console.log('[server] Express app created successfully');

  const portEnv = process.env.PORT ?? process.env.RAILWAY_PORT ?? '4000';
  const port = Number(portEnv);
  if (isNaN(port) || port <= 0 || port > 65535) {
    console.error(`[server] Invalid port: ${portEnv} (parsed as ${port})`);
    process.exit(1);
  }
  console.log(`[server] Starting server on port ${port} (from PORT=${process.env.PORT}, RAILWAY_PORT=${process.env.RAILWAY_PORT})`);

  console.log('[server] Creating HTTP server...');
  const server = createServer(app);
  
  console.log('[server] Creating WebSocket server...');
  createWsServer(server);
  console.log('[server] WebSocket server created');

  process.on('unhandledRejection', (reason) => {
    console.error('[server] Unhandled rejection', reason);
  });

  process.on('uncaughtException', (err) => {
    console.error('[server] Uncaught exception', err);
    process.exit(1);
  });

  server.on('error', (err) => {
    console.error('[server] HTTP server error', err);
    process.exit(1);
  });

  console.log('[server] Attempting to listen on port', port);
  server.listen(port, '0.0.0.0', () => {
    console.log(`[server] ✓ API listening on 0.0.0.0:${port}`);
    console.log(`[server] ✓ Health endpoint available at http://0.0.0.0:${port}/health`);
  }).on('error', (err) => {
    console.error('[server] ✗ Failed to start server', err);
    process.exit(1);
  });
} catch (err) {
  console.error('[server] ✗ Fatal error during startup:', err);
  if (err instanceof Error) {
    console.error('[server] Error stack:', err.stack);
  }
  process.exit(1);
}
