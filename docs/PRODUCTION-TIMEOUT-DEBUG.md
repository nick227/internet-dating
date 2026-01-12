# Production Timeout Debugging Guide

## Problem
`/api/auth/me` times out after 15 seconds on production, even immediately after successful login.

## Root Cause Analysis

The issue is **NOT frontend loading** - that's working correctly with our timeouts.

The issue is **backend database query hanging** in the `/api/auth/me` endpoint.

## Evidence

1. Login works (proves database connection works)
2. `/api/auth/me` times out after 15s (proves request reaches backend)
3. Console shows: `[DEBUG] http: Request timeout { url: "/api/auth/me", timeoutMs: 15000 }`
4. Works instantly on localhost, only fails on Railway production

## Likely Causes

1. **Database Connection Pool Exhausted**
   - Too many connections open
   - Connections not being released
   - Need to check Prisma connection pooling

2. **Database Performance Issue**
   - Query is slow on production database
   - Missing index on user.id (unlikely, it's primary key)
   - Database overloaded

3. **Network Latency**
   - High latency between Railway app and database
   - Possible if database is in different region

4. **Prisma Client Not Connected**
   - Prisma client might not be properly initialized
   - Connection string might be wrong

## Diagnostic Steps

### Step 1: Check Database Connectivity

Visit: `https://your-app.railway.app/health/db`

Expected response:
```json
{ "ok": true, "dbLatency": 50 }
```

If it times out or returns 503, database connection is the problem.

### Step 2: Check Backend Logs

After deploying these changes, check Railway logs for:

```
[auth/me] Request received, userId=123
[auth/me] Starting database query for userId=123
[auth/me] Database query completed in XXXms
```

If you see the first line but not the others, the database query is hanging.

### Step 3: Check Prisma Connection String

Verify `DATABASE_URL` environment variable in Railway:
- Should be: `postgresql://user:pass@host:port/db?connection_limit=10`
- Add `?connection_limit=10` if missing
- Add `&pool_timeout=10` to fail fast

### Step 4: Check Connection Pool

Add to Railway environment variables:
```
DATABASE_CONNECTION_LIMIT=5
PRISMA_CLIENT_ENGINE_TYPE=binary
```

### Step 5: Monitor Database

Check your database provider (e.g., Railway PostgreSQL, Neon, Supabase):
- Connection count
- Query performance
- Active queries
- Connection pool status

## Changes Made

### 1. Backend: Added Database Query Timeout (`backend/src/registry/domains/auth/index.ts`)

```typescript
// Now times out after 10 seconds instead of hanging forever
const queryPromise = prisma.user.findUnique({...});
const timeoutPromise = new Promise((_, reject) => {
  setTimeout(() => reject(new Error('Database query timeout')), 10000);
});
const user = await Promise.race([queryPromise, timeoutPromise]);
```

### 2. Backend: Added Detailed Logging

All `/api/auth/me` requests now log:
- Request received
- Database query start
- Database query completion (with timing)
- Any errors

### 3. Backend: Added Database Health Check

New endpoint: `/health/db`
- Tests database connectivity
- Returns latency
- 5-second timeout

## Immediate Actions

### 1. Deploy Changes

```bash
git add backend/
git commit -m "feat: add database timeout and diagnostics for /auth/me"
git push
```

Wait for Railway to deploy.

### 2. Test Database Health

```bash
curl https://your-app.railway.app/health/db
```

### 3. Check Logs

In Railway dashboard → Logs, look for:
- `[auth/me]` entries
- Database timeout errors
- Connection errors

### 4. If Database Health Fails

**Option A: Connection Pool Issue**
```bash
# Railway CLI
railway variables set DATABASE_CONNECTION_LIMIT=5
railway variables set DATABASE_URL="${DATABASE_URL}?connection_limit=5&pool_timeout=10"
```

**Option B: Database Too Slow**
- Check your database provider's metrics
- Upgrade database plan if needed
- Consider connection pooler (PgBouncer)

**Option C: Wrong Database URL**
- Verify `DATABASE_URL` in Railway matches your database provider
- Check if database requires SSL: add `?sslmode=require`

### 5. If Database Health Passes But Auth Still Fails

This suggests a cookie/session issue:

**Check Cookie Settings:**
```typescript
// In production, cookies use:
sameSite: 'none',  // Required for cross-site
secure: true,      // Requires HTTPS
httpOnly: true
```

**Verify:**
1. Railway app uses HTTPS (should be automatic)
2. Browser Developer Tools → Application → Cookies
   - Look for `access_token` and `refresh_token`
   - Check Domain, Secure, SameSite values

**If cookies aren't being set:**
- Railway might not be serving over HTTPS properly
- Try changing `sameSite` from `'none'` to `'lax'` in production

## Quick Fixes

### Fix 1: Reduce Database Query Timeout

If 10s is too long, reduce to 5s in `backend/src/registry/domains/auth/index.ts`:

```typescript
setTimeout(() => reject(new Error('Database query timeout')), 5000);
```

### Fix 2: Add Connection Pooling

Update `DATABASE_URL` to include pooling:

```
postgresql://user:pass@host:port/db?connection_limit=5&pool_timeout=10&statement_timeout=10000
```

### Fix 3: Use Transaction Pooler

If using Neon, Supabase, or similar, use their connection pooler URL instead of direct connection.

## Long-term Solutions

### 1. Implement Redis Session Store

Replace JWT+database with Redis sessions:
- Faster lookups
- Better scalability
- No database queries for auth checks

### 2. Add Caching Layer

Cache user data for 1-5 minutes:
```typescript
const cached = await redis.get(`user:${userId}`);
if (cached) return JSON.parse(cached);

const user = await prisma.user.findUnique({...});
await redis.setex(`user:${userId}`, 300, JSON.stringify(user));
```

### 3. Optimize Database Connection

- Use connection pooler (PgBouncer)
- Enable Prisma connection pooling
- Monitor connection usage

### 4. Add Database Monitoring

- Set up alerts for slow queries
- Monitor connection pool saturation
- Track query performance

## Testing Checklist

- [ ] `/health/db` responds within 1 second
- [ ] Railway logs show `[auth/me] Database query completed`
- [ ] Login + redirect to /feed works without timeout
- [ ] No database timeout errors in logs
- [ ] Frontend loads within 2-3 seconds
- [ ] No console errors in browser

## Rollback Plan

If changes cause issues:

```bash
git revert HEAD
git push
```

## Next Steps

Once database connectivity is confirmed working:

1. Remove verbose logging from `/auth/me`
2. Consider caching user lookups
3. Monitor database performance
4. Set up proper error tracking (Sentry, etc.)
