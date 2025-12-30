# Feed Card Contract

## Source of Truth

This document defines the canonical feed card contract between backend and frontend.

## Card Kind System

### Design Principle

**Card kinds represent UI shapes, not semantic reasons.**

- ✅ `kind: "match"` - What user sees: a match card
- ✅ `kind: "profile"` - What user sees: a profile card  
- ✅ `kind: "post"` - What user sees: a post card
- ❌ `kind: "suggestion"` - Why shown: because algorithm suggested it (deprecated)

### Backend → Frontend Mapping

| Backend Type | Backend Source | Frontend Kind | Component |
|-------------|----------------|---------------|-----------|
| `post` | N/A | `post` | `PostCard` |
| `suggestion` | `"match"` | `match` | `MatchCard` |
| `suggestion` | `"suggested"` \| `null` | `profile` | `ProfileCard` |

### Current Card Kinds

```typescript
type FeedCardKind =
  | 'profile'    // Profile card (from suggestions)
  | 'post'       // Post card
  | 'media'      // Media-focused card (future)
  | 'match'      // Match card (from suggestions with source: "match")
  | 'question'   // Quiz question card (future)
  | 'highlight'  // Highlighted content card (future)
  | 'ad'         // Advertisement card (future)
  | 'suggestion' // DEPRECATED: Use 'profile' or 'match' instead
```

## Required Fields

### All Cards
- `id: string` - Unique card identifier (scoped per kind: `post-123`, `match-456`)
- `kind: FeedCardKind` - Canonical card type (backend-driven via adapter)

### Post Cards
- `actor.id: Id` - User ID
- `actor.name: string` - Display name (fallback: "Unknown")
- `content.id: string` - Content identifier
- `content.createdAt: string` - ISO timestamp

### Profile/Match Cards
- `actor.id: Id` - User ID
- `actor.name: string` - Display name (fallback: "Unknown")
- `content.id: string` - Content identifier

## Missing Fields (Backend Gaps)

### 🔴 Must Fix (Breaks UI)

**FeedSuggestion:**
- `avatarUrl?: string` - Required for header rendering
- `stats?: FeedCardStats` - Required for social proof

**FeedPost:**
- `stats?: FeedCardStats` - Required for engagement display

### 🟡 Can Defer (Feature Gaps)

**FeedPost:**
- `comments.preview?: Array<{ id: string; text: string }>` - Comments not yet supported
- `question?: { id: string; quizId?: Id; prompt: string; options: FeedCardQuestionOption[] }` - Questions not yet supported

**FeedSuggestion:**
- `heroUrl?: string` - Can derive from media[0] if media exists
- `media?: ApiFeedMedia[]` - Can be empty for profile-only cards

## Adapter Responsibilities

1. **Normalize card kinds** - Map backend semantic types to UI-driven kinds
2. **Validate required fields** - Log warnings in dev mode for missing fields
3. **Fail fast on unknown types** - Skip invalid items, log errors
4. **Type-safe field access** - Check for field existence before casting
5. **Store semantic metadata** - Use `flags.reason` for analytics (source, boost level, etc.)

## Extensibility

To add a new card type:

1. **Backend:** Add new type to `FeedItem.type` enum
2. **Adapter:** Add handler in `adaptFeedResponse()` with validation
3. **Types:** Add kind to `FeedCardKind` union
4. **River:** Add renderer to `cardRenderers` map
5. **Component:** Create new `*Card.tsx` component

Example:
```typescript
// Backend
type: "question"
question: { id: string; prompt: string; ... }

// Adapter
if (item.type === 'question' && item.question) {
  items.push({
    id: `question-${item.question.id}`,
    kind: 'question',
    // ...
  })
}

// River.tsx
question: (props) => <QuestionCard {...props} />
```

## Validation Rules

### Development Mode
- Log warnings for missing optional fields
- Log errors for missing required fields
- Log debug messages for intentionally unsupported fields
- Fail fast on unknown card types

### Production Mode
- Skip invalid items silently
- Use fallbacks for missing optional fields
- Never crash on malformed data

## Testing Checklist

- [ ] Post cards render with all required fields
- [ ] Match cards (source: "match") render as MatchCard
- [ ] Profile cards (source: "suggested") render as ProfileCard
- [ ] Unknown card types are handled gracefully
- [ ] Missing required fields show warnings in dev
- [ ] Missing optional fields use appropriate fallbacks
- [ ] Card IDs are unique and properly scoped
- [ ] Infinite loading works with cursor pagination
- [ ] Deduplication prevents duplicate cards
