/**
 * Pure validation functions for post composer
 */
import { MAX_TAG_LENGTH, TAG_PATTERN } from './postComposerConstants'

export type ValidationResult = {
  valid: boolean
  error?: string
}

export function validatePostContent(text: string, filesCount: number): ValidationResult {
  const trimmedText = text.trim()
  if (!trimmedText && filesCount === 0) {
    return {
      valid: false,
      error: 'Add text or at least one photo.',
    }
  }
  return { valid: true }
}

export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase()
}

export function validateTag(tag: string): ValidationResult {
  const normalized = normalizeTag(tag)
  if (!normalized) {
    return { valid: false, error: 'Tag cannot be empty' }
  }
  if (normalized.length > MAX_TAG_LENGTH) {
    return {
      valid: false,
      error: `Tags must be ${MAX_TAG_LENGTH} characters or less.`,
    }
  }
  if (!TAG_PATTERN.test(normalized)) {
    return {
      valid: false,
      error: 'Tags must use letters, numbers, or hyphens only.',
    }
  }
  return { valid: true }
}

export function normalizeTags(tags: string[]): string[] {
  const normalized = tags.map(normalizeTag).filter(Boolean)
  return Array.from(new Set(normalized))
}

export function validateTags(tags: string[]): ValidationResult {
  const normalized = normalizeTags(tags)
  for (const tag of normalized) {
    const result = validateTag(tag)
    if (!result.valid) {
      return {
        valid: false,
        error: result.error || `Invalid tag: ${tag}`,
      }
    }
  }
  return { valid: true }
}
