import type { DomainRegistry } from './types.js';

import { systemDomain } from './domains/system/index.js';
import { authDomain } from './domains/auth/index.js';
import { feedDomain } from './domains/feed/index.js';
import { profilesDomain } from './domains/profiles/index.js';
import { matchesDomain } from './domains/matches/index.js';
import { messagingDomain } from './domains/messaging/index.js';
import { quizzesDomain } from './domains/quizzes/index.js';
import { safetyDomain } from './domains/safety/index.js';
import { mediaDomain } from './domains/media/index.js';

export const registry: DomainRegistry[] = [
  systemDomain,
  authDomain,
  feedDomain,
  profilesDomain,
  matchesDomain,
  messagingDomain,
  quizzesDomain,
  safetyDomain,
  mediaDomain
];
