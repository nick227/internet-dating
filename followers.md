# Followers system review

## Current flow (front end -> API -> schema)
- Profile follow uses `/api/profiles/:userId/access-requests` to create a `ProfileAccess` row in `PENDING` and posts a system message to the shared conversation.
- Owner sees pending requests in the Followers page and can approve/deny via `/api/profiles/access-requests/:requestId/approve` or `/api/profiles/access-requests/:requestId/deny`.
- Feed relationship tiers use `ProfileAccess` rows with `GRANTED` only.

## Known gaps and mismatches
- Inbox + conversation show the follow request message but provide no approve/deny action in that context. Actions only exist on `/followers`.
- The API contract exposes `DENIED`/`REVOKED` access statuses, but the profile access summary collapses those to `NONE`, so the requestor sees a "Follow" button even when the backend blocks re-requests.
- Deny currently doubles as revoke; there is no explicit "remove follower" or "cancel request" flow, and denied requests disappear from lists on refresh.
- Follow request messages are not linked to a requestId, so the UI cannot map a message to a follow request without extra data.

## Schema notes (should we change user.prisma?)
- `user.prisma` already has relations for `profileAccessGranted` and `profileAccessReceived` and does not need new columns for follow logic.
- If we want inbox actions or audit/history, add fields to `ProfileAccess` (in `backend/prisma/schema/access.prisma`) rather than `User`.
  - Potential fields: `respondedAt`, `statusUpdatedAt`, `decisionReason`, `source`, `lastNotifiedAt`.
- If we want action buttons inside messages, add metadata to `Message` (in `backend/prisma/schema/messaging.prisma`) such as `kind` + `actionRef` or a `followRequestId` foreign key.

## Frontend ideas
- Inbox and conversation: render actions on follow-request system messages (approve/deny, maybe view profile).
- Followers page: add "Cancel request" for pending following, and "Remove follower" for granted followers.
- Profile page: show a denied/revoked state and remove the "Follow" button when re-requests are blocked.

## API ideas
- Add endpoints for canceling a pending request (viewer) and revoking a granted follower (owner).
- Return `DENIED`/`REVOKED` in profile access summary so the UI can render correct state.
- Include a requestId in follow-request messages or return a mapping in inbox responses.

## Open questions
- Should denied requests be re-requestable after a cooldown?
- Do we want explicit "block" separate from "deny"?
- Should follow requests be independent from private-content access, or are they the same concept?
