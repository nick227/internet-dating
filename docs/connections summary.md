# Connections System Summary

## Purpose
Connections unifies Inbox, Matches, Likes, Followers, and Following into a single, menu-driven hub with consistent list rows and per-section actions.

## Primary Route
- `/connections/:section` where `section` is one of: `inbox`, `matches`, `likes`, `followers`, `following`, `drafts`, `sent`, `trash`.
- Inbox thread detail: `/connections/inbox/:conversationId`.

## Navigation Model
- A top-left hamburger opens a drawer with all sections.
- The drawer shows per-section counts (numbers or `--` when not yet loaded).
- Active section controls the header title and refresh behavior.
- Drawer uses focus trap + scroll lock while open.

## Core Sections
### Inbox (Conversations)
- Data: `useInboxViewModel()`.
- Actions: delete thread (confirm modal).
- UI: row shows name, last message, timestamp, unread badge.
- UX: swipe left or tap overflow (`...`) for actions; skeleton rows on initial load.

### Matches
- Data: `useMatches()`.
- Actions: open chat when conversation exists, otherwise open profile.
- UI: row shows name, location/intent, match status.

### Likes (Profiles you liked)
- Data: `useLikes()`.
- Actions: Unlike (neutral removal), Request follow.
- UI: row shows profile meta and follow request status label.

### Followers / Following
- Data: `api.followers()` + `api.following()`; separate views.
- Actions (followers): Approve, Deny, Remove.
- Actions (following): Cancel pending requests.
- UI: row shows status label and request/update timestamps.

## Placeholder Sections
- Drafts, Sent, Trash are UI-only placeholders (Phase 2).
- No backend state; counts default to 0.

## Row Contract (Shared UI)
Each list item renders the same shape:
- Avatar, title, subtitle, timestamp.
- Optional status label and badge count.
- Section-specific actions (injected by the section).
- Actions can be exposed via swipe or overflow menu.

## Data / State Conventions
- All sections refresh on demand and re-fetch after actions.
- Action processing is centralized via `useAsyncAction`.
- Action errors are surfaced once per section, with retry.

## Cross-Section Invalidation
Edge case to handle:
- Approving a follower can create a match, open a conversation, and increment inbox counts.

Policy guidance:
- `approveFollower` should invalidate: followers list, matches list, inbox counts.
- Prefer count updates + row insertions over full refetches where possible.
Current MVP behavior:
- `approveFollower` invalidates `matches` + `inbox` counts (set to `--`) until those sections load.

## Refresh + Mutation Coupling
Current approach (re-fetch after every action) is safe but blunt.

Risks
- Jank on slower networks.
- Feels webby vs native, especially on repeat actions.

Direction
- Prefer optimistic row-level updates (hide/remove/mark) with background revalidation.
- Use undo affordances for destructive actions.

## UX Notes
- Flat, minimalist surfaces with subtle borders.
- Counts update when a section loads.
- Drawer is locked while destructive modals are open.
- Drawer focus trap and scroll lock to behave like a modal sheet.

## Destructive Action Hierarchy
- Primary tap: navigate.
- Secondary actions: safe / reversible.
- Destructive actions: overflow or long-press, not inline by default.

## Swipe Gesture Policy
- Single-direction swipe only (left-only) to avoid ambiguity.
- Secondary actions remain behind overflow; swipe should map to a single deterministic action.
Current MVP behavior:
- Left-only swipe opens actions; close via overflow or tapping the row.

## Native-Feel Upgrades (Low Cost)
- Row swipe gestures:
  - Inbox: swipe left -> delete.
  - Followers: swipe -> approve / deny.
- Undo snackbars for delete/remove.
- Skeleton rows on first load (avoid spinners).
- Sticky section memory (reopen to last section).
- Haptics on approve / match / delete.

## Drafts / Sent / Trash Future-Proofing
- Define the source of truth now (client-only store vs future API).
- Lock their row shape to avoid breaking `ConnectionRowModel` later.

## Architectural Refinements
- `useConnectionsNav()`: counts, active section, drawer state.
- `useConnectionsSection(section)`: data + actions per section.
- Adapter layer that maps all APIs -> `ConnectionRowModel`.
- `ConnectionCounts` should load independently from list data and allow invalidation by key.
- Prefer remove-only optimism first; defer in-place status mutations until phase 2.

## Data Invariants
- One conversation per match.
- One pending follow request per user.
- Approve/deny/remove are idempotent.
