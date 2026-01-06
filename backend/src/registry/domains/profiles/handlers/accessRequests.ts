import { Auth } from '../../../../lib/auth/rules.js';
import { json } from '../../../../lib/http/json.js';
import { parsePositiveBigInt } from '../../../../lib/http/parse.js';
import type { RouteDef } from '../../../../registry/types.js';
import { 
  requestAccess, 
  grantAccess, 
  approveAccess, 
  denyAccess, 
  cancelAccess, 
  revokeAccess,
  ValidationError, 
  NotFoundError, 
  ForbiddenError 
} from '../services/accessService.js';

// Helper to map service errors to HTTP responses
function handleServiceError(err: unknown, res: Parameters<typeof json>[0]): void {
  if (err instanceof ValidationError) {
    return json(res, { error: err.message }, 400);
  }
  if (err instanceof NotFoundError) {
    return json(res, { error: err.message }, 404);
  }
  if (err instanceof ForbiddenError) {
    return json(res, { error: err.message }, 403);
  }
  throw err;
}

export const requestAccessRoute: RouteDef = {
  id: 'profiles.POST./profiles/:userId/access-requests',
  method: 'POST',
  path: '/profiles/:userId/access-requests',
  auth: Auth.user(),
  summary: 'Request access to private profile content',
  tags: ['profiles'],
  handler: async (req, res) => {
    const userParsed = parsePositiveBigInt(req.params.userId, 'userId');
    if (!userParsed.ok) return json(res, { error: userParsed.error }, 400);
    
    const viewerUserId = req.ctx.userId!;

    try {
      const result = await requestAccess({
        ownerUserId: userParsed.value,
        viewerUserId
      });
      return json(res, { 
        status: result.status, 
        requestId: result.requestId 
      });
    } catch (err) {
      return handleServiceError(err, res);
    }
  }
};

export const grantAccessRoute: RouteDef = {
  id: 'profiles.POST./profiles/:userId/access-grants',
  method: 'POST',
  path: '/profiles/:userId/access-grants',
  auth: Auth.owner('userId'),
  summary: 'Grant access to private profile content',
  tags: ['profiles'],
  handler: async (req, res) => {
    const userParsed = parsePositiveBigInt(req.params.userId, 'userId');
    if (!userParsed.ok) return json(res, { error: userParsed.error }, 400);
    
    const viewerParsed = parsePositiveBigInt(req.body?.viewerUserId, 'viewerUserId');
    if (!viewerParsed.ok) return json(res, { error: viewerParsed.error }, 400);

    try {
      const result = await grantAccess({
        ownerUserId: userParsed.value,
        viewerUserId: viewerParsed.value
      });
      return json(res, { 
        status: result.status, 
        requestId: result.requestId 
      });
    } catch (err) {
      return handleServiceError(err, res);
    }
  }
};

export const approveAccessRoute: RouteDef = {
  id: 'profiles.POST./profiles/access-requests/:requestId/approve',
  method: 'POST',
  path: '/profiles/access-requests/:requestId/approve',
  auth: Auth.user(),
  summary: 'Approve a follow request',
  tags: ['profiles'],
  handler: async (req, res) => {
    const requestParsed = parsePositiveBigInt(req.params.requestId, 'requestId');
    if (!requestParsed.ok) return json(res, { error: requestParsed.error }, 400);
    
    const me = req.ctx.userId!;

    try {
      const result = await approveAccess({
        requestId: requestParsed.value,
        ownerUserId: me
      });
      return json(res, { 
        status: result.status, 
        requestId: result.requestId 
      });
    } catch (err) {
      return handleServiceError(err, res);
    }
  }
};

export const denyAccessRoute: RouteDef = {
  id: 'profiles.POST./profiles/access-requests/:requestId/deny',
  method: 'POST',
  path: '/profiles/access-requests/:requestId/deny',
  auth: Auth.user(),
  summary: 'Deny a follow request',
  tags: ['profiles'],
  handler: async (req, res) => {
    const requestParsed = parsePositiveBigInt(req.params.requestId, 'requestId');
    if (!requestParsed.ok) return json(res, { error: requestParsed.error }, 400);
    
    const me = req.ctx.userId!;

    try {
      const result = await denyAccess({
        requestId: requestParsed.value,
        ownerUserId: me
      });
      return json(res, { 
        status: result.status, 
        requestId: result.requestId 
      });
    } catch (err) {
      return handleServiceError(err, res);
    }
  }
};

export const cancelAccessRoute: RouteDef = {
  id: 'profiles.POST./profiles/access-requests/:requestId/cancel',
  method: 'POST',
  path: '/profiles/access-requests/:requestId/cancel',
  auth: Auth.user(),
  summary: 'Cancel a follow request',
  tags: ['profiles'],
  handler: async (req, res) => {
    const requestParsed = parsePositiveBigInt(req.params.requestId, 'requestId');
    if (!requestParsed.ok) return json(res, { error: requestParsed.error }, 400);
    
    const me = req.ctx.userId!;

    try {
      const result = await cancelAccess({
        requestId: requestParsed.value,
        ownerUserId: 0n, // Not used for cancel
        viewerUserId: me
      });
      return json(res, { 
        status: result.status, 
        requestId: result.requestId 
      });
    } catch (err) {
      return handleServiceError(err, res);
    }
  }
};

export const revokeAccessRoute: RouteDef = {
  id: 'profiles.POST./profiles/access-requests/:requestId/revoke',
  method: 'POST',
  path: '/profiles/access-requests/:requestId/revoke',
  auth: Auth.user(),
  summary: 'Revoke a follow',
  tags: ['profiles'],
  handler: async (req, res) => {
    const requestParsed = parsePositiveBigInt(req.params.requestId, 'requestId');
    if (!requestParsed.ok) return json(res, { error: requestParsed.error }, 400);
    
    const me = req.ctx.userId!;

    try {
      const result = await revokeAccess({
        requestId: requestParsed.value,
        ownerUserId: me
      });
      return json(res, { 
        status: result.status, 
        requestId: result.requestId 
      });
    } catch (err) {
      return handleServiceError(err, res);
    }
  }
};
