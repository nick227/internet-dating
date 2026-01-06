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

loadEnv();

let app;
try {
  app = createApp();
} catch (err) {
  console.error('[server] Failed to create app', err);
  process.exit(1);
}

const portEnv = process.env.PORT ?? process.env.RAILWAY_PORT ?? '4000';
const port = Number(portEnv);
if (isNaN(port) || port <= 0 || port > 65535) {
  console.error(`[server] Invalid port: ${portEnv} (parsed as ${port})`);
  process.exit(1);
}
console.log(`[server] Starting server on port ${port} (from PORT=${process.env.PORT}, RAILWAY_PORT=${process.env.RAILWAY_PORT})`);

const server = createServer(app);
createWsServer(server);

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

server.listen(port, '0.0.0.0', () => {
  console.log(`[server] API listening on 0.0.0.0:${port}`);
}).on('error', (err) => {
  console.error('[server] Failed to start server', err);
  process.exit(1);
});
