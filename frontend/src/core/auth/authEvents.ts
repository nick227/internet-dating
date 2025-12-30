/**
 * Auth event system.
 *
 * emitAuthChange() means: "the auth boundary may have changed; refetch session."
 *
 * This is intentionally generic - it doesn't specify what changed (login/logout/refresh).
 * Components should refetch session state when they receive this event.
 *
 * Cross-tab synchronization: Uses localStorage events to sync across tabs.
 */
const AUTH_EVENT = 'auth:changed'
const STORAGE_KEY = 'auth:changed'

export function emitAuthChange() {
  if (typeof window === 'undefined') return

  // Dispatch event in current tab
  window.dispatchEvent(new Event(AUTH_EVENT))

  // Update localStorage to trigger storage event in other tabs
  // Use timestamp to ensure event fires even if value is same
  localStorage.setItem(STORAGE_KEY, Date.now().toString())
}

export function subscribeAuthChange(handler: () => void) {
  if (typeof window === 'undefined') return () => {}

  // Handle events in current tab
  const eventHandler = () => handler()
  window.addEventListener(AUTH_EVENT, eventHandler)

  // Handle storage events from other tabs (cross-tab sync)
  const storageHandler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY && e.newValue !== e.oldValue) {
      handler()
    }
  }
  window.addEventListener('storage', storageHandler)

  return () => {
    window.removeEventListener(AUTH_EVENT, eventHandler)
    window.removeEventListener('storage', storageHandler)
  }
}
