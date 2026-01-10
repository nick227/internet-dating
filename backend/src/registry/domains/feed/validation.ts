// Feed validation utilities
import { FEED_ALGORITHM_VERSION } from './constants.js';
import type { PresortedFeedSegment } from '../../../services/feed/presortedFeedService.js';

export type SegmentValidationResult =
  | { valid: true; segment: PresortedFeedSegment }
  | { valid: false; reason: 'not_found' | 'expired' | 'version_mismatch' };

/**
 * Validate presorted segment for use
 * Checks existence, expiration, and algorithm version
 */
export function validatePresortedSegment(
  segment: PresortedFeedSegment | null
): SegmentValidationResult {
  if (!segment) {
    return { valid: false, reason: 'not_found' };
  }

  if (segment.algorithmVersion !== FEED_ALGORITHM_VERSION) {
    return { valid: false, reason: 'version_mismatch' };
  }

  if (segment.expiresAt <= new Date()) {
    return { valid: false, reason: 'expired' };
  }

  return { valid: true, segment };
}

/**
 * Check if cursor cutoff is valid for use
 */
export function validateCursorCutoff(
  cursorCutoff: { id: bigint; createdAt: Date } | null
): boolean {
  return cursorCutoff !== null;
}
