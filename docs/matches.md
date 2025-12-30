# Matches System (Current Status)

## Overview
Matches are created via mutual likes (reactions). A match automatically provisions a
conversation. The system is minimal and supports listing matches and messaging
within active matches.

## Backend API (current)
- `POST /api/likes` (auth required)
  - Body: `{ toUserId, action: 'LIKE' | 'DISLIKE' }`
  - Stores a like record.
  - If action is `LIKE` and there is a reciprocal `LIKE`, a match is created/activated.
  - Also upserts a conversation for the matched pair.
  - Response: `{ ok, matched, matchId }`.
- `GET /api/matches` (auth required)
  - Returns up to 50 active matches for the user, ordered by `updatedAt`.
  - Includes both users with lightweight profile data + `conversation.id` if present.

## Data Model (current)
- `Match`
  - Fields: `userAId`, `userBId`, `state` (`ACTIVE`, `BLOCKED`, `CLOSED`), `createdAt`, `updatedAt`, `closedAt`.
  - Unique pair by ordered user IDs.
- `Conversation`
  - One per match (`matchId` unique).
  - Used by messaging endpoints for inbox and chat.
- `Message`, `MessageReceipt`
  - Standard message + read tracking.
- `Like` (schema)
  - Tracks like/dislike state by `fromUserId` -> `toUserId` with `LikeAction`.

## Frontend Surfaces (current)
- `/matches` page shows a list of matches with avatar, intent, location, and chat CTA.
- Match CTA opens the conversation route if `conversation.id` exists.
- Inbox (`/inbox`) filters by `match.state = ACTIVE`.
- River cards support a `match` accent, but the feed currently returns only posts + suggestions.

## Core Flow
1. User reacts (LIKE/DISLIKE) on another user.
2. Like record is stored.
3. If reciprocal LIKE exists:
   - Match is upserted and set ACTIVE.
   - Conversation is upserted for the pair.
4. Matches list and messaging use the active match.

**Reaction semantics**
- `DISLIKE` is reversible and treated as "not now," not a block.
- A later `LIKE` may overwrite a prior `DISLIKE`.

## Safety Integration
- Blocking a user sets the match state to `BLOCKED` and stamps `closedAt`.
- Messaging/inbox only surfaces `ACTIVE` matches.

## Known Gaps / Risks
- No unmatch endpoint (state transitions beyond `BLOCKED` are not exposed).
- No match pagination or filters beyond `state = ACTIVE`.
- No real-time match notifications or webhooks yet.

## Notes
- Feed suggestions are profile-based; match cards are not injected by the server yet.
- Reactions can be updated (upsert), so DISLIKE can be overwritten by a later LIKE.

## Planned Extensions
- Add an unmatch endpoint (`POST /matches/:id/close`) that sets `state = CLOSED` and stamps `closedAt`.
- Inject match cards server-side (low frequency; new match, first unread, revived conversation).
- Keep reactions simple: one row per pair with last action only (no history yet).

