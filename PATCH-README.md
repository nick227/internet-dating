Patch: internet-date backend PoC handlers

How to apply
1) Unzip this file on top of your repo root (the folder that contains /backend and /prisma).
   - It will overwrite these backend files:
     - backend/package.json
     - backend/src/middleware/attachContext.ts
     - backend/src/lib/auth/requireAuth.ts
     - backend/src/registry/domains/*/index.ts (auth/feed/profiles/matches/messaging/quizzes/safety)
   - It will add:
     - backend/src/lib/http/json.ts
     - backend/src/lib/auth/guards.ts

2) In backend/:
   npm i
   npm run dev

POC auth
- For protected endpoints, send header: x-user-id: <number>
- /auth/signup and /auth/login return a userId to use for that header.

Quick test
- POST /api/auth/signup  { "email": "a@a.com", "password": "pw" }
- POST /api/auth/login   { "email": "a@a.com", "password": "pw" } -> { userId }

- POST /api/posts (x-user-id) { "text":"hello", "visibility":"PUBLIC" }
- GET  /api/feed (optional x-user-id)
