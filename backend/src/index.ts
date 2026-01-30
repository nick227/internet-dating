// Immediate logging to verify process starts
process.stdout.write('[server] Starting application...\n');

import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFileSync } from 'node:fs';
import { createApp } from './app/createApp.js';
import { createWsServer } from './ws/index.js';

function loadEnv() {
  if (process.env.DATABASE_URL) return;
  try {
    const raw = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      // Skip comments and empty lines
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      // Match key=value, handling quoted values with = signs inside
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      
      const key = trimmed.slice(0, eqIndex).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      if (process.env[key] != null) continue;
      
      let value = trimmed.slice(eqIndex + 1).trim();
      // Handle quoted values (including escaped quotes)
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1).replace(/\\(.)/g, '$1');
      }
      process.env[key] = value;
    }
  } catch {}
}

// Error handlers - set up early
process.on('unhandledRejection', (reason) => {
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
  let MEDIA_UPLOAD_ROOT: string;
  let fs: typeof import('fs').promises;
  let path: typeof import('path');
  
  try {
    // Wrap all imports in try-catch to prevent startup crashes
    const mediaConfig = await import('./services/media/config.js');
    MEDIA_UPLOAD_ROOT = mediaConfig.MEDIA_UPLOAD_ROOT;
    const fsModule = await import('fs');
    fs = fsModule.promises;
    path = await import('path');
  } catch (err) {
    process.stderr.write(`[startup] Failed to load media modules: ${String(err)}\n`);
    return { exists: false, writable: false, readable: false, error: String(err) };
  }
  
  try {
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
      const errCode = err instanceof Error ? (err as { code?: string }).code : undefined;
      // Directory doesn't exist - try to create it
      if (errCode === 'ENOENT') {
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
    
    // If MEDIA_UPLOAD_DIR is explicitly set but volume is not accessible, fail fast in production
    if (process.env.MEDIA_UPLOAD_DIR && (!results.exists || !results.writable)) {
      process.stderr.write(`[startup] FATAL: MEDIA_UPLOAD_DIR is set but volume is not accessible\n`);
      if (process.env.NODE_ENV === 'production') {
        process.exit(1);
      } else {
        process.stderr.write(`[startup] Continuing in development mode, but media uploads will fail\n`);
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
    return { exists: false, writable: false, readable: false, error: String(err) };
  }
}

(async () => {
  try {
    // Load environment
    if (process.env.NODE_ENV !== 'production') {
      loadEnv();
    }

    // Validate and parse port
    const portEnv = process.env.PORT;
    const port = portEnv ? Number(portEnv) : (process.env.NODE_ENV === 'production' ? 8080 : 4000);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      process.stderr.write(`[server] Invalid PORT value: ${portEnv}. Must be between 1 and 65535.\n`);
      process.exit(1);
    }
    process.stdout.write(`[server] PORT=${port} NODE_ENV=${process.env.NODE_ENV || 'development'}\n`);

    // Test media volume before starting server
    await testMediaVolume();

    const httpsKeyPath = process.env.HTTPS_KEY_PATH || process.env.SSL_KEY_PATH;
    const httpsCertPath = process.env.HTTPS_CERT_PATH || process.env.SSL_CERT_PATH;
    const useHttps = Boolean(httpsKeyPath && httpsCertPath);

    // Create app and server
    const app = createApp();
    const server = useHttps
      ? createHttpsServer(
          {
            key: readFileSync(httpsKeyPath as string),
            cert: readFileSync(httpsCertPath as string),
          },
          app
        )
      : createHttpServer(app);
    
    // Create WebSocket server
    const wss = createWsServer(server);

    // Track all connections for proper cleanup
    const connections = new Set<import('node:net').Socket>();
    server.on('connection', (conn) => {
      connections.add(conn);
      conn.on('close', () => connections.delete(conn));
    });

    // Track shutdown state and force shutdown timer
    let isShuttingDown = false;
    let forceShutdownTimer: NodeJS.Timeout | null = null;

    // Handle graceful shutdown
    const shutdown = (signal: string) => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      
      process.stdout.write(`[server] Received ${signal}, shutting down gracefully...\n`);
      
      // Set force shutdown timer
      forceShutdownTimer = setTimeout(() => {
        process.stderr.write('[server] Graceful shutdown timeout, forcing exit\n');
        process.exit(1);
      }, 10000);
      
      // Stop accepting new connections
      server.close((err) => {
        if (err) {
          process.stderr.write(`[server] Error closing HTTP server: ${err.message}\n`);
        } else {
          process.stdout.write('[server] HTTP server closed\n');
        }
      });
      
      // Close WebSocket server
      wss.close((err) => {
        if (err) {
          process.stderr.write(`[server] Error closing WebSocket server: ${err.message}\n`);
        } else {
          process.stdout.write('[server] WebSocket server closed\n');
        }
        
        // After WebSocket server is closed, destroy remaining connections
        process.stdout.write(`[server] Closing ${connections.size} active connections\n`);
        for (const conn of connections) {
          conn.destroy();
        }
        connections.clear();
        
        // Clear force shutdown timer since we're shutting down cleanly
        if (forceShutdownTimer) {
          clearTimeout(forceShutdownTimer);
          forceShutdownTimer = null;
        }
        
        process.stdout.write('[server] Shutdown complete\n');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Start server - bind to 0.0.0.0 for Railway
    // Wrap in Promise to handle async errors properly
    await new Promise<void>((resolve, reject) => {
      server.on('error', reject);
      
      server.listen(port, '0.0.0.0', () => {
        const address = server.address();
        process.stdout.write(`[server] ✓ Listening on ${JSON.stringify(address)}\n`);
        process.stdout.write('[server] ✓ Ready for requests\n');
        
        // Remove error handler and resolve once listening
        server.removeListener('error', reject);
        resolve();
      });
    });
    
    // Re-attach error handler for runtime errors
    server.on('error', (err) => {
      process.stderr.write(`[server] Runtime error: ${err.message}\n`);
      if (err.stack) {
        process.stderr.write(`[error] ${err.stack}\n`);
      }
    });

  } catch (err) {
    process.stderr.write(`[server] Fatal error during startup: ${String(err)}\n`);
    if (err instanceof Error && err.stack) {
      process.stderr.write(`[error] ${err.stack}\n`);
    }
    process.exit(1);
  }
})();
