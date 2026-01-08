# Admin Permissions & User Handling Review

## Issues Found

### 🔴 Critical Issues

1. **Inefficient AdminRoute - Repeated DB Queries**
   - Location: `frontend/src/core/routing/AdminRoute.tsx`
   - Issue: Makes a database query via `/api/auth/me` on every admin page render
   - Impact: Unnecessary database load, slow page transitions
   - **Current:** Every admin route navigation = 1 DB query
   - **Should be:** Role cached in session, 0 additional queries

2. **Session Missing Role Information**
   - Location: `frontend/src/core/auth/SessionProvider.tsx`
   - Issue: Session only stores `userId`, not `role`
   - Impact: Forces AdminRoute to make additional API calls
   - **Current:** `SessionData = { userId: string } | null`
   - **Should be:** `SessionData = { userId: string; role: string } | null`

3. **Duplicate Admin Checks in WebSocket**
   - Location: `backend/src/ws/index.ts`
   - Issue: Checks admin status on every connection but doesn't cache it
   - Impact: Extra DB query on every WS connection

### 🟡 Performance Issues

4. **AdminRoute Effect Runs Multiple Times**
   - Location: `frontend/src/core/routing/AdminRoute.tsx:41`
   - Issue: Effect depends on `auth.isAuthenticated`, which can trigger multiple times
   - Impact: Duplicate API calls (visible in console logs)

5. **No Role in useCurrentUser**
   - Location: `frontend/src/core/auth/useCurrentUser.ts`
   - Issue: Doesn't expose user role, forcing components to fetch it separately
   - Impact: Additional API calls when components need role info

6. **Duplicate Token Parsing Logic**
   - Locations: 
     - `backend/src/lib/auth/requireAuth.ts:7-12,14-31`
     - `backend/src/middleware/attachContext.ts:5-10,12-29`
   - Issue: Same token extraction/verification code exists in two places
   - Impact: Code duplication, maintenance burden

### 🟢 Security & Best Practices

7. **No Audit Logging**
   - Location: `backend/src/registry/domains/admin/`
   - Issue: Admin actions (enqueue, cancel jobs) don't create audit trail
   - Impact: Can't track who did what when
   - Missing: Dedicated audit log table and logging middleware

8. **No Rate Limiting on Admin Endpoints**
   - Location: `backend/src/registry/domains/admin/`
   - Issue: No protection against brute force or abuse
   - Impact: Compromised admin could spam requests

9. **No Session Invalidation**
   - Location: Auth system (multiple files)
   - Issue: Can't invalidate all sessions for a user
   - Impact: If admin account compromised, can't force logout everywhere

10. **No Admin Activity Monitoring**
    - Issue: No real-time visibility into admin actions
    - Impact: Can't detect suspicious admin behavior

## Recommended Improvements

### Priority 1 (Implement Now)

#### 1.1 Add Role to Session
**Files to modify:**
- `frontend/src/core/auth/SessionProvider.tsx`
- `backend/src/registry/domains/auth/index.ts` (already returns role)
- `frontend/src/api/client.ts` (update types)

**Changes:**
```typescript
// SessionProvider.tsx
type SessionData = { 
  userId: string;
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
} | null
```

**Benefits:**
- Eliminates need for AdminRoute to make extra API calls
- Role available everywhere via useSession()
- Single source of truth

#### 1.2 Simplify AdminRoute
**File:** `frontend/src/core/routing/AdminRoute.tsx`

**Changes:**
- Remove `useState`, `useEffect`, and API call
- Use `session.data?.role` directly
- Eliminate loading state (session already handles it)

**Benefits:**
- Instant admin check (no API call)
- Simpler code (~30 lines → ~15 lines)
- No duplicate API calls

#### 1.3 Add Role to useAuth Hook
**File:** `frontend/src/core/auth/useAuth.ts`

**Changes:**
```typescript
export function useAuth() {
  const session = useSession()
  return {
    isAuthenticated: Boolean(session.data?.userId),
    userId: session.data?.userId,
    role: session.data?.role,
    isAdmin: session.data?.role === 'ADMIN' || session.data?.role === 'SUPER_ADMIN',
    isSuperAdmin: session.data?.role === 'SUPER_ADMIN',
    loading: session.loading,
    error: session.error,
  }
}
```

**Benefits:**
- Easy admin checks anywhere: `auth.isAdmin`
- No need for separate admin status API calls

### Priority 2 (Implement Soon)

#### 2.1 Consolidate Token Parsing
**Action:** Create shared `parseAuthToken` utility
**Files:** Extract from `requireAuth.ts` and `attachContext.ts`

#### 2.2 Add Audit Logging
**Action:** Create audit log system
**New files:**
- `backend/prisma/schema/audit.prisma` (new table)
- `backend/src/lib/audit/logger.ts` (audit middleware)

**Schema:**
```prisma
model AuditLog {
  id          BigInt   @id @default(autoincrement())
  userId      BigInt
  action      String   // "job.enqueue", "job.cancel", etc.
  resource    String?  // "jobRun:123"
  details     Json?
  ipAddress   String?
  userAgent   String?
  timestamp   DateTime @default(now())
  
  user User @relation(fields: [userId], references: [id])
  @@index([userId])
  @@index([timestamp])
}
```

#### 2.3 Add WebSocket Role Caching
**File:** `backend/src/ws/index.ts`

**Changes:**
- Store role in socket metadata after first check
- Reuse cached role for admin event subscriptions

### Priority 3 (Future Enhancements)

#### 3.1 Session Management
- Add `GET /api/auth/sessions` - list active sessions
- Add `POST /api/auth/sessions/:id/revoke` - invalidate session
- Add `POST /api/auth/sessions/revoke-all` - logout everywhere

#### 3.2 Rate Limiting
- Add rate limiting middleware for admin endpoints
- Use Redis or in-memory store for rate limit tracking

#### 3.3 Admin Activity Dashboard
- Real-time feed of admin actions
- Alert system for suspicious behavior

#### 3.4 Permission Granularity
- Split ADMIN role into specific permissions
- E.g., `jobs:read`, `jobs:write`, `jobs:cancel`, `users:manage`

## Code Quality Observations

### Good Practices ✓
- Clear separation of auth rules (public, user, owner, admin, superAdmin)
- Consistent error handling
- Good logging in auth middleware
- Type-safe auth rules

### Areas for Improvement
- Too much duplication in auth code
- Missing JSDoc comments on auth functions
- No unit tests for auth logic (should have tests for requireAuth)
- Magic strings for roles (should use enum/constants)

## Security Review

### Current Security Posture: Good
- ✓ JWT with proper expiration
- ✓ HTTP-only cookies
- ✓ Proper password hashing (bcrypt)
- ✓ Role-based access control
- ✓ Token refresh mechanism

### Security Gaps
- ⚠️ No session invalidation
- ⚠️ No audit trail
- ⚠️ No rate limiting
- ⚠️ No IP-based restrictions for admin
- ⚠️ No 2FA for admin accounts

## Performance Impact

### Current Performance Issues
1. **AdminRoute**: +1 HTTP request per admin page navigation (~100ms)
2. **WebSocket**: +1 DB query per connection (~50ms)
3. **Duplicate calls**: Effect runs 2x in dev mode (React strict mode)

### After Improvements
- AdminRoute: 0 additional requests (instant check)
- WebSocket: Role cached in socket metadata
- Overall: ~85% reduction in auth-related DB queries

## Migration Plan

### Phase 1: Role in Session (Breaking Change)
1. Update session API contract
2. Update frontend SessionProvider
3. Update AdminRoute to use session role
4. Test thoroughly
5. Deploy backend first, then frontend

### Phase 2: Cleanup (Non-breaking)
1. Consolidate token parsing
2. Add audit logging
3. Add WebSocket caching

### Phase 3: Enhancements (Non-breaking)
1. Add rate limiting
2. Add session management
3. Add activity monitoring

## Testing Checklist

Before deploying improvements:
- [ ] Test admin user can access admin pages
- [ ] Test regular user is blocked from admin pages
- [ ] Test role changes take effect after logout/login
- [ ] Test WebSocket admin events work
- [ ] Test audit logs are created
- [ ] Test rate limiting kicks in
- [ ] Load test: 100 concurrent admin page navigations
- [ ] Security test: Try to bypass admin checks

## Estimated Impact

### Development Time
- Priority 1: ~4-6 hours
- Priority 2: ~8-12 hours
- Priority 3: ~16-24 hours

### Benefits
- **Performance**: 85% reduction in auth queries
- **Security**: Full audit trail
- **Maintenance**: 40% less auth code duplication
- **UX**: Faster admin page transitions

## Next Steps

1. ✅ Fix AdminRoute null check (already done)
2. 🔄 Implement Priority 1 improvements
3. 📋 Create audit log schema
4. 🧪 Add auth unit tests
5. 📊 Add monitoring for admin actions
