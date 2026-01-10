import { API_BASE_URL } from '../config/env'
import { refreshToken } from './authRefresh'

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

export class HttpError extends Error {
  status: number
  body: unknown
  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.status = status
    this.body = body
  }
}

export async function http<T>(
  url: string,
  method: HttpMethod,
  opts?: { body?: unknown; signal?: AbortSignal; headers?: Record<string, string>; skipAuthRefresh?: boolean }
): Promise<T> {
  const body = opts?.body
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData

  try {
    const res = await fetch(url, {
      method,
      credentials: 'include',
      headers: isFormData
        ? { ...(opts?.headers ?? {}) }
        : { 'content-type': 'application/json', ...(opts?.headers ?? {}) },
      body: body == null ? undefined : isFormData ? body : JSON.stringify(body),
      signal: opts?.signal,
    })

    const data = await readResponseBody(res, url)

    if (res.status === 401 && shouldAttemptRefresh(url, opts?.skipAuthRefresh)) {
      const refreshed = await tryRefresh(opts?.signal, url)
      if (refreshed) {
        return await http<T>(url, method, { ...opts, skipAuthRefresh: true })
      }
    }

    if (!res.ok) {
      const msg = getErrorMessage(data) ?? res.statusText
      console.error('[DEBUG] http: Request failed', { url, status: res.status, message: msg, data })
      throw new HttpError(msg || 'Request failed', res.status, data)
    }
    
    // Guard against null responses
    if (data === null) {
      console.error('[DEBUG] http: Response is null but status is OK', { url, status: res.status })
      throw new HttpError('Response is null', res.status, null)
    }
    
    return data as T
  } catch (e) {
    if (e instanceof HttpError) {
      throw e
    }
    // Suppress AbortError logs - these are expected when requests are cancelled
    const isAbortError = e instanceof DOMException && e.name === 'AbortError'
    if (!isAbortError) {
      console.error('[DEBUG] http: Network/fetch error', { url, error: e })
    }
    throw e
  }
}

async function readResponseBody(res: Response, url: string): Promise<unknown> {
  const isJson = (res.headers.get('content-type') || '').includes('application/json')
  return isJson
    ? await res.json().catch((e) => {
        console.error('[DEBUG] http: JSON parse error', { url, error: e })
        return null
      })
    : await res.text().catch((e) => {
        console.error('[DEBUG] http: Text parse error', { url, error: e })
        return null
      })
}

function shouldAttemptRefresh(url: string, skipAuthRefresh?: boolean): boolean {
  if (skipAuthRefresh) return false
  const parsed = new URL(url, resolveBaseUrl(url))
  return !parsed.pathname.startsWith('/api/auth/')
}

async function tryRefresh(signal: AbortSignal | undefined, url: string): Promise<boolean> {
  try {
    await refreshToken(s => refreshSession(s, url), signal)
    return true
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw err
    }
    return false
  }
}

async function refreshSession(signal: AbortSignal | undefined, requestUrl: string): Promise<void> {
  const refreshUrl = new URL('/api/auth/refresh', resolveBaseUrl(requestUrl)).toString()
  const res = await fetch(refreshUrl, {
    method: 'POST',
    credentials: 'include',
    signal,
  })

  if (!res.ok) {
    const data = await readResponseBody(res, refreshUrl)
    const msg = getErrorMessage(data) ?? res.statusText
    throw new HttpError(msg || 'Refresh failed', res.status, data)
  }
}

function resolveBaseUrl(requestUrl?: string): string {
  const fallbackOrigin = typeof window !== 'undefined'
    ? window.location.origin
    : new URL(requestUrl ?? 'http://localhost', 'http://localhost').origin
  return API_BASE_URL ? new URL(API_BASE_URL, fallbackOrigin).toString() : fallbackOrigin
}

function getErrorMessage(payload: unknown): string | null {
  if (typeof payload === 'string') return payload
  if (!payload || typeof payload !== 'object') return null

  if ('error' in payload) {
    const errorValue = (payload as { error?: unknown }).error
    if (typeof errorValue === 'string') return errorValue
    if (errorValue != null) return String(errorValue)
  }

  if ('message' in payload) {
    const messageValue = (payload as { message?: unknown }).message
    if (typeof messageValue === 'string') return messageValue
  }

  return null
}
