# Production Cookie & Timing Debug Guide

## Key Discovery

Looking at localhost logs, `[auth] session:me:start` is called **TWICE** due to React StrictMode. On localhost this works fine, but on production the requests timeout.

## Hypothesis

The issue is likely **cookie propagation timing** or **database connection pool exhaustion** on production.

## Theory: Cookie Timing Issue

```
1. User logs in → POST /api/auth/login succeeds
2. Backend sets cookies (access_token, refresh_token)
3. Browser redirects to /feed
4. React renders → SessionProvider calls GET /api/auth/me
5. Cookie not sent yet? Or request made before cookies stored?
6. Backend receives request without auth cookies
7. Request times out or fails
```

## Diagnostic Steps

### Step 1: Check if Cookies are Being Set on Login

After deploying latest changes, open browser DevTools:

1. Go to Network tab
2. Clear all
3. Login
4. Look at the login response headers
5. Should see `Set-Cookie: access_token=...` and `Set-Cookie: refresh_token=...`

**If cookies are NOT being set:**
- Backend cookie settings might be wrong for production
- Check `sameSite` and `secure` flags in `backend/src/registry/domains/auth/index.ts`

### Step 2: Check if Cookies are Being Sent to /api/auth/me

1. Stay in Network tab
2. After login redirects, look for `/api/auth/me` request
3. Check Request Headers
4. Should see `Cookie: access_token=...; refresh_token=...`

**If cookies are NOT being sent:**
- Browser is blocking cookies due to SameSite policy
- Domain mismatch
- Cookie didn't have time to propagate

**Check Console for:**
```
[DEBUG] http: Auth request Object { url: "/api/auth/me", hasAuthCookies: true, cookieCount: 2 }
```

If `hasAuthCookies: false`, cookies aren't in the browser.

### Step 3: Check Backend Logs

In Railway logs, look for:

```
>>> START GET /api/auth/me
[request] Headers: {"cookie":"access_token=..."}
[auth/me] Request received, userId=123
```

**If you see "START" but no "Request received":**
- Request is reaching server but middleware is blocking/hanging
- Check auth middleware (JWT verification)

**If you don't see "START" at all:**
- Request never reaches backend
- Possible proxy/routing issue in Railway

### Step 4: Test Database Connection

```bash
curl https://your-app.railway.app/health/db
```

Should return within 1 second:
```json
{"ok":true,"dbLatency":50}
```

**If it times out:**
- Database connection is the problem
- Not a cookie issue

## Fixes Based on Diagnosis

### Fix 1: Cookie Settings (if cookies not being set)

In `backend/src/registry/domains/auth/index.ts`, change line 18:

```typescript
// Current (production uses sameSite: 'none')
const sameSite = isProduction ? ('none' as const) : ('lax' as const);

// Try this instead:
const sameSite = 'lax' as const;  // Works for same-domain
```

**When to use this:**
- If frontend and backend are on the same domain (Railway serves both)
- `sameSite: 'lax'` is more compatible
- `sameSite: 'none'` requires HTTPS and is for cross-domain

### Fix 2: Add Cookie Domain (if domain mismatch)

In `backend/src/registry/domains/auth/index.ts`, line 25:

```typescript
// Current
...(process.env.NODE_ENV !== 'production' ? {} : {}), // No domain

// Change to:
domain: process.env.COOKIE_DOMAIN || undefined,
```

Then set Railway environment variable:
```
COOKIE_DOMAIN=your-app.railway.app
```

### Fix 3: Database Connection Pooling (if DB is slow)

Update Railway environment variable `DATABASE_URL`:

```
# Add connection pooling parameters
postgresql://user:pass@host:port/db?connection_limit=5&pool_timeout=10&statement_timeout=10000
```

### Fix 4: Remove StrictMode in Production (already done)

Changed `frontend/src/main.tsx` to only use StrictMode in development.

This reduces duplicate renders on initial load.

## Expected Behavior After Fixes

### Console Logs (Production):

```
[DEBUG] http: Auth request { url: "/api/auth/me", hasAuthCookies: true, cookieCount: 2 }
[DEBUG] http: Auth response { url: "/api/auth/me", status: 200, ok: true }
```

### Backend Logs (Railway):

```
>>> START GET /api/auth/me
[auth/me] Request received, userId=123
[auth/me] Starting database query for userId=123
[auth/me] Database query completed in 50ms
[auth/me] Success, returning user data, duration=55ms
>>> GET /api/auth/me 200 60ms
```

### Browser Behavior:

1. Login succeeds
2. Redirects to /feed
3. Feed loads within 1-2 seconds
4. No timeout errors
5. No redirect back to login

## Quick Test Script

After deploying, run this in browser console on production:

```javascript
// Check if cookies exist
console.log('Cookies:', document.cookie);
console.log('Has auth cookies:', document.cookie.includes('access_token'));

// Test /api/auth/me directly
fetch('/api/auth/me', { credentials: 'include' })
  .then(r => r.json())
  .then(data => console.log('Auth check result:', data))
  .catch(err => console.error('Auth check failed:', err));

// Test database health
fetch('/health/db')
  .then(r => r.json())
  .then(data => console.log('DB health:', data))
  .catch(err => console.error('DB health failed:', err));
```

## Most Likely Issues

Based on symptoms (works on localhost, times out on production):

1. **Database connection pool exhausted** (70% probability)
   - Fix: Add connection pooling to DATABASE_URL
   - Fix: Reduce concurrent connections

2. **Cookie sameSite policy blocking** (20% probability)
   - Fix: Change `sameSite: 'none'` to `sameSite: 'lax'`

3. **Railway backend not responding** (10% probability)
   - Fix: Check Railway logs for errors
   - Fix: Restart Railway service

## Deployment Steps

```bash
# 1. Commit changes
git add -A
git commit -m "fix: add cookie diagnostics and production optimizations"

# 2. Push to Railway
git push

# 3. Wait for Railway to deploy (check logs)

# 4. Test immediately
curl https://your-app.railway.app/health
curl https://your-app.railway.app/health/db

# 5. Try login in browser
# - Open DevTools Console
# - Check for [DEBUG] http logs
# - Check Network tab for cookies

# 6. Check Railway logs for [auth/me] entries
```

## If Still Failing

### Nuclear Option 1: Simplify Cookie Settings

```typescript
// backend/src/registry/domains/auth/index.ts
const getCookieOpts = (rememberMe: boolean = false) => {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: false,  // Try without secure first
    path: '/',
    ...(rememberMe ? { maxAge: 30 * 24 * 60 * 60 * 1000 } : {})
  };
};
```

### Nuclear Option 2: Add Delay After Login

```typescript
// frontend: After successful login
await new Promise(resolve => setTimeout(resolve, 100));
window.location.href = '/feed';
```

This gives cookies time to propagate.

### Nuclear Option 3: Use LocalStorage Instead

Replace JWT cookies with localStorage tokens (less secure but more reliable).

## Success Metrics

- ✅ Login succeeds
- ✅ Cookies are set (visible in DevTools)
- ✅ `/api/auth/me` responds within 1 second
- ✅ `/health/db` responds within 1 second  
- ✅ Feed page loads without timeout
- ✅ No console errors
- ✅ No Railway log errors
