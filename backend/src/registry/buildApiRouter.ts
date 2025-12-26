import { Router } from 'express';
import { attachContext } from '../middleware/attachContext.js';
import { requireAuth } from '../lib/auth/requireAuth.js';
import { registry } from './registry.js';
import type { RouteDef } from './types.js';

function applyRoute(router: Router, r: RouteDef) {
  const method = r.method.toLowerCase() as 'get'|'post'|'put'|'patch'|'delete';
  (router as any)[method](r.path, requireAuth(r.auth), r.handler);
}

export function buildApiRouter() {
  const router = Router();
  router.use(attachContext);

  router.get('/', (_req, res) => {
    res.json({
      ok: true,
      domains: registry.map(d => d.domain),
      routes: registry.flatMap(d => d.routes.map(r => ({ id: r.id, method: r.method, path: '/api' + r.path })))
    });
  });

  for (const domain of registry) {
    for (const r of domain.routes) applyRoute(router, r);
  }

  return router;
}
