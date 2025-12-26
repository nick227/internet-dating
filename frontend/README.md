# internet-date.com (frontend scaffold)

## Run
```bash
npm i
npm run dev
```

## Env
Create `.env`:
```bash
VITE_API_BASE_URL=http://localhost:4000
```

## Where to edit
- River: `src/ui/river/*` + `src/core/feed/useRiverFeed.ts`
- Profile: `src/ui/pages/ProfilePage.tsx` + `src/ui/profile/*`
- API boundary: `src/api/*` (swap `src/api/types.ts` for OpenAPI generated types later)
