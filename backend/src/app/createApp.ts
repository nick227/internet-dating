import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildApiRouter } from '../registry/buildApiRouter.js';
import { attachContext } from '../middleware/attachContext.js';
import { mediaService, MediaError } from '../services/media/mediaService.js';

export function createApp() {
  const app = express();
  const devHttps = process.env.DEV_HTTPS === '1' || process.env.DEV_HTTPS === 'true';
  const corsOriginEnv = process.env.CORS_ORIGIN;
  const defaultCorsOrigin = devHttps ? 'https://localhost:5173' : 'http://localhost:5173';
  const corsOrigins = corsOriginEnv
    ? corsOriginEnv.split(',').map(origin => origin.trim()).filter(Boolean)
    : [defaultCorsOrigin];
  
  // CORS must be first, before any request logging
  app.use(cors((req, cb) => {
    const origin = req.header('Origin');
    if (!origin) {
      return cb(null, { origin: true, credentials: true });
    }
    if (corsOrigins.includes(origin)) {
      return cb(null, { origin: true, credentials: true });
    }
    if (isSameHostOrigin(origin, req.headers.host)) {
      return cb(null, { origin: true, credentials: true });
    }
    return cb(new Error('Not allowed by CORS'));
  }));
  
  // Then parse body and cookies
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  
  // Request logging AFTER parsing
  app.use((req, res, next) => {
    const start = Date.now();
    
    // Extra logging for /api/auth/me to debug timeout issue
    if (req.url === '/api/auth/me') {
      process.stdout.write(`[${new Date().toISOString()}] >>> START ${req.method} ${req.url}\n`);
      process.stdout.write(`[request] Headers: ${JSON.stringify({ cookie: req.headers.cookie })}\n`);
    }
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      const logLine = `[${new Date().toISOString()}] ${req.method} ${req.url} ${res.statusCode} ${duration}ms\n`;
      
      if (duration > 1000 || req.url === '/api/auth/me') {
        process.stdout.write(`>>> ${logLine}`);
      } else {
        process.stdout.write(logLine);
      }
    });
    next();
  });

  // Health check - minimal, synchronous
  app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true });
  });
  
  // Database health check
  app.get('/health/db', async (_req, res) => {
    try {
      const start = Date.now();
      const { prisma } = await import('../lib/prisma/client.js');
      
      // Simple query with timeout
      const queryPromise = prisma.$queryRaw`SELECT 1 as result`;
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('DB query timeout')), 5000);
      });
      
      await Promise.race([queryPromise, timeoutPromise]);
      const duration = Date.now() - start;
      
      res.status(200).json({ ok: true, dbLatency: duration });
    } catch (err) {
      process.stderr.write(`[health/db] Database check failed: ${String(err)}\n`);
      res.status(503).json({ ok: false, error: String(err) });
    }
  });

  // Test route to verify requests reach the server
  app.get('/test-root', (_req, res) => {
    process.stdout.write(`[test] /test-root route hit\n`);
    res.status(200).json({ message: 'Root test route works', path: '/test-root' });
  });

  // Test route to verify media volume configuration
  app.get('/test-media-config', async (_req, res) => {
    try {
      const { MEDIA_UPLOAD_ROOT } = await import('../services/media/config.js');
      const { promises: fs } = await import('fs');
      const path = await import('path');
      
      const info = {
        MEDIA_UPLOAD_DIR: process.env.MEDIA_UPLOAD_DIR || 'not set',
        MEDIA_UPLOAD_ROOT,
        cwd: process.cwd(),
        volumeExists: false,
        volumeWritable: false,
        volumePath: '',
      };
      
      try {
        if (existsSync(MEDIA_UPLOAD_ROOT)) {
          info.volumeExists = true;
          const stats = await fs.stat(MEDIA_UPLOAD_ROOT);
          info.volumePath = MEDIA_UPLOAD_ROOT;
          // Try to write a test file
          const testFile = path.join(MEDIA_UPLOAD_ROOT, '.test-write');
          try {
            await fs.writeFile(testFile, 'test');
            await fs.unlink(testFile);
            info.volumeWritable = true;
          } catch (err) {
            info.volumeWritable = false;
          }
        }
      } catch (err) {
        // Directory doesn't exist or not accessible
      }
      
      res.status(200).json(info);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // API routes
  app.use('/api', buildApiRouter());

  // Media serving route
  app.get('/media/*', attachContext, async (req, res) => {
    const key = req.path.replace(/^\/media\//, '').replace(/^\/+/, '');
    if (!key) {
      return res.status(404).end();
    }
    
    process.stdout.write(`[media] GET /media/* request for key: ${key}\n`);
    try {
      const result = await mediaService.getMediaStreamByKey(key, req.ctx.userId ?? null);
      process.stdout.write(`[media] GET /media/*: stream created, mimeType=${result.mimeType}\n`);
      res.status(200).type(result.mimeType);
      
      result.stream.on('error', (err) => {
        process.stderr.write(`[media] Stream error: ${String(err)}\n`);
        if (err instanceof Error && err.stack) {
          process.stderr.write(`[media] Stream error stack: ${err.stack}\n`);
        }
        if (!res.headersSent) {
          res.status(404).end();
        }
      });
      
      result.stream.pipe(res);
    } catch (err) {
      process.stderr.write(`[media] GET /media/* error: ${String(err)}\n`);
      if (err instanceof Error && err.stack) {
        process.stderr.write(`[media] GET /media/* error stack: ${err.stack}\n`);
      }
      if (err instanceof MediaError) {
        return res.status(err.status).end();
      }
      res.status(500).end();
    }
  });

  // Serve frontend static files and SPA
  const frontendDist = resolveFrontendDist();
  if (frontendDist && process.env.SERVE_FRONTEND !== 'false') {
    const indexPath = path.join(frontendDist, 'index.html');
    
    if (existsSync(indexPath)) {
      const absoluteIndexPath = path.resolve(indexPath);
      process.stdout.write(`[frontend] Configuring static serving from: ${frontendDist}\n`);
      process.stdout.write(`[frontend] Index file: ${absoluteIndexPath}\n`);
      
      // Serve static assets (JS, CSS, images)
      app.use(express.static(frontendDist, {
        index: false,
        maxAge: '1y',
        immutable: true,
        setHeaders: (res, filepath) => {
          // Don't cache HTML files
          if (filepath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        }
      }));
      
      // SPA catch-all - send index.html for all other GET requests
      // MUST exclude /api and /media to avoid catching their routes
      process.stdout.write(`[frontend] Registering guarded catch-all route for SPA\n`);
      app.get('*', (req, res, next) => {
        // Never catch /api or /media routes - let them fail properly
        if (req.path.startsWith('/api') || req.path.startsWith('/media')) {
          return next();
        }
        
        process.stdout.write(`[frontend] SPA fallback: ${req.path}\n`);
        res.sendFile(absoluteIndexPath, (err) => {
          if (err) {
            process.stderr.write(`[frontend] Failed to serve index.html: ${String(err)}\n`);
            if (err instanceof Error && err.stack) {
              process.stderr.write(`[frontend] Stack: ${err.stack}\n`);
            }
            if (!res.headersSent) {
              res.status(500).send('Internal Server Error');
            }
          } else {
            process.stdout.write(`[frontend] Successfully served index.html for ${req.path}\n`);
          }
        });
      });
      process.stdout.write(`[frontend] Frontend serving configured successfully\n`);
    } else {
      process.stderr.write(`[server] Frontend index.html not found at ${indexPath}\n`);
    }
  } else if (!frontendDist) {
    process.stdout.write(`[server] Frontend dist not found\n`);
  } else {
    process.stdout.write(`[server] Frontend serving disabled (SERVE_FRONTEND=false)\n`);
  }

  // Global error handler
  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    process.stderr.write(`[error] ${req.method} ${req.url}: ${String(err)}\n`);
    if (err instanceof Error && err.stack) {
      process.stderr.write(`[error] ${err.stack}\n`);
    }
    
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return app;
}

function resolveFrontendDist(): string | null {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const root = path.resolve(__dirname, '../../..');
  
  const candidates = [
    path.join(process.cwd(), 'frontend', 'dist'),
    path.join(root, 'frontend', 'dist'),
  ];
  
  for (const dist of candidates) {
    if (existsSync(dist)) {
      return dist;
    }
  }
  
  return null;
}

function isSameHostOrigin(origin: string, hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  try {
    const originUrl = new URL(origin);
    return originUrl.host === hostHeader;
  } catch {
    return false;
  }
}
