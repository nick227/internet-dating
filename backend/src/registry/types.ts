import type { HttpMethod, Handler } from '../lib/http/types.js';
import type { AuthRule } from '../lib/auth/rules.js';

export type RouteSpec = {
  id: string;
  method: HttpMethod;
  path: string;
  auth: AuthRule;
  summary?: string;
  tags?: string[];
};

export type RouteDef = RouteSpec & { handler: Handler };

export type DomainRegistry = {
  domain: string;
  routes: RouteDef[];
};
