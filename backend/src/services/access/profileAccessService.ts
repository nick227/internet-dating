import { prisma } from '../../lib/prisma/client.js'

export type AccessStatus = 'NONE' | 'PENDING' | 'GRANTED' | 'DENIED' | 'REVOKED' | 'CANCELED'

export type ProfileAccessSummary = {
  status: AccessStatus
  requestId: bigint | null
}

export async function getProfileAccessSummary(
  ownerUserId: bigint,
  viewerUserId: bigint | null | undefined
): Promise<ProfileAccessSummary> {
  if (!viewerUserId) return { status: 'NONE', requestId: null }
  if (ownerUserId === viewerUserId) return { status: 'GRANTED', requestId: null }

  const record = await prisma.profileAccess.findUnique({
    where: { ownerUserId_viewerUserId: { ownerUserId, viewerUserId } },
    select: { id: true, status: true }
  })

  if (!record) return { status: 'NONE', requestId: null }
  return { status: record.status as AccessStatus, requestId: record.id }
}

export async function hasProfileAccess(
  ownerUserId: bigint,
  viewerUserId: bigint | null | undefined
): Promise<boolean> {
  if (!viewerUserId) return false
  if (ownerUserId === viewerUserId) return true
  const record = await prisma.profileAccess.findUnique({
    where: { ownerUserId_viewerUserId: { ownerUserId, viewerUserId } },
    select: { status: true }
  })
  return record?.status === 'GRANTED'
}
