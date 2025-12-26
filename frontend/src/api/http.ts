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
  opts?: { body?: unknown; signal?: AbortSignal; headers?: Record<string, string> }
): Promise<T> {
  const body = opts?.body
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData

  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: isFormData ? { ...(opts?.headers ?? {}) } : { 'content-type': 'application/json', ...(opts?.headers ?? {}) },
    body: body == null ? undefined : (isFormData ? body : JSON.stringify(body)),
    signal: opts?.signal
  })

  const isJson = (res.headers.get('content-type') || '').includes('application/json')
  const data: unknown = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null)

  if (!res.ok) {
    const msg = getErrorMessage(data) ?? res.statusText
    throw new HttpError(msg || 'Request failed', res.status, data)
  }
  return data as T
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
