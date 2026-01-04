import type { ProfileWithMedia, PostForProfile } from './models.js';
import type { ProfileAccessSummary } from '../../../../services/access/profileAccessService.js';
import type { CompatibilitySummary } from '../../../../services/compatibility/compatibilityService.js';

// Service layer contracts - business logic boundaries

export type ProfileViewInput = {
  targetUserId: bigint;
  viewerId: bigint | null;
};

export type RatingData = {
  count: number;
  avg: {
    attractive: number | null;
    smart: number | null;
    funny: number | null;
    interesting: number | null;
  };
  mine: {
    attractive: number;
    smart: number;
    funny: number;
    interesting: number;
    createdAt: Date;
  } | null;
};

export type AccessData = {
  status: ProfileAccessSummary['status'];
  requestId: bigint | null;
  hasPrivatePosts: boolean;
  hasPrivateMedia: boolean;
};

export type ProfileViewResult = {
  profile: ProfileWithMedia;
  posts: PostForProfile[];
  ratings: RatingData;
  access: AccessData;
  compatibility: CompatibilitySummary | null;
};

export type AccessRequestInput = {
  ownerUserId: bigint;
  viewerUserId: bigint;
};

export type AccessRequestResult = {
  status: 'PENDING' | 'GRANTED';
  requestId: bigint;
};

export type AccessGrantInput = {
  ownerUserId: bigint;
  viewerUserId: bigint;
};

export type AccessGrantResult = {
  status: 'GRANTED';
  requestId: bigint;
};

export type AccessActionInput = {
  requestId: bigint;
  ownerUserId: bigint;
};

export type AccessActionResult = {
  status: 'GRANTED' | 'DENIED' | 'CANCELED' | 'REVOKED';
  requestId: bigint;
};
