# Application Bootstrap Flow

## Overview

This document describes the optimized application bootstrap sequence, focusing on minimizing loading time and providing guaranteed fallbacks.

## Component Hierarchy

```
main.tsx
  └─ BrowserRouter
      └─ App.tsx
          └─ SessionProvider (manages auth state)
              └─ ModalStateProvider
                  └─ AppShell (shell UI)
                      └─ PageTransition
                          └─ Routes
                              └─ ProtectedRoute / PublicRoute / AdminRoute
                                  └─ Page Component (e.g., FeedPage)
```

## Loading Sequence

### 1. Initial Render (0ms)
- React hydrates DOM
- SessionProvider initializes
- **No blocking** - UI renders immediately

### 2. Session Check (0-15s)
- `SessionProvider` calls `/api/auth/me`
- **Timeout: 15 seconds**
- Returns: `{ userId, role }` or `null`

**Success Path:**
```typescript
session.loading = true
  ↓ (100-500ms typical)
session.data = { userId: "123", role: "USER" }
session.loading = false
```

**Failure Path:**
```typescript
session.loading = true
  ↓
401 Unauthorized → Try refresh
  ↓
Refresh fails (401/408/timeout/error)
  ↓
session.data = null
session.loading = false
  ↓
Redirect to /login
```

### 3. Route Guard Check (0-10s)
- `ProtectedRoute` evaluates `auth.loading` and `auth.isAuthenticated`
- **Timeout: 10 seconds** (fallback if session hangs)
- Shows `<RouteLoading />` while checking

**Decision Tree:**
```
auth.loading?
├─ Yes → Wait (max 10s)
│   └─ Timeout → Redirect to /login
└─ No → Check auth.isAuthenticated
    ├─ Yes → Render protected content
    └─ No → Redirect to /login
```

### 4. AppShell Render
- Uses `auth.loading` (NOT `currentUser.loading`)
- Shows loading overlay while `auth.loading = true`
- Renders immediately when auth completes

### 5. Profile Fetch (Background, Non-blocking)
- `useCurrentUser()` fetches profile data
- **Does NOT block render**
- Used only for TopBar display (avatar, name)
- Falls back to defaults if profile unavailable

### 6. Page Content
- Route-specific page renders
- Example: `FeedPage` → Phase 1 feed (lite) → Phase 2 feed (full)

## Critical Timing

| Stage | Best Case | Typical | Worst Case |
|-------|-----------|---------|------------|
| Session check | 100ms | 300ms | 15s (timeout) |
| Route guard | 0ms | 0ms | 10s (timeout) |
| First paint | 200ms | 500ms | 16s |
| Profile load | +200ms | +400ms | +30s (non-blocking) |
| Feed Phase 1 | +100ms | +300ms | +30s (timeout) |

## Timeout Strategy

### Why Multiple Timeout Layers?

1. **HTTP layer (15s)**: Prevents hung network requests
2. **Route guard (10s)**: Guarantees UI never hangs
3. **Auth cooldown (5s)**: Prevents infinite retry loops

### Timeout Behavior

```
Request timeout (15s)
  ↓
SessionProvider receives 408 error
  ↓
Returns null (unauthenticated)
  ↓
Route guard sees !isAuthenticated
  ↓
Redirect to /login (immediate)
```

If session check itself hangs (doesn't timeout):
```
Route guard starts 10s timer
  ↓
Timer expires
  ↓
Route guard sets timedOut = true
  ↓
Redirect to /login (immediate)
```

## Error Handling

### Auth Errors

| Error Type | Status | Action |
|------------|--------|--------|
| Timeout | 408 | Return null → Redirect |
| Network failure | 0 | Return null → Redirect |
| Unauthorized | 401 | Try refresh → Return null → Redirect |
| Forbidden | 403 | Return null → Redirect |
| Server error | 500+ | Return null → Redirect |
| Abort | - | Throw (cleanup) |

### Retry Strategy

- **No automatic retries** for auth requests
- User can manually retry by refreshing page
- Cooldown (5s) prevents rapid retry loops
- Global flag prevents multiple tabs from retrying simultaneously

## Optimizations

### 1. Parallel vs Sequential
**Before:** Session → Profile → Render
**After:** Session → Render + Profile (parallel)

### 2. Loading State
**Before:** `loading = auth.loading || profileLoading`
**After:** `loading = auth.loading` (profile non-blocking)

### 3. Error Recovery
**Before:** Errors throw → useAsync retries → hang
**After:** Errors return null → immediate redirect

### 4. Timeout Protection
**Before:** No timeouts → infinite hang
**After:** Multiple timeout layers → max 16s wait

## Developer Notes

### Adding New Protected Routes

```typescript
<Route
  path="/your-path"
  element={
    <ProtectedRoute>
      <YourPage />
    </ProtectedRoute>
  }
/>
```

Timeout protection is automatic - no configuration needed.

### Debugging Load Time

1. Enable debug mode:
   ```typescript
   localStorage.setItem('debug:feed', '1')
   ```

2. Check console for:
   - `[auth] session:me:start`
   - `[auth] session:me:success`
   - `[ProtectedRoute] Auth check timed out` (if timeout occurs)

3. Use Chrome DevTools → Network → Slow 3G to test

### Common Issues

**Issue:** Loading takes 10s even with valid session
**Cause:** Backend /api/auth/me is slow
**Fix:** Optimize backend auth endpoint

**Issue:** Redirect to login takes 10s
**Cause:** Session timeout, route guard hits 10s limit
**Fix:** Check network connectivity, reduce timeout if acceptable

**Issue:** Profile data missing in TopBar
**Cause:** Profile fetch failed (non-critical)
**Fix:** Check /api/profiles/:id endpoint, verify error handling

## Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| Time to first paint (fast network) | < 500ms | ~400ms |
| Time to interactive (fast network) | < 1s | ~800ms |
| Time to first paint (slow network) | < 5s | ~2-3s |
| Maximum load time (any network) | < 20s | ~16s |
| Auth check success (valid session) | < 500ms | ~300ms |
| Auth check failure (no session) | < 2s | ~500ms |

## Monitoring

### Key Metrics to Track

1. **Auth check duration** - P50, P95, P99
2. **Timeout frequency** - How often 10s/15s timeouts trigger
3. **First paint time** - Time to interactive UI
4. **Error rates** - 408, 500, network failures
5. **Redirect time** - Time from page load to login redirect

### Alerts

- Auth check P95 > 2s
- Timeout rate > 5%
- Error rate > 1%
- First paint > 3s

## Future Optimizations

1. **Service worker caching** - Cache auth response for instant load
2. **Preflight auth check** - Check auth before hydration
3. **Skeleton customization** - Page-specific skeletons
4. **Progressive enhancement** - Render without JS (server-side)
5. **Auth token in URL** - Skip auth check for deep links with token
