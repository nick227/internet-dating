import type { DomainRegistry } from '../../types.js';
import { getProfileRoute } from './handlers/getProfile.js';
import { 
  requestAccessRoute,
  grantAccessRoute,
  approveAccessRoute,
  denyAccessRoute,
  cancelAccessRoute,
  revokeAccessRoute
} from './handlers/accessRequests.js';
import { getFollowersRoute, getFollowingRoute } from './handlers/followers.js';
import { rateProfileRoute } from './handlers/rateProfile.js';
import { updateProfileRoute } from './handlers/updateProfile.js';
import { searchRoute, advancedSearchRoute, traitsRoute } from './handlers/search.js';
import { recommendationsRoute } from './handlers/recommendations.js';

export const profilesDomain: DomainRegistry = {
  domain: 'profiles',
  routes: [
    getProfileRoute,
    requestAccessRoute,
    grantAccessRoute,
    getFollowersRoute,
    getFollowingRoute,
    approveAccessRoute,
    denyAccessRoute,
    cancelAccessRoute,
    revokeAccessRoute,
    updateProfileRoute,
    rateProfileRoute,
    searchRoute,
    advancedSearchRoute,
    recommendationsRoute,
    traitsRoute
  ]
};
