export function toAge(birthdate: string | null | undefined) {
  if (!birthdate) return undefined
  const d = new Date(birthdate)
  if (Number.isNaN(d.getTime())) return undefined
  const today = new Date()
  let age = today.getFullYear() - d.getFullYear()
  const m = today.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1
  return age > 0 ? age : undefined
}
