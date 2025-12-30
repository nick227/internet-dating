/**
 * Core shared types that are reused across multiple modules
 *
 * Guidelines:
 * - Only add types here if they're used in 3+ different files/modules
 * - Types must be conceptually stable (not volatile view-state types)
 * - Component-specific types should stay in component files
 * - Domain types go in api/types.ts
 * - API types go in api/contracts.ts
 *
 * Examples of what NOT to add:
 * - ConversationState, RiverState (volatile hook state)
 * - Component-specific props or state
 * - Temporary UI state types
 *
 * Examples of what TO add:
 * - Id, RatingScores (stable domain concepts)
 * - Shared enums or constants
 */

// Re-export common types for convenience
export type { Id, RatingScores, RatingSummary } from '../../api/types'
