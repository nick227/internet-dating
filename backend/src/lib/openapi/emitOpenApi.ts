import { registry } from '../../registry/registry.js';

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
    properties: { email: { type: 'string' }, password: { type: 'string' } },
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
    properties: { email: { type: 'string' }, password: { type: 'string' } },
    required: ['email', 'password']
  },
  AuthLoginResponse: {
    type: 'object',
    properties: { userId: ref('Id') },
    required: ['userId']
  },
  AuthMeResponse: {
    type: 'object',
    properties: { userId: ref('Id') },
    required: ['userId']
  },
  Visibility: { type: 'string', enum: ['PUBLIC', 'PRIVATE'] },
  MediaType: { type: 'string', enum: ['IMAGE', 'VIDEO'] },
  MediaStatus: { type: 'string', enum: ['PENDING', 'READY', 'FAILED'] },
  Gender: { type: 'string', enum: ['UNSPECIFIED', 'MALE', 'FEMALE', 'NONBINARY', 'OTHER'] },
  DatingIntent: { type: 'string', enum: ['UNSPECIFIED', 'FRIENDS', 'CASUAL', 'LONG_TERM', 'MARRIAGE'] },
  MatchState: { type: 'string', enum: ['ACTIVE', 'BLOCKED', 'CLOSED'] },
  SwipeAction: { type: 'string', enum: ['LIKE', 'PASS'] },
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
  FeedSuggestion: {
    type: 'object',
    properties: {
      userId: ref('Id'),
      displayName: { type: ['string', 'null'] },
      bio: { type: ['string', 'null'] },
      locationText: { type: ['string', 'null'] },
      intent: { type: ['string', 'null'] }
    },
    required: ['userId']
  },
  FeedResponse: {
    type: 'object',
    properties: {
      posts: { type: 'array', items: ref('FeedPost') },
      suggestions: { type: 'array', items: ref('FeedSuggestion') },
      nextCursorId: { anyOf: [ref('Id'), { type: 'null' }] }
    },
    required: ['posts', 'suggestions', 'nextCursorId']
  },
  PostCreateBody: {
    type: 'object',
    properties: {
      text: { type: ['string', 'null'] },
      visibility: ref('Visibility'),
      mediaIds: { type: 'array', items: ref('Id') }
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
  ProfileResponse: {
    type: 'object',
    properties: {
      profile: { anyOf: [ref('Profile'), { type: 'null' }] },
      posts: { type: 'array', items: ref('ProfilePost') },
      ratings: ref('ProfileRatings')
    },
    required: ['profile', 'posts', 'ratings']
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
      profile: { anyOf: [ref('MatchUserProfile'), { type: 'null' }] }
    },
    required: ['id']
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
      profile: { anyOf: [ref('InboxUserProfile'), { type: 'null' }] }
    },
    required: ['id']
  },
  InboxMessage: {
    type: 'object',
    properties: {
      id: ref('Id'),
      body: { type: 'string' },
      createdAt: { type: 'string', format: 'date-time' },
      senderId: ref('Id')
    },
    required: ['id', 'body', 'createdAt', 'senderId']
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
      conversations: { type: 'array', items: ref('InboxConversation') }
    },
    required: ['conversations']
  },
  MessageItem: {
    type: 'object',
    properties: {
      id: ref('Id'),
      body: { type: 'string' },
      senderId: ref('Id'),
      createdAt: { type: 'string', format: 'date-time' }
    },
    required: ['id', 'body', 'senderId', 'createdAt']
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
      { name: 'take', in: 'query', required: false, schema: { type: 'number' } }
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
  'profiles.PATCH./profiles/:userId': {
    requestBody: jsonRequestBody(ref('ProfilePatchBody')),
    responses: { '200': jsonResponse(ref('ProfilePatchResponse')) }
  },
  'profiles.POST./profiles/:userId/rate': {
    requestBody: jsonRequestBody(ref('RateBody')),
    responses: { '200': jsonResponse(ref('OkResponse')) }
  },
  'matches.POST./swipes': {
    requestBody: jsonRequestBody(ref('SwipeBody')),
    responses: { '200': jsonResponse(ref('SwipeResponse')) }
  },
  'matches.GET./matches': {
    responses: { '200': jsonResponse(ref('MatchListResponse')) }
  },
  'messaging.GET./inbox': {
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

process.stdout.write(JSON.stringify(spec, null, 2));
