# Registry-driven REST API

Everything under `/api` is generated from `backend/src/registry`.

## Where to edit

- `backend/src/registry/domains/*/index.ts`  
  Add/edit endpoints here.

- `backend/src/registry/registry.ts`  
  The one list that loads all domains.

## Add an endpoint

Add an object to a domain `routes[]`:

- `id`: unique string
- `method`: GET/POST/PUT/PATCH/DELETE
- `path`: relative to `/api`
- `auth`: `Auth.public()` | `Auth.user()` | `Auth.owner('param')`
- `handler`: Express handler

## Auth rules in the registry

Yes: each route declares `auth:`. The pipeline applies it automatically.

Current auth is a stub: protected routes require header `x-user-id: <number>`.
