import { registry } from '../../registry/registry.js';
import { writeFileSync } from 'node:fs';

type OpenApi = {
  openapi: '3.0.0';
  info: { title: string; version: string };
  paths: Record<string, any>;
  components: { schemas: Record<string, any> };
};

const toPathKey = (p: string) => p.replace(/:([A-Za-z0-9_]+)/g, '{$1}');

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const jsonResponse = (schema: any, description = 'OK') => ({
  description,
  content: {
    'application/json': { schema }
  }
});
const jsonRequestBody = (schema: any) => ({
  required: true,
  content: {
    'application/json': { schema }
  }
});
const multipartRequestBody = (schema: any) => ({
  required: true,
  content: {
    'multipart/form-data': { schema }
  }
});

const schemas = {
  Id: { type: 'string', pattern: '^\\d+$' },
  OkResponse: {
    type: 'object',
    properties: { ok: { type: 'boolean' } },
    required: ['ok']
  },
  ErrorResponse: {
    type: 'object',
    properties: { error: { type: 'string' } },
    required: ['error']
  },
  MetaResponse: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      version: { type: 'string' }
    },
    required: ['name', 'version']
  },
  AuthSignupBody: {
    type: 'object',
    properties: { 
      email: { type: 'string' }, 
      password: { type: 'string' },
      rememberMe: { type: 'boolean' }
    },
    required: ['email', 'password']
  },
  AuthSignupResponse: {
    type: 'object',
    properties: {
      userId: ref('Id'),
      email: { type: 'string' }
    },
    required: ['userId', 'email']
  },
  AuthLoginBody: {
    type: 'object',
    properties: { 
      email: { type: 'string' }, 
      password: { type: 'string' },
      rememberMe: { type: 'boolean' }
    },
    required: ['email', 'password']
  },
  AuthLoginResponse: {
    type: 'object',
    properties: { userId: ref('Id') },
    required: ['userId']
  },
  AuthMeResponse: {
    type: 'object',
    properties: { 
      userId: ref('Id'),
      role: { type: 'string', enum: ['USER', 'ADMIN', 'SUPER_ADMIN'] }
    },
    required: ['userId', 'role']
  },
  Visibility: { type: 'string', enum: ['PUBLIC', 'PRIVATE'] },
  AccessStatus: { type: 'string', enum: ['NONE', 'PENDING', 'GRANTED', 'DENIED', 'REVOKED', 'CANCELED'] },
  MediaType: { type: 'string', enum: ['IMAGE', 'VIDEO', 'AUDIO', 'EMBED'] },
  MediaStatus: { type: 'string', enum: ['PENDING', 'READY', 'FAILED'] },
  Gender: { type: 'string', enum: ['UNSPECIFIED', 'MALE', 'FEMALE', 'NONBINARY', 'OTHER'] },
  DatingIntent: { type: 'string', enum: ['UNSPECIFIED', 'FRIENDS', 'CASUAL', 'LONG_TERM', 'MARRIAGE'] },
  MatchState: { type: 'string', enum: ['ACTIVE', 'BLOCKED', 'CLOSED'] },
  CompatibilityStatus: { type: 'string', enum: ['READY', 'INSUFFICIENT_DATA'] },
  SwipeAction: { type: 'string', enum: ['LIKE', 'DISLIKE', 'UNLIKE'] },
  ReportReason: { type: 'string', enum: ['SPAM', 'HARASSMENT', 'IMPERSONATION', 'NUDITY', 'HATE', 'OTHER'] },
  Media: {
    type: 'object',
    properties: {
      id: ref('Id'),
      type: ref('MediaType'),
      url: { type: 'string' },
      thumbUrl: { type: ['string', 'null'] },
      width: { type: ['number', 'null'] },
      height: { type: ['number', 'null'] },
      durationSec: { type: ['number', 'null'] }
    },
    required: ['id', 'type', 'url']
  },
  MediaUrls: {
    type: 'object',
    properties: {
      original: { type: 'string' },
      thumb: { type: ['string', 'null'] }
    },
    required: ['original']
  },
  MediaUploadResponse: {
    type: 'object',
    properties: {
      mediaId: ref('Id'),
      status: ref('MediaStatus'),
      mimeType: { type: 'string' },
      urls: ref('MediaUrls')
    },
    required: ['mediaId', 'status', 'mimeType', 'urls']
  },
  MediaResponse: {
    type: 'object',
    properties: {
      mediaId: ref('Id'),
      status: ref('MediaStatus'),
      mimeType: { type: ['string', 'null'] },
      sizeBytes: { type: ['number', 'null'] },
      width: { type: ['number', 'null'] },
      height: { type: ['number', 'null'] },
      durationSec: { type: ['number', 'null'] },
      urls: ref('MediaUrls')
    },
    required: ['mediaId', 'status', 'urls']
  },
  MediaUploadBody: {
    type: 'object',
    properties: {
      file: { type: 'string', format: 'binary' }
    },
    required: ['file']
  },
  PostMedia: {
    type: 'object',
    properties: {
      order: { type: 'number' },
      media: ref('Media')
    },
    required: ['order', 'media']
  },
  FeedPost: {
    type: 'object',
    properties: {
      id: ref('Id'),
      text: { type: ['string', 'null'] },
      createdAt: { type: 'string', format: 'date-time' },
      presentation: { anyOf: [ref('FeedPresentation'), { type: 'null' }] },
      user: {
        type: 'object',
        properties: {
          id: ref('Id'),
          profile: {
            type: ['object', 'null'],
            properties: { displayName: { type: ['string', 'null'] } }
          }
        },
        required: ['id']
      },
      media: { type: 'array', items: ref('PostMedia') }
    },
    required: ['id', 'createdAt', 'user', 'media']
  },
  FeedPresentation: {
    type: 'object',
    properties: {
        mode: { type: 'string', enum: ['single', 'mosaic', 'grid', 'question', 'highlight'] },
      accent: { type: ['string', 'null'], enum: ['match', 'boost', 'new', null] }
    },
    required: ['mode']
  },
  FeedSuggestion: {
    type: 'object',
    properties: {
      userId: ref('Id'),
      displayName: { type: ['string', 'null'] },
      bio: { type: ['string', 'null'] },
      locationText: { type: ['string', 'null'] },
      intent: { type: ['string', 'null'] },
      source: { type: ['string', 'null'], enum: ['match', 'suggested', null] },
      compatibility: { anyOf: [ref('CompatibilitySummary'), { type: 'null' }] },
      presentation: { anyOf: [ref('FeedPresentation'), { type: 'null' }] }
    },
    required: ['userId']
  },
  FeedQuestionOption: {
    type: 'object',
    properties: {
      id: ref('Id'),
      label: { type: 'string' },
      value: { type: 'string' }
    },
    required: ['id', 'label', 'value']
  },
  FeedQuestion: {
    type: 'object',
    properties: {
      id: ref('Id'),
      quizId: ref('Id'),
      quizTitle: { type: ['string', 'null'] },
      prompt: { type: 'string' },
      options: { type: 'array', items: ref('FeedQuestionOption') },
      presentation: { anyOf: [ref('FeedPresentation'), { type: 'null' }] }
    },
    required: ['id', 'quizId', 'prompt', 'options']
  },
  SuggestionProfile: {
    type: ['object', 'null'],
    properties: {
      displayName: { type: ['string', 'null'] },
      locationText: { type: ['string', 'null'] },
      intent: { type: ['string', 'null'] },
      avatarUrl: { type: ['string', 'null'] }
    }
  },
  SuggestionItem: {
    type: 'object',
    properties: {
      userId: ref('Id'),
      profile: ref('SuggestionProfile'),
      score: { type: 'number' },
      reasons: { type: ['object', 'null'], additionalProperties: true },
      compatibility: { anyOf: [ref('CompatibilitySummary'), { type: 'null' }] }
    },
    required: ['userId', 'score', 'compatibility']
  },
  SuggestionResponse: {
    type: 'object',
    properties: {
      suggestions: { type: 'array', items: ref('SuggestionItem') },
      nextCursorId: { anyOf: [ref('Id'), { type: 'null' }] }
    },
    required: ['suggestions', 'nextCursorId']
  },
  FeedItemLeaf: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['post', 'suggestion', 'question'] },
      post: { anyOf: [ref('FeedPost'), { type: 'null' }] },
      suggestion: { anyOf: [ref('FeedSuggestion'), { type: 'null' }] },
      question: { anyOf: [ref('FeedQuestion'), { type: 'null' }] }
    },
    required: ['type']
  },
  FeedCardType: { type: 'string', enum: ['single', 'grid'] },
  FeedCard: {
    type: 'object',
    properties: {
      cardType: ref('FeedCardType'),
      presentation: { anyOf: [ref('FeedPresentation'), { type: 'null' }] },
      items: { type: 'array', items: ref('FeedItemLeaf') }
    },
    required: ['cardType', 'items']
  },
  FeedDebug: {
    type: 'object',
    properties: {
      seed: { type: ['number', 'null'] },
      candidates: {
        type: 'object',
        properties: {
          postIds: { type: 'array', items: ref('Id') },
          suggestionUserIds: { type: 'array', items: ref('Id') },
          questionIds: { type: 'array', items: ref('Id') },
          counts: {
            type: 'object',
            properties: {
              posts: { type: 'number' },
              suggestions: { type: 'number' },
              questions: { type: 'number' }
            },
            required: ['posts', 'suggestions']
          }
        },
        required: ['postIds', 'suggestionUserIds', 'counts']
      },
      dedupe: {
        type: 'object',
        properties: {
          postDuplicates: { type: 'number' },
          suggestionDuplicates: { type: 'number' },
          questionDuplicates: { type: 'number' },
          crossSourceRemoved: { type: 'number' }
        },
        required: ['postDuplicates', 'suggestionDuplicates', 'crossSourceRemoved']
      },
      seen: {
        type: 'object',
        properties: {
          windowHours: { type: 'number' },
          demotedPosts: { type: 'number' },
          demotedSuggestions: { type: 'number' }
        },
        required: ['windowHours', 'demotedPosts', 'demotedSuggestions']
      },
      ranking: {
        type: ['object', 'null'],
        properties: {
          sourceSequence: { type: 'array', items: { type: 'string' } },
          actorCounts: { type: 'object', additionalProperties: { type: 'number' } }
        }
      }
    },
    required: ['seed', 'candidates', 'dedupe', 'seen']
  },
  FeedResponse: {
    type: 'object',
    properties: {
      items: { type: 'array', items: ref('FeedCard') },
      nextCursorId: { anyOf: [ref('Id'), { type: 'null' }] },
      hasMorePosts: { type: 'boolean' },
      debug: { anyOf: [ref('FeedDebug'), { type: 'null' }] }
    },
    required: ['items', 'nextCursorId', 'hasMorePosts']
  },
  PostCreateBody: {
    type: 'object',
    properties: {
      text: { type: ['string', 'null'] },
      visibility: ref('Visibility'),
      mediaIds: { type: 'array', items: ref('Id') },
      embedUrls: { type: 'array', items: { type: 'string' } },
      targetUserId: ref('Id')
    }
  },
  PostCreateResponse: {
    type: 'object',
    properties: {
      id: ref('Id'),
      createdAt: { type: 'string', format: 'date-time' }
    },
    required: ['id', 'createdAt']
  },
  PostPatchBody: {
    type: 'object',
    properties: {
      text: { type: ['string', 'null'] },
      visibility: ref('Visibility')
    }
  },
  PostPatchResponse: {
    type: 'object',
    properties: {
      id: ref('Id'),
      text: { type: ['string', 'null'] },
      visibility: ref('Visibility'),
      updatedAt: { type: 'string', format: 'date-time' }
    },
    required: ['id', 'visibility', 'updatedAt']
  },
  ProfileTop5Item: {
    type: 'object',
    properties: {
      order: { type: 'number' },
      text: { type: 'string' }
    },
    required: ['order', 'text']
  },
  ProfileTop5List: {
    type: 'object',
    properties: {
      id: ref('Id'),
      title: { type: 'string' },
      updatedAt: { type: 'string', format: 'date-time' },
      items: { type: 'array', items: ref('ProfileTop5Item') }
    },
    required: ['id', 'title', 'updatedAt', 'items']
  },
  Profile: {
    type: 'object',
    properties: {
      userId: ref('Id'),
      displayName: { type: ['string', 'null'] },
      bio: { type: ['string', 'null'] },
      birthdate: { type: ['string', 'null'], format: 'date-time' },
      locationText: { type: ['string', 'null'] },
      gender: { type: ['string', 'null'] },
      intent: { type: ['string', 'null'] },
      avatarUrl: { type: ['string', 'null'] },
      heroUrl: { type: ['string', 'null'] },
      isVisible: { type: 'boolean' },
      top5Lists: { type: 'array', items: ref('ProfileTop5List') }
    },
    required: ['userId', 'isVisible', 'top5Lists']
  },
  ProfilePost: {
    type: 'object',
    properties: {
      id: ref('Id'),
      visibility: ref('Visibility'),
      text: { type: ['string', 'null'] },
      createdAt: { type: 'string', format: 'date-time' },
      media: { type: 'array', items: ref('PostMedia') }
    },
    required: ['id', 'visibility', 'createdAt', 'media']
  },
  ProfileAccessInfo: {
    type: 'object',
    properties: {
      status: ref('AccessStatus'),
      requestId: { anyOf: [ref('Id'), { type: 'null' }] },
      hasPrivatePosts: { type: 'boolean' },
      hasPrivateMedia: { type: 'boolean' }
    },
    required: ['status', 'hasPrivatePosts', 'hasPrivateMedia']
  },
  ProfileRatingAvg: {
    type: 'object',
    properties: {
      attractive: { type: ['number', 'null'] },
      smart: { type: ['number', 'null'] },
      funny: { type: ['number', 'null'] },
      interesting: { type: ['number', 'null'] }
    }
  },
  ProfileRatingMine: {
    type: 'object',
    properties: {
      attractive: { type: 'number' },
      smart: { type: 'number' },
      funny: { type: 'number' },
      interesting: { type: 'number' },
      createdAt: { type: 'string', format: 'date-time' }
    },
    required: ['attractive', 'smart', 'funny', 'interesting', 'createdAt']
  },
  ProfileRatings: {
    type: 'object',
    properties: {
      count: { type: 'number' },
      avg: ref('ProfileRatingAvg'),
      mine: { anyOf: [ref('ProfileRatingMine'), { type: 'null' }] }
    },
    required: ['count', 'avg', 'mine']
  },
  CompatibilitySummary: {
    type: 'object',
    properties: {
      score: { type: ['number', 'null'] },
      status: ref('CompatibilityStatus')
    },
    required: ['score', 'status']
  },
  ProfileResponse: {
    type: 'object',
    properties: {
      profile: { anyOf: [ref('Profile'), { type: 'null' }] },
      posts: { type: 'array', items: ref('ProfilePost') },
      access: { anyOf: [ref('ProfileAccessInfo'), { type: 'null' }] },
      ratings: ref('ProfileRatings'),
      compatibility: { anyOf: [ref('CompatibilitySummary'), { type: 'null' }] }
    },
    required: ['profile', 'posts', 'access', 'ratings', 'compatibility']
  },
  ProfileAccessGrantBody: {
    type: 'object',
    properties: {
      viewerUserId: ref('Id')
    },
    required: ['viewerUserId']
  },
  ProfileAccessResponse: {
    type: 'object',
    properties: {
      status: ref('AccessStatus'),
      requestId: { anyOf: [ref('Id'), { type: 'null' }] }
    },
    required: ['status', 'requestId']
  },
  FollowerItem: {
    type: 'object',
    properties: {
      requestId: ref('Id'),
      userId: ref('Id'),
      name: { type: 'string' },
      avatarUrl: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      status: ref('AccessStatus'),
      requestedAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
      compatibility: { anyOf: [ref('CompatibilitySummary'), { type: 'null' }] }
    },
    required: ['requestId', 'userId', 'name', 'avatarUrl', 'status', 'requestedAt', 'updatedAt', 'compatibility']
  },
  FollowersResponse: {
    type: 'object',
    properties: {
      followers: { type: 'array', items: ref('FollowerItem') }
    },
    required: ['followers']
  },
  FollowingResponse: {
    type: 'object',
    properties: {
      following: { type: 'array', items: ref('FollowerItem') }
    },
    required: ['following']
  },
  ProfilePatchBody: {
    type: 'object',
    properties: {
      displayName: { type: ['string', 'null'] },
      bio: { type: ['string', 'null'] },
      birthdate: { type: ['string', 'null'], format: 'date-time' },
      locationText: { type: ['string', 'null'] },
      lat: { type: ['number', 'null'] },
      lng: { type: ['number', 'null'] },
      gender: ref('Gender'),
      intent: ref('DatingIntent'),
      isVisible: { type: ['boolean', 'null'] },
      avatarMediaId: { anyOf: [ref('Id'), { type: 'null' }] },
      heroMediaId: { anyOf: [ref('Id'), { type: 'null' }] }
    }
  },
  ProfilePatchResponse: {
    type: 'object',
    properties: {
      userId: ref('Id'),
      updatedAt: { type: 'string', format: 'date-time' }
    },
    required: ['userId', 'updatedAt']
  },
  RateBody: {
    type: 'object',
    properties: {
      attractive: { type: 'number' },
      smart: { type: 'number' },
      funny: { type: 'number' },
      interesting: { type: 'number' }
    },
    required: ['attractive', 'smart', 'funny', 'interesting']
  },
  SwipeBody: {
    type: 'object',
    properties: {
      toUserId: ref('Id'),
      action: ref('SwipeAction')
    },
    required: ['toUserId', 'action']
  },
  SwipeResponse: {
    type: 'object',
    properties: {
      ok: { type: 'boolean' },
      matched: { type: 'boolean' },
      matchId: { anyOf: [ref('Id'), { type: 'null' }] }
    },
    required: ['ok']
  },
  LikeProfile: {
    type: ['object', 'null'],
    properties: {
      displayName: { type: ['string', 'null'] },
      locationText: { type: ['string', 'null'] },
      intent: { type: ['string', 'null'] },
      avatarUrl: { type: ['string', 'null'] }
    }
  },
  LikeItem: {
    type: 'object',
    properties: {
      id: ref('Id'),
      userId: ref('Id'),
      likedAt: { type: 'string', format: 'date-time' },
      profile: ref('LikeProfile'),
      compatibility: { anyOf: [ref('CompatibilitySummary'), { type: 'null' }] }
    },
    required: ['id', 'userId', 'likedAt', 'profile', 'compatibility']
  },
  LikesResponse: {
    type: 'object',
    properties: {
      likes: { type: 'array', items: ref('LikeItem') }
    },
    required: ['likes']
  },
  MatchUserProfile: {
    type: 'object',
    properties: {
      displayName: { type: ['string', 'null'] },
      locationText: { type: ['string', 'null'] },
      intent: { type: ['string', 'null'] },
      avatarUrl: { type: ['string', 'null'] }
    }
  },
  MatchUser: {
    type: 'object',
    properties: {
      id: ref('Id'),
      profile: { anyOf: [ref('MatchUserProfile'), { type: 'null' }] },
      compatibility: { anyOf: [ref('CompatibilitySummary'), { type: 'null' }] }
    },
    required: ['id', 'compatibility']
  },
  MatchItem: {
    type: 'object',
    properties: {
      id: ref('Id'),
      userAId: ref('Id'),
      userBId: ref('Id'),
      updatedAt: { type: 'string', format: 'date-time' },
      conversation: { anyOf: [{ type: 'object', properties: { id: ref('Id') }, required: ['id'] }, { type: 'null' }] },
      userA: ref('MatchUser'),
      userB: ref('MatchUser')
    },
    required: ['id', 'userAId', 'userBId', 'updatedAt', 'userA', 'userB']
  },
  MatchListResponse: {
    type: 'object',
    properties: {
      matches: { type: 'array', items: ref('MatchItem') }
    },
    required: ['matches']
  },
  InboxUserProfile: {
    type: 'object',
    properties: {
      displayName: { type: ['string', 'null'] },
      avatarUrl: { type: ['string', 'null'] }
    }
  },
  InboxUser: {
    type: 'object',
    properties: {
      id: ref('Id'),
      profile: { anyOf: [ref('InboxUserProfile'), { type: 'null' }] },
      compatibility: { anyOf: [ref('CompatibilitySummary'), { type: 'null' }] }
    },
    required: ['id', 'compatibility']
  },
  FollowRequestRef: {
    type: 'object',
    properties: {
      id: ref('Id'),
      status: ref('AccessStatus')
    },
    required: ['id', 'status']
  },
  InboxMessage: {
    type: 'object',
    properties: {
      id: ref('Id'),
      body: { type: 'string' },
      createdAt: { type: 'string', format: 'date-time' },
      senderId: ref('Id'),
      isSystem: { type: 'boolean' },
      followRequest: { anyOf: [ref('FollowRequestRef'), { type: 'null' }] }
    },
    required: ['id', 'body', 'createdAt', 'senderId', 'isSystem']
  },
  InboxConversation: {
    type: 'object',
    properties: {
      id: ref('Id'),
      updatedAt: { type: 'string', format: 'date-time' },
      otherUser: ref('InboxUser'),
      lastMessage: { anyOf: [ref('InboxMessage'), { type: 'null' }] },
      unreadCount: { type: 'number' }
    },
    required: ['id', 'updatedAt', 'otherUser', 'lastMessage', 'unreadCount']
  },
  InboxResponse: {
    type: 'object',
    properties: {
      conversations: { type: 'array', items: ref('InboxConversation') },
      nextCursorId: { anyOf: [ref('Id'), { type: 'null' }] }
    },
    required: ['conversations', 'nextCursorId']
  },
  MessageItem: {
    type: 'object',
    properties: {
      id: ref('Id'),
      body: { type: 'string' },
      senderId: ref('Id'),
      createdAt: { type: 'string', format: 'date-time' },
      isSystem: { type: 'boolean' },
      followRequest: { anyOf: [ref('FollowRequestRef'), { type: 'null' }] }
    },
    required: ['id', 'body', 'senderId', 'createdAt', 'isSystem']
  },
  MessageListResponse: {
    type: 'object',
    properties: {
      conversationId: ref('Id'),
      messages: { type: 'array', items: ref('MessageItem') },
      nextCursorId: { anyOf: [ref('Id'), { type: 'null' }] }
    },
    required: ['conversationId', 'messages', 'nextCursorId']
  },
  MessageSendBody: {
    type: 'object',
    properties: { body: { type: 'string' } },
    required: ['body']
  },
  MessageSendResponse: {
    type: 'object',
    properties: {
      id: ref('Id'),
      createdAt: { type: 'string', format: 'date-time' }
    },
    required: ['id', 'createdAt']
  },
  QuizOption: {
    type: 'object',
    properties: {
      id: ref('Id'),
      label: { type: 'string' },
      value: { type: 'string' },
      order: { type: 'number' }
    },
    required: ['id', 'label', 'value', 'order']
  },
  QuizQuestion: {
    type: 'object',
    properties: {
      id: ref('Id'),
      prompt: { type: 'string' },
      order: { type: 'number' },
      options: { type: 'array', items: ref('QuizOption') }
    },
    required: ['id', 'prompt', 'order', 'options']
  },
  Quiz: {
    type: 'object',
    properties: {
      id: ref('Id'),
      slug: { type: 'string' },
      title: { type: 'string' },
      questions: { type: 'array', items: ref('QuizQuestion') }
    },
    required: ['id', 'slug', 'title', 'questions']
  },
  QuizResponse: {
    type: 'object',
    properties: {
      quiz: { anyOf: [ref('Quiz'), { type: 'null' }] }
    },
    required: ['quiz']
  },
  QuizSubmitBody: {
    type: 'object',
    properties: {
      answers: { type: 'object', additionalProperties: true },
      scoreVec: { type: ['object', 'null'], additionalProperties: true }
    },
    required: ['answers']
  },
  QuizUpdateBody: {
    type: 'object',
    properties: {
      title: { type: 'string' }
    },
    required: ['title']
  },
  QuizUpdateResponse: {
    type: 'object',
    properties: {
      id: ref('Id'),
      title: { type: 'string' },
      updatedAt: { type: 'string', format: 'date-time' }
    },
    required: ['id', 'title', 'updatedAt']
  },
  QuizQuestionPatchBody: {
    type: 'object',
    properties: {
      prompt: { type: 'string' }
    },
    required: ['prompt']
  },
  QuizQuestionPatchResponse: {
    type: 'object',
    properties: {
      id: ref('Id'),
      prompt: { type: 'string' }
    },
    required: ['id', 'prompt']
  },
  QuizOptionPatchBody: {
    type: 'object',
    properties: {
      label: { type: 'string' }
    },
    required: ['label']
  },
  QuizOptionPatchResponse: {
    type: 'object',
    properties: {
      id: ref('Id'),
      label: { type: 'string' },
      value: { type: 'string' }
    },
    required: ['id', 'label', 'value']
  },
  ReportBody: {
    type: 'object',
    properties: {
      reason: ref('ReportReason'),
      details: { type: ['string', 'null'] }
    },
    required: ['reason']
  }
};

const routeSchemas: Record<string, { requestBody?: any; responses?: any; parameters?: any[] }> = {
  'system.GET./meta': {
    responses: { '200': jsonResponse(ref('MetaResponse')) }
  },
  'auth.POST./auth/signup': {
    requestBody: jsonRequestBody(ref('AuthSignupBody')),
    responses: { '200': jsonResponse(ref('AuthSignupResponse')) }
  },
  'auth.POST./auth/login': {
    requestBody: jsonRequestBody(ref('AuthLoginBody')),
    responses: { '200': jsonResponse(ref('AuthLoginResponse')) }
  },
  'auth.POST./auth/refresh': {
    responses: { '200': jsonResponse(ref('OkResponse')) }
  },
  'auth.POST./auth/logout': {
    responses: { '200': jsonResponse(ref('OkResponse')) }
  },
  'auth.GET./auth/me': {
    responses: { '200': jsonResponse(ref('AuthMeResponse')) }
  },
  'feed.GET./feed': {
    parameters: [
      { name: 'cursorId', in: 'query', required: false, schema: ref('Id') },
      { name: 'take', in: 'query', required: false, schema: { type: 'number' } },
      { name: 'debug', in: 'query', required: false, schema: { type: 'boolean' } },
      { name: 'seed', in: 'query', required: false, schema: { type: 'number' } },
      { name: 'markSeen', in: 'query', required: false, schema: { type: 'boolean' } }
    ],
    responses: { '200': jsonResponse(ref('FeedResponse')) }
  },
  'feed.POST./posts': {
    requestBody: jsonRequestBody(ref('PostCreateBody')),
    responses: { '201': jsonResponse(ref('PostCreateResponse')) }
  },
  'feed.PATCH./posts/:postId': {
    requestBody: jsonRequestBody(ref('PostPatchBody')),
    responses: { '200': jsonResponse(ref('PostPatchResponse')) }
  },
  'feed.POST./posts/:postId/save': {
    responses: { '200': jsonResponse(ref('OkResponse')) }
  },
  'profiles.GET./profiles/:userId': {
    responses: { '200': jsonResponse(ref('ProfileResponse')) }
  },
  'profiles.POST./profiles/:userId/access-requests': {
    responses: { '200': jsonResponse(ref('ProfileAccessResponse')) }
  },
  'profiles.POST./profiles/:userId/access-grants': {
    requestBody: jsonRequestBody(ref('ProfileAccessGrantBody')),
    responses: { '200': jsonResponse(ref('ProfileAccessResponse')) }
  },
  'profiles.GET./profiles/:userId/followers': {
    responses: { '200': jsonResponse(ref('FollowersResponse')) }
  },
  'profiles.GET./profiles/:userId/following': {
    responses: { '200': jsonResponse(ref('FollowingResponse')) }
  },
  'profiles.POST./profiles/access-requests/:requestId/approve': {
    responses: { '200': jsonResponse(ref('ProfileAccessResponse')) }
  },
  'profiles.POST./profiles/access-requests/:requestId/deny': {
    responses: { '200': jsonResponse(ref('ProfileAccessResponse')) }
  },
  'profiles.POST./profiles/access-requests/:requestId/cancel': {
    responses: { '200': jsonResponse(ref('ProfileAccessResponse')) }
  },
  'profiles.POST./profiles/access-requests/:requestId/revoke': {
    responses: { '200': jsonResponse(ref('ProfileAccessResponse')) }
  },
  'profiles.PATCH./profiles/:userId': {
    requestBody: jsonRequestBody(ref('ProfilePatchBody')),
    responses: { '200': jsonResponse(ref('ProfilePatchResponse')) }
  },
  'profiles.POST./profiles/:userId/rate': {
    requestBody: jsonRequestBody(ref('RateBody')),
    responses: { '200': jsonResponse(ref('OkResponse')) }
  },
  'matches.POST./likes': {
    requestBody: jsonRequestBody(ref('SwipeBody')),
    responses: { '200': jsonResponse(ref('SwipeResponse')) }
  },
  'matches.GET./likes': {
    responses: { '200': jsonResponse(ref('LikesResponse')) }
  },
  'matches.GET./matches': {
    responses: { '200': jsonResponse(ref('MatchListResponse')) }
  },
    'matches.GET./suggestions': {
      parameters: [
        { name: 'cursorId', in: 'query', required: false, schema: ref('Id') },
        { name: 'take', in: 'query', required: false, schema: { type: 'number' } },
        {
          name: 'type',
          in: 'query',
          required: false,
          schema: {
            type: 'string',
            enum: [
              'overall',
              'ratings',
              'ratings.attractive',
              'ratings.smart',
              'ratings.funny',
              'ratings.interesting',
              'ratings.fit',
              'interests',
              'nearby',
              'new'
            ]
          }
        }
      ],
      responses: { '200': jsonResponse(ref('SuggestionResponse')) }
    },
  'messaging.GET./inbox': {
    parameters: [
      { name: 'cursorId', in: 'query', required: false, schema: ref('Id') },
      { name: 'take', in: 'query', required: false, schema: { type: 'number' } }
    ],
    responses: { '200': jsonResponse(ref('InboxResponse')) }
  },
  'messaging.GET./conversations/:conversationId': {
    parameters: [
      { name: 'cursorId', in: 'query', required: false, schema: ref('Id') },
      { name: 'take', in: 'query', required: false, schema: { type: 'number' } }
    ],
    responses: { '200': jsonResponse(ref('MessageListResponse')) }
  },
  'messaging.POST./conversations/:conversationId/messages': {
    requestBody: jsonRequestBody(ref('MessageSendBody')),
    responses: { '201': jsonResponse(ref('MessageSendResponse')) }
  },
  'messaging.POST./messages/:messageId/read': {
    responses: { '200': jsonResponse(ref('OkResponse')) }
  },
  'messaging.POST./conversations/:conversationId/delete': {
    responses: { '200': jsonResponse(ref('OkResponse')) }
  },
  'quizzes.GET./quizzes/active': {
    responses: { '200': jsonResponse(ref('QuizResponse')) }
  },
  'quizzes.POST./quizzes/:quizId/submit': {
    requestBody: jsonRequestBody(ref('QuizSubmitBody')),
    responses: { '200': jsonResponse(ref('OkResponse')) }
  },
  'quizzes.PATCH./quizzes/:quizId': {
    requestBody: jsonRequestBody(ref('QuizUpdateBody')),
    responses: { '200': jsonResponse(ref('QuizUpdateResponse')) }
  },
  'quizzes.PATCH./quizzes/:quizId/questions/:questionId': {
    requestBody: jsonRequestBody(ref('QuizQuestionPatchBody')),
    responses: { '200': jsonResponse(ref('QuizQuestionPatchResponse')) }
  },
  'quizzes.PATCH./quizzes/:quizId/questions/:questionId/options/:optionId': {
    requestBody: jsonRequestBody(ref('QuizOptionPatchBody')),
    responses: { '200': jsonResponse(ref('QuizOptionPatchResponse')) }
  },
  'safety.POST./users/:userId/block': {
    responses: { '200': jsonResponse(ref('OkResponse')) }
  },
  'safety.POST./users/:userId/report': {
    requestBody: jsonRequestBody(ref('ReportBody')),
    responses: { '200': jsonResponse(ref('OkResponse')) }
  },
  'media.POST./media/upload': {
    requestBody: multipartRequestBody(ref('MediaUploadBody')),
    responses: { '201': jsonResponse(ref('MediaUploadResponse')) }
  },
  'media.GET./media/:mediaId': {
    responses: { '200': jsonResponse(ref('MediaResponse')) }
  }
};

function pathParams(path: string) {
  const params = path.match(/:([A-Za-z0-9_]+)/g) ?? [];
  return params.map((p) => p.slice(1));
}

const spec: OpenApi = {
  openapi: '3.0.0',
  info: { title: 'internet-date API', version: '0.0.1' },
  paths: {},
  components: { schemas }
};

for (const d of registry) {
  for (const r of d.routes) {
    const k = toPathKey('/api' + r.path);
    spec.paths[k] ??= {};
    const op: Record<string, any> = {
      tags: r.tags ?? [d.domain],
      summary: r.summary ?? '',
      security: r.auth.kind === 'public' ? [] : [{ session: [] }]
    };

    const schema = routeSchemas[r.id];
    const params = pathParams(r.path).map((name) => ({
      name,
      in: 'path',
      required: true,
      schema: ref('Id')
    }));
    const extraParams = schema?.parameters ?? [];
    if (params.length || extraParams.length) {
      op.parameters = [...params, ...extraParams];
    }

    if (schema?.requestBody) op.requestBody = schema.requestBody;
    if (schema?.responses) op.responses = schema.responses;
    spec.paths[k][r.method.toLowerCase()] = op;
  }
}

// Write to file if output path provided, otherwise stdout (for backwards compatibility)
const outputPath = process.argv[2];
if (outputPath) {
  writeFileSync(outputPath, JSON.stringify(spec, null, 2));
  process.exit(0);
} else {
  process.stdout.write(JSON.stringify(spec, null, 2));
}
