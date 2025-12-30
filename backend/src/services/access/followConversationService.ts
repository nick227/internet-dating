import { prisma } from '../../lib/prisma/client.js'

export async function getOrCreateFollowConversation(
  userAId: bigint,
  userBId: bigint
): Promise<bigint> {
  // Ensure consistent ordering: lower ID first
  const [userA, userB] = userAId < userBId ? [userAId, userBId] : [userBId, userAId]

  const existing = await prisma.conversation.findUnique({
    where: { userAId_userBId: { userAId: userA, userBId: userB } },
    select: { id: true }
  })

  if (existing) return existing.id

  const created = await prisma.conversation.create({
    data: {
      userAId: userA,
      userBId: userB,
      matchId: null
    },
    select: { id: true }
  })

  return created.id
}

export async function createFollowRequestMessage(
  conversationId: bigint,
  requesterUserId: bigint,
  ownerUserId: bigint
): Promise<void> {
  const requester = await prisma.user.findUnique({
    where: { id: requesterUserId },
    select: { profile: { select: { displayName: true } } }
  })

  const requesterName = requester?.profile?.displayName ?? 'Someone'
  const body = `${requesterName} wants to follow you`

  await prisma.message.create({
    data: {
      conversationId,
      senderId: requesterUserId,
      body,
      isSystem: true,
      receipts: {
        create: [
          { userId: ownerUserId, readAt: null },
          { userId: requesterUserId, readAt: new Date() }
        ]
      }
    }
  })

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() }
  })
}

export async function createFollowResponseMessage(
  conversationId: bigint,
  ownerUserId: bigint,
  requesterUserId: bigint,
  approved: boolean
): Promise<void> {
  const owner = await prisma.user.findUnique({
    where: { id: ownerUserId },
    select: { profile: { select: { displayName: true } } }
  })

  const ownerName = owner?.profile?.displayName ?? 'They'
  const body = approved
    ? `${ownerName} approved your follow request`
    : `${ownerName} declined your follow request`

  await prisma.message.create({
    data: {
      conversationId,
      senderId: ownerUserId,
      body,
      isSystem: true,
      receipts: {
        create: [
          { userId: requesterUserId, readAt: null },
          { userId: ownerUserId, readAt: new Date() }
        ]
      }
    }
  })

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() }
  })
}
