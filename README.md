# internet-dating.com 

Production-minded dating app POC with a sequence-first feed, match system, and job-driven personalization.

## Railway Single-Service Launch (MySQL + One Volume)
This setup assumes one Railway service for the Node app, one Railway MySQL database, and one attached volume for uploads.

### Railway Environment Variables
Backend required:
- `DATABASE_URL` (Railway MySQL connection string)
- `JWT_ACCESS_SECRET` (random 32+ chars)
- `JWT_REFRESH_SECRET` (random 32+ chars)
- `NODE_ENV=production`

Backend recommended:
- `SERVE_FRONTEND=true` (serve `frontend/dist` from the backend)
- `MEDIA_BASE_URL` (public base URL for media, e.g. `https://your-app.up.railway.app`)
- `MEDIA_UPLOAD_DIR` (volume path, e.g. `/data/uploads/media`)
- `JWT_ACCESS_TTL` (optional, default `15m`)
- `JWT_REFRESH_TTL` (optional, default `30d`)

Frontend build:
- `VITE_API_BASE_URL` (public API base URL, e.g. `https://your-app.up.railway.app`)

### Railway Commands (root of repo)
Build command:
```
npm install
npm run build
npm run -w backend prisma:generate
```

Release command (runs migrations):
```
npm run -w backend prisma:migrate -- --schema prisma/schema
```

Start command:
```
npm run start
```

### Railway UI Setup (DB + Volume)
MySQL:
- Create a Railway MySQL service and link it to the app.
- Set `DATABASE_URL` in the app service to the Railway MySQL connection string.

Volume:
- Attach a volume to the app service (e.g. mount at `/data`).
- Set `MEDIA_UPLOAD_DIR=/data/uploads/media`.

### Railway One-Off Commands (Migrations, Seeds, Jobs)
Use Railway "Release Command" for migrations so you do not need SSH:
- Release command: `npm run -w backend prisma:migrate -- --schema prisma/schema`

If you need to run one-off tasks manually (Railway "Run Command" or SSH):
```
npm run -w backend prisma:generate
npm run -w backend prisma:migrate -- --schema prisma/schema
npm run -w backend seed:all
node --import tsx backend/scripts/runJobs.ts match-scores --userId=8
node --import tsx backend/scripts/runJobs.ts feed-presort --userId=8
```

Jobs are not scheduled by default in this repo. To automate them, use Railway cron
or a separate worker service that runs `scripts/runJobs.ts` on an interval.

## Repository Structure
- `backend/` Express + Prisma API, jobs, and seeds.
- `frontend/` Vite + React UI.
- `shared/` Shared types/contracts.
- `docs/` Product + architecture notes.

## Feed System (Sequence-First)
The feed is server-ordered and sequence-driven. The sequence defines the repeating pattern, and caps are guardrails only.

Core flow (runtime):
1) `buildViewerContext` -> read query + auth
2) `getCandidates` -> posts + suggestions + questions
3) `scoreCandidates` -> recency + affinity placeholder + seen demotion
4) `mergeAndRank` -> applies sequence pattern
5) `hydrateFeedItems` -> media/stats/compatibility

Config entry point:
- `backend/src/registry/domains/feed/config.ts`

Example sequence:
- 3 video posts -> 1 suggestion -> 1 quiz -> repeat.

## Presorted Feed (Job)
Presort builds cached feed segments using the same sequence and scoring logic.
- Job: `feed-presort`
- Storage: `PresortedFeedSegment` table

## Jobs System
Jobs precompute expensive data and keep API latency stable.

Implemented:
- `match-scores` (suggestion discovery)
- `compatibility` (relationship view)
- `content-features`
- `trending`
- `affinity`
- `feed-presort`
- `feed-presort-cleanup`

Unified CLI:
```
cd backend
npx tsx scripts/runJobs.ts match-scores --userId=8
npx tsx scripts/runJobs.ts content-features --batchSize=50
npx tsx scripts/runJobs.ts trending --windowHours=48 --minEngagements=5
npx tsx scripts/runJobs.ts affinity --userId=8
npx tsx scripts/runJobs.ts feed-presort --userId=8
```

## Matching System (High Level)
- Users send likes/dislikes.
- Mutual likes create a Match + Conversation.
- Suggestions are driven by MatchScore; matches are relationship state.

## Seeding
Scripts live in `backend/scripts/`.
Common entry points:
```
cd backend
npm run seed:all
npx tsx scripts/seedFeedDemo.ts
```

## Local Setup
1) Install dependencies:
```
npm install
```
2) Configure database:
```
backend/.env
DATABASE_URL=...
```
3) Prisma generate + sync:
```
cd backend
npm run prisma:generate
npx prisma db push --schema prisma/schema
```
4) Start dev servers:
```
npm run dev:backend
npm run dev:frontend
```

## OpenAPI Types
Backend emits OpenAPI; frontend consumes generated types.
```
cd backend
npm run openapi:emit
cd ../frontend
npm run openapi:types
```
