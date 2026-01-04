import { prisma } from '../../lib/prisma/client.js';

/**
 * Parse @mentions from comment body text and return array of mentioned userIds
 * 
 * V1: Store userIds only, client handles rendering
 * - Server extracts mentioned userIds from body text
 * - Client parses @mentions and matches against userIds for rendering
 * - No position/length storage needed
 * 
 * @param body - Comment body text
 * @param postAuthorId - Post author ID (to check for blocks)
 * @returns Array of unique userIds mentioned in the comment
 */
export async function parseMentions(body: string, postAuthorId: bigint): Promise<bigint[]> {
  if (!body || typeof body !== 'string') {
    return [];
  }

  // Find all @username patterns (alphanumeric, underscore, hyphen)
  const mentionPattern = /@([a-zA-Z0-9_-]+)/g;
  const matches = Array.from(body.matchAll(mentionPattern));
  
  if (matches.length === 0) {
    return [];
  }

  // Extract unique usernames (normalized to lowercase)
  const usernames = new Set<string>();
  for (const match of matches) {
    const username = match[1].toLowerCase().trim();
    if (username.length > 0) {
      usernames.add(username);
    }
  }

  if (usernames.size === 0) {
    return [];
  }

  // Lookup users by displayName (case-insensitive)
  // V1: Profile.displayName only (no email fallback)
  const profiles = await prisma.profile.findMany({
    where: {
      displayName: {
        not: null,
      },
      isVisible: true,
      deletedAt: null,
      user: {
        deletedAt: null,
      },
    },
    select: {
      userId: true,
      displayName: true,
    },
  });

  // Normalize displayNames and create lookup map
  const usernameToUserId = new Map<string, bigint>();
  for (const profile of profiles) {
    if (profile.displayName) {
      const normalized = profile.displayName.toLowerCase().trim();
      if (normalized.length > 0) {
        usernameToUserId.set(normalized, profile.userId);
      }
    }
  }

  // Match usernames to userIds
  const candidateUserIds = new Set<bigint>();
  for (const username of usernames) {
    const userId = usernameToUserId.get(username);
    if (userId && userId !== postAuthorId) {
      candidateUserIds.add(userId);
    }
  }

  if (candidateUserIds.size === 0) {
    return [];
  }

  // Batch check for blocks
  const blockedUserIds = new Set<bigint>();
  if (candidateUserIds.size > 0) {
    const blocks = await prisma.userBlock.findMany({
      where: {
        OR: [
          { blockerId: postAuthorId, blockedId: { in: Array.from(candidateUserIds) } },
          { blockerId: { in: Array.from(candidateUserIds) }, blockedId: postAuthorId },
        ],
      },
      select: {
        blockerId: true,
        blockedId: true,
      },
    });

    for (const block of blocks) {
      if (block.blockerId === postAuthorId) {
        blockedUserIds.add(block.blockedId);
      } else {
        blockedUserIds.add(block.blockerId);
      }
    }
  }

  // Filter out blocked users
  const userIds = Array.from(candidateUserIds).filter(userId => !blockedUserIds.has(userId));

  return Array.from(userIds);
}
