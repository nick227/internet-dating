type StorageAdapter = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

const resolveStorage = (): Storage | null => {
  if (typeof window === 'undefined') return null
  return window.localStorage
}

export const safeLocalStorage: StorageAdapter = {
  getItem(key) {
    const storage = resolveStorage()
    if (!storage) return null
    try {
      return storage.getItem(key)
    } catch (error) {
      console.warn('[storage] Failed to read localStorage key:', key, error)
      return null
    }
  },
  setItem(key, value) {
    const storage = resolveStorage()
    if (!storage) return
    try {
      storage.setItem(key, value)
    } catch (error) {
      console.warn('[storage] Failed to write localStorage key:', key, error)
    }
  },
  removeItem(key) {
    const storage = resolveStorage()
    if (!storage) return
    try {
      storage.removeItem(key)
    } catch (error) {
      console.warn('[storage] Failed to remove localStorage key:', key, error)
    }
  },
}
