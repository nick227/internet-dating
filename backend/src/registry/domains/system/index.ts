import type { DomainRegistry } from '../../types.js';
import { Auth } from '../../../lib/auth/rules.js';

export const systemDomain: DomainRegistry = {
  domain: 'system',
  routes: [
    {
      id: 'system.GET./meta',
      method: 'GET',
      path: '/meta',
      auth: Auth.public(),
      summary: 'API meta',
      tags: ['system'],
      handler: (_req, res) => res.json({ name: 'internet-date', version: '0.0.1' })
    }
  ]
};
