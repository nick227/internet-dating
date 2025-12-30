# Critical CSS Process Review

## Overview

The critical CSS system uses a **two-layer approach**:
1. **Critical CSS** (inlined in HTML `<head>`) - Immediate paint
2. **Non-critical CSS** (loaded asynchronously) - Full stylesheet

## Current Architecture

### CSS File Structure

```
frontend/src/styles/
├── critical.css      ✅ Inlined in HTML (via vite plugin)
├── index.css         ✅ Entry point (imports utilities + components)
├── utilities.css     ✅ Loaded via index.css
├── components.css    ✅ Loaded via index.css
├── tokens.css        ⚠️  NOT imported (orphaned?)
└── base.css          ❌ NOT imported (orphaned)
```

### Critical CSS Injection Process

**File**: `frontend/vite-plugin-critical-css.ts`

1. **Plugin Hook**: `transformIndexHtml` (runs on every HTML transform)
2. **Source**: Reads `src/styles/critical.css`
3. **Processing**:
   - Removes comments
   - Minifies whitespace
   - Collapses spaces
4. **Injection**: Inserts `<style id="critical-css">` before `</head>`
5. **Timing**: Runs in both dev and production

### Critical CSS Content

**File**: `frontend/src/styles/critical.css`

**What's Included**:
- CSS Variables (colors, spacing, safe-area)
- Base reset (`box-sizing`, `html/body`)
- Shell layout (`.shell`, `.stage`)
- River container (`.river`, `.river__pad`)
- First card frame (`.riverCard` - minimal styles)
- Card meta container (`.riverCard__meta`)
- Card name/header (`.riverCard__name`)
- Scrim overlay (`.riverCard__scrim`)
- Stack utility (`.u-stack`)
- Skeleton placeholder (`.riverCard--skeleton`)

**What's NOT Included** (loaded later):
- Full card styles (media, actions, engagement)
- Modal styles
- Profile page styles
- All other page-specific styles

## Issues Found & Fixed

### 1. ✅ Padding Inconsistency (FIXED)

**Problem**: Critical CSS used hardcoded values while components.css used variables

**Before**:
```css
/* critical.css */
.river__pad {
  padding: calc(env(safe-area-inset-top, 0px) + 8px) 12px calc(110px + env(safe-area-inset-bottom, 0px));
  gap: 12px;
}

/* components.css */
.river__pad {
  padding: calc(var(--safe-top) + var(--s-2)) var(--s-3) calc(110px + var(--safe-bot));
  gap: var(--s-3);
}
```

**After**:
```css
/* critical.css - Now uses variables */
.river__pad {
  padding: calc(var(--safe-top) + var(--s-2)) var(--s-3) calc(110px + var(--safe-bot));
  gap: var(--s-3);
}
```

**Impact**: Ensures consistent padding between critical and non-critical CSS

### 2. ✅ Hardcoded Values (FIXED)

**Fixed**:
- `padding: 16px` → `padding: var(--s-4)`
- `gap: 8px` → `gap: var(--s-2)`
- `gap: 12px` → `gap: var(--s-3)`

**Remaining** (intentional):
- `border-radius: 24px` (could use `var(--r-4)` but 24px is explicit)
- `font-size: 28px` (could use `var(--fs-6)` but explicit for critical path)
- `110px` bottom padding (intentional - accounts for bottom nav)

### 3. ⚠️ Orphaned CSS Files

**`base.css`**: NOT imported anywhere
- Contains: `box-sizing`, `html/body`, `body` styles
- **Status**: Duplicated in `critical.css` (intentional for critical path)
- **Action**: Can be deleted (styles are in critical.css)

**`tokens.css`**: NOT directly imported
- Contains: All CSS variables (`--s-*`, `--r-*`, `--fs-*`, colors, etc.)
- **Status**: Variables are duplicated in `critical.css` (intentional)
- **Action**: Keep for reference, but critical.css must be self-contained

## Critical CSS Accuracy Check

### ✅ Variables Defined

Critical CSS defines all necessary variables:
```css
:root {
  --s-2: 8px;
  --s-3: 12px;
  --s-4: 16px;
  --r-4: 24px;
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bot: env(safe-area-inset-bottom, 0px);
  /* + colors */
}
```

### ✅ Self-Contained

Critical CSS is **self-contained** - doesn't depend on:
- `tokens.css` (variables duplicated)
- `base.css` (styles duplicated)
- Any external stylesheet

### ✅ Injection Verification

**How to Verify**:
1. Open browser DevTools
2. View page source (not inspected HTML)
3. Look for `<style id="critical-css">` in `<head>`
4. Check that styles are minified (no comments, minimal whitespace)

**Expected Output**:
```html
<head>
  <style id="critical-css">:root{--bg:#07070a;--s-2:8px;...}.river__pad{padding:calc(var(--safe-top)+var(--s-2)) var(--s-3) calc(110px+var(--safe-bot));...}</style>
</head>
```

## CSS Loading Order

1. **Critical CSS** (inlined in HTML) - Blocks render, ensures immediate paint
2. **index.css** (loaded via JS) - Imports utilities + components
3. **utilities.css** - Utility classes
4. **components.css** - Component styles (overrides/extends critical)

## Padding Calculation

### `.river__pad` Padding Breakdown

```css
padding: calc(var(--safe-top) + var(--s-2)) var(--s-3) calc(110px + var(--safe-bot));
```

**Top**: `env(safe-area-inset-top, 0px) + 8px`
- Safe area (notch) + 8px spacing

**Sides**: `12px` (`var(--s-3)`)
- Horizontal padding

**Bottom**: `110px + env(safe-area-inset-bottom, 0px)`
- 110px for bottom nav (60px nav + 50px spacing)
- + Safe area (home indicator)

## Recommendations

### ✅ Completed
- [x] Fix padding inconsistencies (use variables)
- [x] Replace hardcoded values with variables
- [x] Ensure critical CSS is self-contained

### 🔄 Optional Improvements
- [ ] Consider using `var(--r-4)` for `border-radius: 24px`
- [ ] Consider using `var(--fs-6)` for `font-size: 28px`
- [ ] Delete `base.css` (duplicated in critical.css)
- [ ] Document why `110px` bottom padding is hardcoded

### 📝 Notes

1. **Critical CSS must be self-contained** - It's inlined before any other CSS loads
2. **Variables are duplicated** - This is intentional (critical.css can't depend on tokens.css)
3. **Hardcoded `110px`** - Accounts for bottom nav height (60px) + spacing (50px)
4. **Minification** - Plugin minifies critical CSS to reduce HTML size

## Testing Critical CSS

### Manual Verification

1. **Check HTML Source**:
   ```bash
   curl http://localhost:5173 | grep -A 5 "critical-css"
   ```

2. **Check Browser DevTools**:
   - Network tab: Should see critical CSS in HTML response
   - Elements tab: Should see `<style id="critical-css">` in `<head>`

3. **Visual Check**:
   - Page should have correct background color immediately
   - River container should have correct padding
   - Cards should have correct border-radius

### Automated Testing

Consider adding a test that:
1. Fetches HTML
2. Extracts critical CSS
3. Verifies required selectors are present
4. Verifies variables are defined
