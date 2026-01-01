export function usePresenceLabel(presenceStatus: 'online' | 'away' | 'offline' | null | undefined): string | null {
  if (presenceStatus === 'online') return 'Online now'
  if (presenceStatus === 'away') return 'Away'
  if (presenceStatus === 'offline') return 'Offline'
  return null
}
