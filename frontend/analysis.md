# Frontend analysis

## Purpose
This frontend is a Vite + React client for the internet-dating.com POC. It focuses on a sequence-first feed ("River"), profile and messaging flows, and realtime presence via WebSocket events.

## Stack
- React 18 + TypeScript
- React Router for routing and page transitions
- Vite for dev/build, with custom plugins for critical CSS and inline shell
- PostCSS + cssnano for styling pipeline
- Vitest for unit tests, Playwright for end-to-end tests

## Entrypoints and routing
- `src/main.tsx` mounts the app and loads `src/styles/index.css`.
- `src/App.tsx` defines routes, lazy-loads non-feed pages, and wraps everything with `AppShell` and `PageTransition`.
- `src/core/routing/ProtectedRoute.tsx` and `src/core/routing/PublicRoute.tsx` gate auth-only routes.

## App shell and global UI
- `src/ui/shell/AppShell.tsx` is the main layout. It handles auth-aware navigation, error boundaries, swipe navigation, and lazy-loaded modals.
- Top-level navigation lives in `src/ui/shell/TopBar.tsx` and `src/ui/shell/BottomNav.tsx`.
- Modals are lazy-loaded and rendered via `src/ui/shell/ModalRenderer.tsx` to keep the initial bundle small.

## Data layer and API client
- `src/api/client.ts` is the centralized API surface. It uses `src/api/http.ts` and adapters (`src/api/adapters.ts`) to normalize payloads.
- OpenAPI types are generated into `src/api/openapi.ts` using `scripts/generateOpenapiTypes.mjs`.
- API base URL comes from `src/config/env.ts` (defaults to `http://localhost:4000`).

## Feed system ("River")
- `src/ui/river/River.tsx` is the feed container and renderer.
- `src/core/feed/useRiverFeedPhased.ts` implements two-phase feed loading:
  - Phase 1: lite payload for fastest first paint.
  - Phase 2: full payload after initial render.
- Feed cards live in `src/ui/river/` and are lazy-loaded with `src/ui/river/LazyCard.tsx`.
- Card-level state (ratings, questions, comments) comes from `src/ui/river/useRiverCardState.ts`.
- `src/core/feed/useFeedSeen.ts` tracks visibility for "seen" events.
- `src/core/feed/useFeedSync.ts` batches seen/negative actions to localStorage and the API (stubbed endpoints).
- `src/core/feed/useOptimisticFeed.ts` handles optimistic insertion for new posts.

## Realtime and presence
- `src/core/ws/useRealtime.ts` connects/disconnects the WS client based on auth state.
- `src/core/ws/presence.ts` tracks and subscribes to presence updates, consumed by profile and river cards.

## Auth and session
- `src/core/auth/useSession.ts`, `useAuth.ts`, and `useCurrentUser.ts` coordinate session fetch and auth state.
- Auth changes are broadcast through `src/core/auth/authEvents.ts` and used to refresh the feed cache.

## Profile and media
- `src/ui/profile/` holds profile UI, hero mosaic, and editing tools.
- `src/core/profile/` contains profile data hooks and access logic.
- Media upload and preview helpers are in `src/core/media/`.

## Messaging and matches
- Messaging hooks are in `src/core/messaging/`.
- Pages are in `src/ui/pages/InboxPage.tsx` and `src/ui/pages/ConversationPage.tsx`.
- Matches UI lives in `src/ui/pages/MatchesPage.tsx`.

## Quiz
- Quiz flow is driven by `src/core/quiz/useActiveQuiz.ts` and `src/ui/pages/QuizPage.tsx`.

## Styling system
- Global styles: `src/styles/base.css`, `src/styles/tokens.css`, `src/styles/utilities.css`.
- Component styles are grouped under `src/styles/components/` by feature.
- `src/styles/critical.css` holds above-the-fold styles used by the Vite critical CSS plugin.

## Testing
- Unit tests: `src/**/__tests__` (run with `npm run test` or `npm run test:run`).
- E2E tests: `tests/` with Playwright (run with `npm run test:e2e`).
- Visual/network/manual helpers: `test-visual.html`, `test-network.html`, `test-quick.js`.

## Useful scripts (frontend/package.json)
- `npm run dev` - start Vite dev server
- `npm run build` - type-check and build
- `npm run lint` / `npm run lint:fix` - lint
- `npm run analyze` - unused/dead code analysis (knip)
- `npm run analyze:deps` - circular dependency check (madge)
- `npm run openapi:types` - regenerate OpenAPI client types

## Notes for new contributors
- The feed uses a window event bus (custom events) for seen/negative actions. Search for `feed:` events before adding new feed actions.
- Presence is optional in the feed (cards accept `presenceStatus`, but the river currently passes `null` by default).
- Debug logging can be toggled via `localStorage.setItem('debug:feed', '1')` for feed API and store events.
- When touching feed/render performance, review `useRiverFeedPhased.ts`, `LazyCard.tsx`, and `River.tsx` together.
