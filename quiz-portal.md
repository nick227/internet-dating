# Quiz Portal Implementation Plan

## Overview
The **Quiz Portal** is the high-efficiency directory for discovering and managing quizzes. It prioritizes **searchability, sortability, and speed**, allowing users to rapidly find new content or review their past activity.

**Design Philosophy:** Functional Speed.
- **Fast Navigation:** Instant switching between the index and quiz detail views.
- **Unified List:** "History" is just a filter state, not a separate page section.
- **Mobile Optimized Controls:** Easy-to-reach sorting and filtering mechanisms.

## Architecture & Components

### 1. Structure (`src/ui/pages/QuizPortalPage.tsx`)
The page acts as a filterable list view controller.
- **Top Bar**: Search input & primary filter toggles.
- **Main Content**: A virtualized or paginated list of quizzes.
- **Bottom Actions**: (Optional) Quick sort/filter adjustments if not in Top Bar.

### 2. Components (`src/ui/quiz-portal/`)

#### `QuizFilterBar`
- **Purpose**: Controlling the "view" of the data.
- **Inputs**:
    - **Search**: Text input (debounced).
    - **Filter Tabs**: `All` | `New` | `In Progress` | `Completed` (History).
    - **Sort**: `Newest` | `Popular` | `Title`.
- **Mobile UX**: Horizontal scrolling chips for filters.

#### `QuizList`
- **Purpose**: displaying the filtered results.
- **Features**:
    - **Layout**: List view for mobile (detail dense), Masonry/Grid for desktop.
    - **Empty States**: Context-aware messages (e.g., "No completed quizzes yet").

#### `QuizCard`
- **Purpose**: Individual item in the list.
- **Content**:
    - Title & Description.
    - **Status Badge**: `New`, `In Progress (40%)`, `result: Architect`.
    - **Action**: One-tap entry. "Resume" vs "Start" vs "View Result".

### 3. Hooks (`src/ui/quiz-portal/hooks/`)

#### `useQuizDiscovery`
- **Responsibility**: Manages the search/filter state and API data.
- **Inputs**: `searchQuery`, `filterType`, `sortOrder`.
- **State**:
    - `items`: The list of quizzes.
    - `isLoading`.
- **Optimization**:
    - Debounce search input.
    - Memoize results if doing client-side filtering (though server-side preferred for scale).

## Data Requirements (API)

**Endpoint:** `GET /api/quizzes`
- **Params**:
    - `q`: Search query.
    - `status`: `all` | `completed` | `todo`.
    - `sort`: `createdAt` | `popularity`.

## Lean Implementation Steps

### Phase 1: Core Navigation & List
1.  **Scaffold**: `QuizPortalPage` with `QuizFilterBar` (UI only) and `QuizList`.
2.  **API Integration**: Ensure `useQuizDiscovery` connects to a list endpoint.
3.  **Basic Card**: `QuizCard` displaying title and rudimentary status.

### Phase 2: Search & Filter Logic
4.  **State Management**: Wire up text search and filter tabs to the hook.
5.  **Refined Status Logic**: Ensure the "History" filter works by filtering for `status='completed'`.

### Phase 3: Speed & Transition
6.  **Prefetching**: On hover/touch-start of a `QuizCard`, prefetch the individual quiz details.
7.  **Scroll Position Restoration**: Ensure going Back from a quiz returns to the exact scroll spot.

## Mobile CSS Strategy
- **Sticky Filters**: Keep the search/filter bar sticky at the top so users can change context without scrolling up.
- **Touch Areas**: Entire card should be clickable.
