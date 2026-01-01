import type { AccessStatus } from '../../api/types'

export const ACCESS_STATUS = {
  NONE: 'NONE' as const,
  PENDING: 'PENDING' as const,
  GRANTED: 'GRANTED' as const,
  DENIED: 'DENIED' as const,
  REVOKED: 'REVOKED' as const,
  CANCELED: 'CANCELED' as const,
} satisfies Record<string, AccessStatus>
