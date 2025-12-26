type ImportMetaEnv = {
  VITE_API_BASE_URL?: string
}

const env = (import.meta as ImportMeta & { env?: ImportMetaEnv }).env

export const API_BASE_URL = env?.VITE_API_BASE_URL ?? 'http://localhost:4000'
