export function prettyIntent(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase())
}
