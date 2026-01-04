/**
 * Formats a trait key for display in the UI.
 * 
 * Converts keys like "personality.extroversion" or "values.honesty_score"
 * to display-friendly text like "extroversion" or "honesty score"
 */
export function formatTraitKey(key: string): string {
  return key.split('.').slice(1).join(' ').replace(/_/g, ' ')
}