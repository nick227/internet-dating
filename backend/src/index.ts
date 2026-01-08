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

async function testMediaVolume() {
  try {
    const { MEDIA_UPLOAD_ROOT } = await import('./services/media/config.js');
    const { promises: fs } = await import('fs');
    const path = await import('path');
    
    process.stdout.write(`[startup] Testing media volume access...\n`);
    process.stdout.write(`[startup] MEDIA_UPLOAD_DIR: ${process.env.MEDIA_UPLOAD_DIR || 'not set'}\n`);
    process.stdout.write(`[startup] MEDIA_UPLOAD_ROOT: ${MEDIA_UPLOAD_ROOT}\n`);
    
    const results = {
      exists: false,
      writable: false,
      readable: false,
      error: null as string | null,
    };
    
    // Test if directory exists
    try {
      const stats = await fs.stat(MEDIA_UPLOAD_ROOT);
      results.exists = true;
      results.readable = stats.isDirectory();
      process.stdout.write(`[startup] ✓ Volume directory exists and is readable\n`);
    } catch (err) {
      // Directory doesn't exist - try to create it
      if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT') {
        try {
          await fs.mkdir(MEDIA_UPLOAD_ROOT, { recursive: true });
          results.exists = true;
          results.readable = true;
          process.stdout.write(`[startup] ✓ Volume directory created\n`);
        } catch (createErr) {
          results.error = `Failed to create directory: ${createErr instanceof Error ? createErr.message : String(createErr)}`;
          process.stderr.write(`[startup] ✗ ${results.error}\n`);
        }
      } else {
        results.error = `Failed to access directory: ${err instanceof Error ? err.message : String(err)}`;
        process.stderr.write(`[startup] ✗ ${results.error}\n`);
      }
    }
    
    // Test if directory is writable
    if (results.exists && results.readable) {
      const testFile = path.join(MEDIA_UPLOAD_ROOT, '.startup-test');
      try {
        await fs.writeFile(testFile, 'test');
        await fs.unlink(testFile);
        results.writable = true;
        process.stdout.write(`[startup] ✓ Volume directory is writable\n`);
      } catch (err) {
        results.error = `Directory not writable: ${err instanceof Error ? err.message : String(err)}`;
        process.stderr.write(`[startup] ✗ ${results.error}\n`);
      }
    }
    
    // If MEDIA_UPLOAD_DIR is explicitly set but volume is not accessible, warn/fail
    if (process.env.MEDIA_UPLOAD_DIR && (!results.exists || !results.writable)) {
      const msg = `[startup] WARNING: MEDIA_UPLOAD_DIR is set but volume is not accessible. Media uploads will fail!`;
      process.stderr.write(`${msg}\n`);
      // In production, this is critical - fail fast
      if (process.env.NODE_ENV === 'production') {
        process.stderr.write(`[startup] FATAL: Cannot continue without accessible media volume in production\n`);
        process.exit(1);
      }
    }
    
    if (results.exists && results.writable) {
      process.stdout.write(`[startup] ✓ Media volume test passed\n`);
    } else {
      process.stdout.write(`[startup] ⚠ Media volume test completed with warnings\n`);
    }
    
    return results;
  } catch (err) {
    process.stderr.write(`[startup] Media volume test error: ${String(err)}\n`);
    if (err instanceof Error && err.stack) {
      process.stderr.write(`[startup] ${err.stack}\n`);
    }
    // Don't fail startup for test errors, but log them
    return { exists: false, writable: false, readable: false, error: String(err) };
  }
}

(async () => {
  try {
    // Load environment
    if (process.env.NODE_ENV !== 'production') {
      loadEnv();
    }

    const port = Number(process.env.PORT) || (process.env.NODE_ENV === 'production' ? 8080 : 4000);
    process.stdout.write(`[server] PORT=${port} NODE_ENV=${process.env.NODE_ENV || 'development'}\n`);

    // Test media volume before starting server
    await testMediaVolume();

    // Create app and server
    const app = createApp();
    const server = createServer(app);
    
    // Create WebSocket server
    const wss = createWsServer(server);

    // Track all connections for proper cleanup
    const connections = new Set<import('node:net').Socket>();
    server.on('connection', (conn) => {
      connections.add(conn);
      conn.on('close', () => connections.delete(conn));
    });

    // Handle graceful shutdown
    const shutdown = (signal: string) => {
      process.stdout.write(`[server] Received ${signal}, shutting down...\n`);
      
      // Close WebSocket server first
      wss.close(() => {
        process.stdout.write('[server] WebSocket server closed\n');
      });
      
      // Destroy all active connections to free the port immediately
      for (const conn of connections) {
        conn.destroy();
      }
      connections.clear();
      
      // Close HTTP server
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
})();