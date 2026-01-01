# Inbox

## Purpose
- Conversation list that shows the most recent message per thread (chat-like inbox).
- Acts as the entry point into a full conversation view.

## Core UI (row layout)
- Avatar + display name of the other user.
- Latest message snippet (from either side).
- Timestamp for latest message.
- Unread indicator (badge count, bold preview) when there are unread messages in the thread.
- Optional system label when latest message is a system follow request.

## Row actions
- Open thread: primary action on the row.
- Delete thread (soft delete for current user only): confirm before delete.
- Follow request actions (only when latest message is a follow-request system message):
  - Accept
  - Deny

## Behaviors
- Sorted by latest activity (conversation updatedAt).
- Opening a thread marks it as seen at the conversation level (unread count -> 0).
- Follow-request actions update the request status and refresh the row state.
- Deleted threads disappear for the current user but remain for the other user.

## Pagination / infinite scroll
- Uses `nextCursorId` for infinite scroll.
- Fetches additional conversations as the user nears the bottom.
- Shows a small loading state at the end of the list.

## Empty + error states
- Empty: "No conversations yet" with short guidance.
- Error: show a brief error panel with retry/refresh.

## Open questions
- Should system follow requests show a visible label (e.g., "System")?
- Should we allow multi-select or bulk delete?
- Do we need a "mute" or "archive" option at the inbox level?
