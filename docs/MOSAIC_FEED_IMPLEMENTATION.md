# Smart Mosaic Feed Implementation

## Overview

The feed now supports intelligent mosaic card display, automatically optimizing media presentation for maximum engagement.

## Architecture

### Backend Configuration

**File:** `backend/src/registry/domains/feed/config.ts`

```typescript
const sequence: FeedSlot[] = [
  { kind: 'post', mediaType: 'video', count: 2, presentation: 'single' },
  { kind: 'post', mediaType: 'image', count: 1, presentation: 'mosaic' }, // ✨ Mosaic card
  { kind: 'suggestion', count: 1, presentation: 'single' },
  { kind: 'question', count: 1 }
];
```

**Feed Pattern:** 2 video posts → 1 mosaic image post → 1 suggestion → 1 question → repeat

### Frontend Components

#### 1. MosaicCard Component
**File:** `frontend/src/ui/river/MosaicCard.tsx`

Dedicated card component that forces mosaic presentation mode. Wraps the standard card structure but ensures media is displayed in mosaic grid layout.

**Features:**
- Forces `presentation.mode = 'mosaic'`
- Inherits all standard card functionality (comments, engagement, actions)
- Memoized for optimal performance

#### 2. Smart Media Selector
**File:** `frontend/src/core/feed/mosaicMediaSelector.ts`

Intelligent media selection and optimization for mosaic display.

**Scoring Algorithm:**
```typescript
Videos (high engagement):     100 points + 20 bonus for <30s
Images:                       50 points
Embeds:                       40 points

Quality indicators:
  - Has dimensions:           +10 points
  - Square aspect ratio:      +15 points (optimal for mosaic)
  - Portrait aspect ratio:    +10 points (good for primary slot)
  - Has thumbnail:            +5 points (faster loading)
```

**Functions:**
- `selectMosaicMedia()` - Selects top 3 media items by score
- `optimizeMosaicLayout()` - Orders media for optimal grid placement
- `isMosaicWorthy()` - Validates if media set is suitable for mosaic (needs 2+ items, 1+ high-quality)

#### 3. Enhanced RiverCardMedia
**File:** `frontend/src/ui/river/RiverCardMedia.tsx`

Updated to use smart selector:
```typescript
const mosaicItems = mode === 'mosaic' 
  ? optimizeMosaicLayout(items.slice(0, 3)) 
  : []
```

#### 4. Dynamic Component Loading
**File:** `frontend/src/ui/river/LazyCard.tsx`

Smart component selection based on presentation mode:
```typescript
const componentKey = card.presentation?.mode === 'mosaic' ? 'mosaic' : card.kind
const Component = cardComponents[componentKey] || FallbackCard
```

## Mosaic Grid Layouts

### 1 Item: Full-Width Single
```
┌─────────────────┐
│                 │
│      IMAGE      │
│                 │
└─────────────────┘
```

### 2 Items: Side-by-Side Split
```
┌─────────┬─────────┐
│         │         │
│    A    │    B    │
│         │         │
└─────────┴─────────┘
```

### 3+ Items: Primary + Thumbnails
```
┌───────────┬─────┐
│           │  B  │
│     A     ├─────┤
│ (Primary) │  C  │
└───────────┴─────┘
```

**CSS Grid:**
```css
.riverCard__mediaMosaic {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: var(--s-2);
}

.riverCard__mediaTile--a { grid-column: 1; grid-row: 1 / span 2; }
.riverCard__mediaTile--b { grid-column: 2; grid-row: 1; }
.riverCard__mediaTile--c { grid-column: 2; grid-row: 2; }
```

## Visual Enhancements

### CSS Features

**Hover Effects:**
```css
.riverCard__mediaTile:hover {
  transform: scale(1.02);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 1;
}
```

**Entry Animation:**
```css
@keyframes mosaicFadeIn {
  from { opacity: 0; transform: scale(0.98); }
  to { opacity: 1; transform: scale(1); }
}
```

## Configuration Examples

### Example 1: Heavy Mosaic Feed
```typescript
const sequence: FeedSlot[] = [
  { kind: 'post', mediaType: 'image', count: 1, presentation: 'mosaic' },
  { kind: 'post', mediaType: 'video', count: 1, presentation: 'single' },
  { kind: 'suggestion', count: 1, presentation: 'mosaic' },
  { kind: 'question', count: 1 }
];
```
Pattern: mosaic image → video → mosaic profile → question → repeat

### Example 2: Media Showcase Feed
```typescript
const sequence: FeedSlot[] = [
  { kind: 'post', mediaType: 'any', count: 1, presentation: 'mosaic' },
  { kind: 'post', mediaType: 'any', count: 1, presentation: 'mosaic' },
  { kind: 'suggestion', count: 1, presentation: 'single' },
];
```
Pattern: mosaic → mosaic → suggestion → repeat

### Example 3: Balanced Feed (Current)
```typescript
const sequence: FeedSlot[] = [
  { kind: 'post', mediaType: 'video', count: 2, presentation: 'single' },
  { kind: 'post', mediaType: 'image', count: 1, presentation: 'mosaic' },
  { kind: 'suggestion', count: 1, presentation: 'single' },
  { kind: 'question', count: 1 }
];
```
Pattern: 2 videos → 1 mosaic → suggestion → question → repeat

## Performance Optimizations

1. **Lazy Loading:** MosaicCard is lazy-loaded via React.lazy()
2. **Memoization:** Card component is memoized with strict prop comparison
3. **Smart Scoring:** Media scoring happens once per render via useMemo
4. **CSS Containment:** Uses `content-visibility: auto` for off-screen cards
5. **Intersection Observer:** Only loads cards when they enter viewport

## Testing Recommendations

1. **Media Variety:** Test with 0, 1, 2, and 3+ media items
2. **Media Types:** Mix videos, images, and embeds
3. **Aspect Ratios:** Test square, portrait, and landscape images
4. **Empty States:** Verify empty mosaic displays correctly
5. **Mobile:** Test touch interactions and responsive layouts
6. **Performance:** Monitor FPS during scroll with many mosaic cards

## Future Enhancements

- [ ] Add click-to-expand for mosaic tiles
- [ ] Support 4+ item mosaic (overflow indicator)
- [ ] Smart cropping based on face detection
- [ ] Animated transitions between media items
- [ ] Mosaic-specific video playback (play on hover)
- [ ] Dynamic grid layouts based on aspect ratios
- [ ] Pinterest-style variable-height mosaics

## Files Modified

### Backend
- `backend/src/registry/domains/feed/config.ts` - Added mosaic to sequence

### Frontend
- `frontend/src/ui/river/MosaicCard.tsx` - ✨ NEW: Dedicated mosaic card component
- `frontend/src/ui/river/LazyCard.tsx` - Added mosaic component loading
- `frontend/src/ui/river/RiverCardMedia.tsx` - Integrated smart selector
- `frontend/src/core/feed/mosaicMediaSelector.ts` - ✨ NEW: Smart media optimization
- `frontend/src/styles/components/mosaic/index.css` - Enhanced hover effects
- `frontend/src/styles/components/river/index.css` - Added fade-in animation

## Benefits

✅ **Engagement:** Mosaic showcases multiple media at once  
✅ **Performance:** Smart selection reduces unnecessary renders  
✅ **UX:** Smooth animations and hover effects  
✅ **Flexibility:** Easy to configure via backend sequence  
✅ **Quality:** Prioritizes best media automatically  
✅ **Mobile-First:** Touch-optimized grid layouts
