import type { Prisma } from '@prisma/client';

// Shared Prisma select objects - eliminates duplication
export const mediaSelectBase = {
  id: true,
  type: true,
  storageKey: true,
  variants: true,
  url: true,
  thumbUrl: true,
  width: true,
  height: true,
  durationSec: true,
} as const;

export const mediaSelectForAvatar = {
  id: true,
  type: true,
  url: true,
  thumbUrl: true,
} as const;

export const mediaSelectFull = {
  ...mediaSelectBase,
} as const;

export const profileSelectLite = {
  id: true,
  userId: true,
  displayName: true,
  bio: true,
  locationText: true,
  birthdate: true,
  gender: true,
  intent: true,
  isVisible: true,
} as const;

export const profileSelectWithMedia = {
  ...profileSelectLite,
  avatarMedia: { select: mediaSelectBase },
  heroMedia: { select: mediaSelectBase },
  top5Lists: {
    orderBy: { updatedAt: 'desc' },
    take: 10,
    select: { 
      id: true, 
      title: true, 
      updatedAt: true, 
      items: { 
        orderBy: { order: 'asc' }, 
        select: { order: true, text: true } 
      } 
    }
  }
} as const;

export const postSelectForProfile = {
  id: true,
  userId: true,
  visibility: true,
  text: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      profile: {
        select: {
          displayName: true,
          avatarMedia: { select: mediaSelectForAvatar }
        }
      }
    }
  },
  media: { 
    select: { 
      order: true, 
      media: { select: mediaSelectFull } 
    }, 
    orderBy: { order: 'asc' } 
  }
} as const;

export const ratingAggregateSelect = {
  _avg: { attractive: true, smart: true, funny: true, interesting: true },
  _count: { _all: true }
} as const;

// Type inference from selects
export type ProfileLite = Prisma.ProfileGetPayload<{ select: typeof profileSelectLite }>;
export type ProfileWithMedia = Prisma.ProfileGetPayload<{ select: typeof profileSelectWithMedia }>;
export type PostForProfile = Prisma.PostGetPayload<{ select: typeof postSelectForProfile }>;
export type MediaRecord = Prisma.MediaGetPayload<{ select: typeof mediaSelectBase }>;
export type MediaForAvatar = Prisma.MediaGetPayload<{ select: typeof mediaSelectForAvatar }>;
