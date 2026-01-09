import type { DomainRegistry } from '../../types.js';
import { matchSpectrumRoute } from './handlers/matchSpectrum.js';
import { interestsRoute } from './handlers/interests.js';
import { statsRoute } from './handlers/stats.js';

export const scienceDomain: DomainRegistry = {
  domain: 'science',
  routes: [
    matchSpectrumRoute,
    interestsRoute,
    statsRoute
  ]
};
