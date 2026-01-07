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
  
  // CORS must be first, before any request logging
  app.use(cors({ origin: true, credentials: true }));
  
  // Then parse body and cookies
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  
  // Request logging AFTER parsing
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      process.stdout.write(`[${new Date().toISOString()}] ${req.method} ${req.url} ${res.statusCode} ${duration}ms\n`);
    });
    next();
  });

  // Health check - minimal, synchronous
  app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true });
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