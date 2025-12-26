# Frontend roadmap

## Snapshot
- Vite + React Router app with AppShell, Feed, Profile, Inbox, Quiz pages.
- API types are generated from OpenAPI with adapters for UI models.
- Auth flow (login/signup/refresh) is wired; top bar reflects session state.
- Feed supports posts + profile suggestions with pagination and abortable requests.

## Completed
- Align API types with backend responses via OpenAPI and adapters.
- Implement a real feed model for posts and profile suggestions.
- Refactor `useRiverFeed` to use effects, memoized observer options, and AbortSignal.
- Replace placeholder icons/text with real copy and inline SVGs.
- Implement inbox list, conversation view, and message sending.
- Build quiz flow for active quizzes and submission.

## Issues
- Current user displayName requires a profile fetch; `/auth/me` does not include displayName.
- `useAsync` relies on callers to manage dependency arrays (lint suppressed).
- Limited accessibility coverage beyond the feed cards (audit needed).
- No automated tests for API client and hooks.
- Conversation header does not show the other user's name/avatar.

## Next steps
### Short term (1-2 days)
- Add lightweight test coverage for API client and key hooks.

### Medium term (1-2 weeks)
- Add profile editing and media upload flows.
- Add notifications/badges for matches and messages.
- Improve caching for current user and feed data.

### Longer term
- Harden auth UX (forgot password, email verification).
- Add end-to-end tests for feed, auth, and swipes.
