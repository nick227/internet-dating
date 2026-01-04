import type { CompatibilitySummary } from '../../../../services/compatibility/compatibilityService.js';

// API response shapes - serialized, BigInt → string, Date → ISO string

export type ProfileResponse = {
  profile: {
    userId: string;
    displayName: string | null;
    bio: string | null;
    birthdate: string | null;
    locationText: string | null;
    gender: string;
    intent: string;
    isVisible: boolean;
    avatarUrl: string | null;
    heroUrl: string | null;
    top5Lists?: Array<{
      id: string;
      title: string;
      updatedAt: string;
      items: Array<{ order: number; text: string }>;
    }>;
  };
  posts: Array<{
    id: string;
    userId: string;
    visibility: string;
    text: string | null;
    createdAt: string;
    author: {
      id: string;
      displayName: string | null;
      avatarUrl: string | null;
    };
    media: Array<{
      order: number;
      media: {
        id: string;
        type: string;
        url: string;
        thumbUrl: string | null;
        width: number | null;
        height: number | null;
        durationSec: number | null;
      };
    }>;
  }>;
  ratings: {
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
      createdAt: string;
    } | null;
  };
  access: {
    status: string;
    requestId: string | null;
    hasPrivatePosts: boolean;
    hasPrivateMedia: boolean;
  };
  compatibility: CompatibilitySummary | null;
};
