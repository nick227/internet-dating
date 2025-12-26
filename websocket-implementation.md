# WebSocket implementation (minimal, modular, extendable)

## Current backend status (quick check)
- Backend is Express-only; no WebSocket server or ws library is wired.
- Entry point: `backend/src/index.ts` uses `app.listen(...)`.
- App factory: `backend/src/app/createApp.ts` builds REST routes and middleware.

## Goals
- Centralize WebSocket message definitions in one place.
- Support two real-time domains first: messenger signals + online status.
- Keep the server minimal (no full chat over WS yet), modular, and easy to extend.

## Recommendation: keep REST for writes, use WS for signals
Minimal path:
- Messages are created via existing REST endpoints.
- WebSocket only pushes signals (new message, read receipts, typing, presence).
- This avoids duplicating validation/business logic in the WS layer.

## Centralized message definitions
Create a shared contract file and consume it on both backend and frontend.

Single source of truth (preferred, no copying):
- `shared/src/ws/contracts.ts`
- Import it from both backend and frontend via `@app/shared/ws/contracts`.
- Avoid duplicated files; contract drift here will hurt.

### Message envelope
Use a small, typed envelope so every event has the same shape:
```ts
export type WsEnvelope<T extends string, P> = {
  type: T
  data: P
  ts: number
  id?: string
}
```

### Event map
Keep a simple map of event names to payloads:
```ts
export type WsEvents = {
  "server.messenger.message_new": {
    conversationId: string
    messageId: string
    senderId: string
    createdAt: string
  }
  "server.messenger.message_read": {
    conversationId: string
    messageId: string
    readerId: string
    readAt: string
  }
  "client.messenger.typing": {
    conversationId: string
    userId: string
    isTyping: boolean
  }
  "server.presence.update": {
    userId: string
    status: "online" | "away" | "offline"
    lastSeenAt?: string
  }
  "server.presence.batch": {
    users: { userId: string; status: "online" | "away" | "offline" }[]
  }
  "client.system.subscribe": {
    topics: (
      | { kind: "conversation"; id: string }
      | { kind: "user"; id: string }
    )[]
  }
  "server.system.error": { message: string; code?: string }
  "server.system.internal_disconnect": {
    userId: string
    socketId: string
    reason: "heartbeat_timeout" | "client_close" | "auth_failed"
  }
}
```

## Server architecture (minimal + modular)
### 1) Create HTTP server once, attach WS
Switch from `app.listen` to an HTTP server and attach WS:
- `const server = http.createServer(app)`
- `const wss = new WebSocketServer({ server, path: "/ws" })`

### 2) Central WS module
Create `backend/src/ws/index.ts`:
- Owns `wss`, connection lifecycle, and routing.
- Imports `contracts.ts` to validate event names.
- Delegates message handling to domain modules.

### 3) Domain modules
Create domain folders:
- `backend/src/ws/domains/messenger.ts`
- `backend/src/ws/domains/presence.ts`

Each exports:
- `registerHandlers(router)`
- `onConnect(ctx)`
- `onDisconnect(ctx)`

### 4) Small router
A tiny map of `type -> handler` is enough:
```ts
type Handler = (ctx: WsContext, msg: WsEnvelope<any, any>) => void | Promise<void>
const handlers = new Map<string, Handler>()
```

## System diagram (high level)
```text
Browser (WS client)
   |   connect + auth
   v
Backend WS server (/ws) ----> Presence tracker (in-memory)
   |   subscribe topics                |
   |   client.* signals                | tick -> server.presence.update
   v                                   v
Router + domain handlers           Notifier (initNotifier/notify)
   |                                   |
   |                                   v
   |                            Fan-out by subscriptions
   |                                   ^
   |                                   |
   +---- REST handlers (authoritative writes) ----+
```

## Auth + identity (reject early)
Do auth before registering the socket:
- Parse cookies / headers on connection.
- Verify JWT once.
- If invalid, close immediately: `socket.close(4401, "unauthorized")`.
- Store `ctx.userId` on the socket.

Do not:
- Allow a connection then block messages.
- Re-verify token per message.

Reason: presence correctness and smaller surface area.

Failure behavior:
- Early failures (auth, malformed events) close the socket immediately.
- Runtime errors surface as `server.system.error` without crashing the process.

## WS context is immutable after auth
Once set, do not mutate identity:
```ts
ctx = {
  userId,
  socketId,
  subscriptions,
  connectedAt
}
```

Each socket has an immutable connection context (`userId`, `socketId`, `subscriptions`, `connectedAt`) that is not mutated after auth.

## Presence (online status) design
Presence is socket-count based, not binary:
```ts
Map<userId, {
  sockets: Set<WebSocket>
  status: "online" | "away"
  lastSeenAt: number
}>
```

Rules:
- User is online if `sockets.size > 0`.
- User goes offline only when the last socket closes.
- Tabs do not equal users.
- Away is server-derived: no activity for N minutes.

Do not:
- Let clients set "away" directly.

Heartbeat (server owns truth):
- Server pings every ~25s.
- Client never sends "I'm alive" manually.
- Missing 2 pongs -> force close socket.
- `onDisconnect` handles cleanup.

Do not:
- Base presence on browser visibility.
- Rely on `beforeunload`.

## Subscriptions (explicit, no blind broadcast)
Add a client -> server message to register interests:
```ts
"client.system.subscribe": {
  topics: (
    | { kind: "conversation"; id: string }
    | { kind: "user"; id: string }
  )[]
}
```

Fan-out targets:
- Conversation members.
- Profile viewers.
- Self (always).

Mandatory rule (guardrail):
- No subscriptions -> no fan-out events (except self/system).
- This prevents accidental global broadcasts later.

## Messenger signals
When REST creates/reads a message:
- Emit WS events via a shared notifier:
  - `server.messenger.message_new` to conversation participants.
  - `server.messenger.message_read` to participants.
  - Optional `client.messenger.typing` from client input events.

Implementation hook:
- Create a notifier module `backend/src/ws/notify.ts` that can be imported by REST handlers.
- Keep WS optional (no-op if server not initialized).

Recommended pattern:
```ts
let emit: ((event: unknown) => void) | null = null

export function initNotifier(fn: (event: unknown) => void) {
  emit = fn
}

export function notify(event: unknown) {
  emit?.(event)
}
```

WS server calls `initNotifier`, REST calls `notify`. No hard dependency from REST -> WS.
REST emits fully-formed server envelopes (`type`, `data`, `ts`) through the notifier, keeping the WS layer dumb.

## Keep it minimal + extendable
- Only one WS endpoint (`/ws`) with a simple envelope.
- Split domains by folder; add new ones by registering handlers.
- Shared contracts prevent drift.
- Use in-memory state first; later swap presence + pub/sub to Redis if needed.

## Frontend client (keep it dumb)
Minimal client wrapper:
- Centralize in `frontend/src/api/wsClient.ts` and expose a singleton via `frontend/src/api/realtime.ts`.
- Reconnect with backoff.
- Queue outgoing signals briefly.
- Dispatch incoming events to stores.

Do not:
- Interpret business meaning.
- Acknowledge messages.
- Mutate server truth.

Think "event listener", not "API client".

## Architectural framing
You are not building "chat over WebSockets".
You are building a real-time event bus scoped to authenticated users.

This framing:
- Keeps WS thin.
- Keeps REST authoritative.
- Makes a Redis swap trivial later.
- Avoids protocol sprawl.

## Message lifecycle (end-to-end)
1) Connect + auth
   - Client opens `/ws` and sends cookies/headers.
   - Server verifies JWT once; if invalid, closes with `4401`.
   - Server creates immutable `ctx` and sets presence online.

2) Subscribe (required)
   - Client sends `client.system.subscribe` with topic list.
   - Server replaces `ctx.subscriptions`.
   - Without subscriptions, only self/system events are delivered.

3) Client signal (typing)
   - Client sends `client.messenger.typing`.
   - Router dispatches to `messenger` domain handler.
   - Server can fan-out to conversation subscribers.

4) REST write -> WS signal
   - REST endpoint creates message (authoritative path).
   - REST calls `notify(...)`.
   - WS server emits `server.messenger.message_new` to subscribed topics.

5) Presence heartbeat + away
   - Server pings every ~25s.
   - Missing 2 pongs forces disconnect cleanup.
   - `presenceTick()` emits `server.presence.update` based on activity/away rules.

## Initial rollout checklist
- Add `ws` dependency to backend.
- Add shared contracts file.
- Create WS server module + notifier.
- Update REST message/create to call notifier.
- Add frontend client for messenger + presence.
- Update HeroSection "Online now" pill to use presence state.

## Notes on scale
When multiple backend instances are used:
- Replace in-memory presence with Redis.
- Broadcast via Redis pub/sub.
- Keep contracts unchanged to avoid client churn.
