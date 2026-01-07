// Immediate logging to verify process starts
process.stdout.write('[server] Starting application...\n');
process.stderr.write('[server] Starting application (stderr)...\n');

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createApp } from './app/createApp.js';
import { createWsServer } from './ws/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const backendRoot = join(__dirname, '..');

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
  if (process.env.NODE_ENV !== 'production') {
    loadEnv();
  }
  
  process.stdout.write('[server] Environment variables loaded\n');

  // Log important env vars (without sensitive values)
  process.stdout.write(`[server] NODE_ENV=${process.env.NODE_ENV}\n`);
  process.stdout.write(`[server] DATABASE_URL=${process.env.DATABASE_URL ? 'set' : 'not set'}\n`);
  process.stdout.write(`[server] PORT=${process.env.PORT || 'not set'}\n`);
  process.stdout.write(`[server] RAILWAY_PORT=${process.env.RAILWAY_PORT || 'not set'}\n`);

  // Run migrations in production before starting the server
  if (process.env.NODE_ENV === 'production') {
    try {
      process.stdout.write('[server] Running Prisma migrations...\n');
      // Run from backend directory where prisma schema is located
      execSync('npx prisma migrate deploy --schema prisma/schema', {
        stdio: 'inherit',
        env: process.env,
        cwd: backendRoot,
      });
      process.stdout.write('[server] ✓ Migrations completed\n');
    } catch (migrationErr) {
      process.stderr.write(`[server] ✗ Migration failed: ${String(migrationErr)}\n`);
      // Don't exit - migrations might already be applied
      // This allows the server to start even if migrations fail (e.g., already applied)
    }
  }

  process.stdout.write('[server] Creating Express app...\n');
  const app = createApp();
  process.stdout.write('[server] Express app created successfully\n');

  // Railway automatically sets PORT, but fallback to 4000 for local dev
  const portEnv = process.env.PORT || process.env.RAILWAY_PORT || '4000';
  const port = Number(portEnv);
  if (isNaN(port) || port <= 0 || port > 65535) {
    process.stderr.write(`[server] Invalid port: ${portEnv} (parsed as ${port})\n`);
    process.exit(1);
  }
  process.stdout.write(`[server] Starting server on port ${port} (from PORT=${process.env.PORT || 'undefined'}, RAILWAY_PORT=${process.env.RAILWAY_PORT || 'undefined'})\n`);

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
    // Don't exit on unhandled rejection, but log it
    // The server should continue running
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

  process.stdout.write(`[server] Attempting to listen on port ${port} on 0.0.0.0\n`);
  server.listen(port, '0.0.0.0', async () => {
    process.stdout.write(`[server] ✓ API listening on 0.0.0.0:${port}\n`);
    process.stdout.write(`[server] ✓ Health endpoint available at http://0.0.0.0:${port}/health\n`);
    
    // Test database connection
    try {
      process.stdout.write('[server] Testing database connection...\n');
      const { prisma } = await import('./lib/prisma/client.js');
      await prisma.$queryRaw`SELECT 1`;
      process.stdout.write('[server] ✓ Database connection successful\n');
    } catch (dbErr) {
      process.stderr.write(`[server] ✗ Database connection failed: ${String(dbErr)}\n`);
      if (dbErr instanceof Error && dbErr.stack) {
        process.stderr.write(`[server] DB Error stack: ${dbErr.stack}\n`);
      }
      // Don't exit - let the server start, but log the error
      // This way we can see if DB is the issue
    }
    
    process.stdout.write('[server] Server is ready and waiting for requests\n');
    // Verify server is actually listening
    const address = server.address();
    if (address) {
      process.stdout.write(`[server] Server address: ${JSON.stringify(address)}\n`);
    }
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
