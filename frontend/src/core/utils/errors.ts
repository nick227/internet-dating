export function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'string') return error
  if (error instanceof Error && error.message) return error.message
  return fallback
}
