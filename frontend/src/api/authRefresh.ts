/**
 * Centralized refresh token queue/lock.
 *
 * Prevents concurrent refresh attempts when multiple requests
 * receive 401 errors simultaneously.
 *
 * This is infrastructure-level code, reusable by HTTP client
 * and session hooks.
 */

let refreshPromise: Promise<void> | null = null
let refreshController: AbortController | null = null

/**
 * Refresh the authentication token.
 * If a refresh is already in progress, returns the existing promise.
 *
 * @param refreshFn - Function to call for refresh (typically api.auth.refresh)
 * @param signal - Optional abort signal
 * @returns Promise that resolves when refresh completes
 */
export async function refreshToken(
  refreshFn: (signal?: AbortSignal) => Promise<unknown>,
  signal?: AbortSignal
): Promise<void> {
  // If refresh is already in progress, return existing promise
  if (refreshPromise) {
    return refreshPromise
  }

  // Create new refresh attempt
  const ctrl = new AbortController()
  refreshController = ctrl

  // Combine abort signals
  if (signal) {
    signal.addEventListener('abort', () => ctrl.abort())
  }

  refreshPromise = (async () => {
    try {
      await refreshFn(ctrl.signal)
    } finally {
      // Clear promise and controller when done
      refreshPromise = null
      refreshController = null
    }
  })()

  return refreshPromise
}

/**
 * Abort any in-progress refresh attempt.
 * Useful for cleanup or when logout occurs.
 */
export function abortRefresh(): void {
  if (refreshController) {
    refreshController.abort()
    refreshController = null
  }
  refreshPromise = null
}
