export function toIdString(value: string | number | bigint | null | undefined): string {
  if (value == null) return ''
  return String(value)
}

export function idsEqual(
  a: string | number | bigint | null | undefined,
  b: string | number | bigint | null | undefined
): boolean {
  if (a == null || b == null) return false
  return String(a) === String(b)
}
