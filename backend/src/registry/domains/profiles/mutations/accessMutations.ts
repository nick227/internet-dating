import { prisma } from '../../../../lib/prisma/client.js';
import type { ProfileAccessStatus } from '@prisma/client';

export async function upsertAccessRequest(
  ownerUserId: bigint,
  viewerUserId: bigint,
  status: ProfileAccessStatus
): Promise<{ id: bigint; status: ProfileAccessStatus }> {
  return await prisma.profileAccess.upsert({
    where: { ownerUserId_viewerUserId: { ownerUserId, viewerUserId } },
    update: {
      status,
      statusUpdatedAt: new Date(),
      respondedAt: status === 'GRANTED' || status === 'DENIED' ? new Date() : null,
      source: 'PROFILE',
      decisionReason: null
    },
    create: {
      ownerUserId,
      viewerUserId,
      status,
      statusUpdatedAt: new Date(),
      respondedAt: status === 'GRANTED' || status === 'DENIED' ? new Date() : null,
      source: 'PROFILE'
    },
    select: { id: true, status: true }
  });
}

export async function updateAccessRequestStatus(
  requestId: bigint,
  status: ProfileAccessStatus
): Promise<{ id: bigint; status: ProfileAccessStatus }> {
  return await prisma.profileAccess.update({
    where: { id: requestId },
    data: {
      status,
      statusUpdatedAt: new Date(),
      respondedAt: status === 'GRANTED' || status === 'DENIED' ? new Date() : null
    },
    select: { id: true, status: true }
  });
}
