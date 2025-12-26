import { api } from '../../api/client'
import { HttpError } from '../../api/http'
import { useAsync } from '../hooks/useAsync'

export function useSession() {
  return useAsync(async (signal) => {
    try {
      return await api.auth.me(signal)
    } catch (err) {
      if (err instanceof HttpError && err.status === 401) {
        await api.auth.refresh(signal)
        return await api.auth.me(signal)
      }
      throw err
    }
  }, [])
}
