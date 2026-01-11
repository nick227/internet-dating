// Feed validation utilities
import { FEED_CONFIG_VERSION } from './config.js';
import { FEED_PRESORT_MIN_SEGMENT_ITEMS } from './constants.js';
import type { PresortedFeedSegment } from '../../../services/feed/presortedFeedService.js';

export type SegmentValidationResult =
  | { valid: true; segment: PresortedFeedSegment }
  | { valid: false; reason: 'not_found' | 'expired' | 'version_mismatch' | 'thin_segment' };

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

  if (segment.algorithmVersion !== FEED_CONFIG_VERSION) {
    return { valid: false, reason: 'version_mismatch' };
  }

  if (segment.items.length < FEED_PRESORT_MIN_SEGMENT_ITEMS) {
    return { valid: false, reason: 'thin_segment' };
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
