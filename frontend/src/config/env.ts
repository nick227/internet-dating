type ImportMetaEnv = {
  VITE_API_BASE_URL?: string
}

const env = (import.meta as ImportMeta & { env?: ImportMetaEnv }).env

// API_PATHS already include /api prefix, so:
// - In production (same domain): use empty string or relative path
// - In development: use full URL like http://localhost:4000
// If VITE_API_BASE_URL is set to '/api', it will create double /api/api/ paths
// So we normalize: if it's '/api', use empty string instead
const rawBaseUrl = env?.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://localhost:4000' : '')
export const API_BASE_URL = rawBaseUrl === '/api' ? '' : rawBaseUrl
