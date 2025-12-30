import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma/client.js';

function loadEnv() {
  if (process.env.DATABASE_URL) return;
  try {
    const raw = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, valueRaw] = match;
      if (process.env[key] != null) continue;
      let value = valueRaw.trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {}
}

loadEnv();

type SeedMedia = {
  key: string;
  type: 'IMAGE' | 'VIDEO';
  url: string;
  thumbUrl?: string;
  width?: number;
  height?: number;
  durationSec?: number;
};

type SeedPost = {
  key: string;
  text: string;
  mediaKeys: string[];
  createdAtOffsetDays?: number;
};

type SeedPreference = {
  preferredAgeMin?: number;
  preferredAgeMax?: number;
  preferredDistanceKm?: number;
  preferredGenders?: Array<SeedPersona['gender']>;
};

type SeedPersona = {
  key: string;
  email: string;
  password: string;
  displayName: string;
  bio: string;
  birthdate: string;
  locationText: string;
  lat?: number;
  lng?: number;
  gender: 'MALE' | 'FEMALE' | 'NONBINARY' | 'OTHER' | 'UNSPECIFIED';
  intent: 'FRIENDS' | 'CASUAL' | 'LONG_TERM' | 'MARRIAGE' | 'UNSPECIFIED';
  mediaKeys: string[];
  avatarKey?: string;
  heroKey?: string;
  posts: SeedPost[];
  interests?: string[];
  preferences?: SeedPreference;
  quizAnswers?: Record<string, string>;
};

type SeedLike = {
  from: string;
  to: string;
  action: 'LIKE' | 'DISLIKE';
};

type SeedConversation = {
  users: [string, string];
  messages: Array<{ sender: string; body: string; minutesAgo: number; isSystem?: boolean }>;
};

type SeedPostLike = {
  user: string;
  postKey: string;
  minutesAgo?: number;
};

type SeedFeedSeen = {
  viewer: string;
  itemType: 'POST' | 'SUGGESTION';
  itemKey: string;
  minutesAgo?: number;
};

type SeedSubject = {
  key: string;
  label: string;
  interests: Array<{ key: string; label: string }>;
};

type SeedQuiz = {
  slug: string;
  title: string;
  questions: Array<{
    key: string;
    prompt: string;
    options: Array<{ label: string; value: string }>;
  }>;
};

type SeedContext = {
  usersByKey: Map<string, { userId: bigint; profileId: bigint }>;
  mediaByUserKey: Map<string, Map<string, bigint>>;
  postsByKey: Map<string, bigint>;
  interestsByKey: Map<string, { subjectId: bigint; interestId: bigint }>;
  quiz?: {
    id: bigint;
    questions: Array<{ key: string; id: bigint; options: Array<{ value: string }> }>;
  };
};

const SEED_DATA_TYPES = [
  'users/profiles',
  'media (images + video)',
  'posts + post media',
  'likes + matches + conversations',
  'post likes',
  'interests + preferences',
  'quiz results',
  'ratings',
  'feed seen'
] as const;

const MEDIA_LIBRARY: SeedMedia[] = [
  {
    key: 'img-01',
    type: 'IMAGE',
    url: 'https://images.unsplash.com/photo-1524503033411-f7a2fe8c7f74?auto=format&fit=crop&w=1400&q=80',
    thumbUrl: 'https://images.unsplash.com/photo-1524503033411-f7a2fe8c7f74?auto=format&fit=crop&w=700&q=70'
  },
  {
    key: 'img-02',
    type: 'IMAGE',
    url: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=1400&q=80',
    thumbUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=700&q=70'
  },
  {
    key: 'img-03',
    type: 'IMAGE',
    url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=1400&q=80',
    thumbUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=700&q=70'
  },
  {
    key: 'img-04',
    type: 'IMAGE',
    url: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=1400&q=80',
    thumbUrl: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=700&q=70'
  },
  {
    key: 'img-05',
    type: 'IMAGE',
    url: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1400&q=80',
    thumbUrl: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=700&q=70'
  },
  {
    key: 'img-06',
    type: 'IMAGE',
    url: 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=1400&q=80',
    thumbUrl: 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=700&q=70'
  },
  {
    key: 'img-07',
    type: 'IMAGE',
    url: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1400&q=80',
    thumbUrl: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=700&q=70'
  },
  {
    key: 'img-08',
    type: 'IMAGE',
    url: 'https://images.unsplash.com/photo-1524502397800-2eeaad7c3fe5?auto=format&fit=crop&w=1400&q=80',
    thumbUrl: 'https://images.unsplash.com/photo-1524502397800-2eeaad7c3fe5?auto=format&fit=crop&w=700&q=70'
  },
  {
    key: 'img-09',
    type: 'IMAGE',
    url: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=1400&q=80',
    thumbUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=700&q=70'
  },
  {
    key: 'img-10',
    type: 'IMAGE',
    url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=1400&q=80',
    thumbUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=700&q=70'
  },
  {
    key: 'img-11',
    type: 'IMAGE',
    url: 'https://images.unsplash.com/photo-1524502397800-2eeaad7c3fe5?auto=format&fit=crop&w=1200&q=80',
    thumbUrl: 'https://images.unsplash.com/photo-1524502397800-2eeaad7c3fe5?auto=format&fit=crop&w=600&q=70'
  },
  {
    key: 'img-12',
    type: 'IMAGE',
    url: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=1200&q=80',
    thumbUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=600&q=70'
  },
  {
    key: 'vid-01',
    type: 'VIDEO',
    url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
    thumbUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerJoyrides.jpg',
    width: 1280,
    height: 720,
    durationSec: 15
  },
  {
    key: 'vid-02',
    type: 'VIDEO',
    url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    thumbUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg',
    width: 1280,
    height: 720,
    durationSec: 30
  }
];

const SUBJECTS: SeedSubject[] = [
  {
    key: 'music',
    label: 'Music',
    interests: [
      { key: 'indie', label: 'Indie' },
      { key: 'hiphop', label: 'Hip-hop' },
      { key: 'jazz', label: 'Jazz' },
      { key: 'rock', label: 'Rock' },
      { key: 'edm', label: 'EDM' }
    ]
  },
  {
    key: 'film',
    label: 'Film',
    interests: [
      { key: 'documentary', label: 'Documentary' },
      { key: 'thriller', label: 'Thriller' },
      { key: 'romance', label: 'Romance' },
      { key: 'comedy', label: 'Comedy' },
      { key: 'sci-fi', label: 'Sci-Fi' }
    ]
  },
  {
    key: 'sports',
    label: 'Sports',
    interests: [
      { key: 'soccer', label: 'Soccer' },
      { key: 'basketball', label: 'Basketball' },
      { key: 'tennis', label: 'Tennis' },
      { key: 'running', label: 'Running' },
      { key: 'climbing', label: 'Climbing' }
    ]
  },
  {
    key: 'food',
    label: 'Food',
    interests: [
      { key: 'sushi', label: 'Sushi' },
      { key: 'bbq', label: 'BBQ' },
      { key: 'baking', label: 'Baking' },
      { key: 'coffee', label: 'Coffee' },
      { key: 'tacos', label: 'Tacos' }
    ]
  },
  {
    key: 'travel',
    label: 'Travel',
    interests: [
      { key: 'roadtrips', label: 'Road Trips' },
      { key: 'beaches', label: 'Beaches' },
      { key: 'mountains', label: 'Mountains' },
      { key: 'cities', label: 'Cities' },
      { key: 'weekenders', label: 'Weekend Trips' }
    ]
  }
];

const QUIZ_SEED: SeedQuiz = {
  slug: 'feed-demo-core',
  title: 'Core Preferences',
  questions: [
    {
      key: 'q1',
      prompt: 'Ideal Friday night?',
      options: [
        { label: 'Cozy movie at home', value: 'cozy' },
        { label: 'Live music or comedy', value: 'live' },
        { label: 'Outdoor adventure', value: 'adventure' }
      ]
    },
    {
      key: 'q2',
      prompt: 'Pick a travel style',
      options: [
        { label: 'City weekends', value: 'city' },
        { label: 'Nature retreats', value: 'nature' },
        { label: 'Beach reset', value: 'beach' }
      ]
    },
    {
      key: 'q3',
      prompt: 'Pick a playlist',
      options: [
        { label: 'Indie discoveries', value: 'indie' },
        { label: 'Hip-hop classics', value: 'hiphop' },
        { label: 'Pop energy', value: 'pop' }
      ]
    },
    {
      key: 'q4',
      prompt: 'How social are you?',
      options: [
        { label: 'Low-key and selective', value: 'low' },
        { label: 'Balanced mix', value: 'balanced' },
        { label: 'Always up for plans', value: 'social' }
      ]
    },
    {
      key: 'q5',
      prompt: 'Weekend ritual?',
      options: [
        { label: 'Farmers market + brunch', value: 'brunch' },
        { label: 'Hike or workout', value: 'active' },
        { label: 'Museum or gallery', value: 'culture' }
      ]
    }
  ]
};

const LOCATION_COORDS: Record<string, { lat: number; lng: number }> = {
  'Austin, TX': { lat: 30.2672, lng: -97.7431 },
  'Brooklyn, NY': { lat: 40.6782, lng: -73.9442 },
  'Denver, CO': { lat: 39.7392, lng: -104.9903 },
  'Seattle, WA': { lat: 47.6062, lng: -122.3321 },
  'Chicago, IL': { lat: 41.8781, lng: -87.6298 },
  'Miami, FL': { lat: 25.7617, lng: -80.1918 },
  'Los Angeles, CA': { lat: 34.0522, lng: -118.2437 },
  'San Francisco, CA': { lat: 37.7749, lng: -122.4194 },
  'Portland, OR': { lat: 45.5152, lng: -122.6784 },
  'Boston, MA': { lat: 42.3601, lng: -71.0589 }
};

const PERSONAS: SeedPersona[] = [
  {
    key: 'nick',
    email: 'nick@gmail.com',
    password: 'Password123!',
    displayName: 'Nick',
    bio: 'Builder brain, design eye, and a soft spot for great coffee. Looking for someone curious and grounded.',
    birthdate: '1992-09-15',
    locationText: 'Los Angeles, CA',
    lat: LOCATION_COORDS['Los Angeles, CA'].lat,
    lng: LOCATION_COORDS['Los Angeles, CA'].lng,
    gender: 'MALE',
    intent: 'LONG_TERM',
    mediaKeys: ['img-09', 'img-03', 'vid-01', 'img-10'],
    avatarKey: 'img-09',
    heroKey: 'vid-01',
    posts: [
      {
        key: 'nick-post-1',
        text: 'Sunset rides, espresso runs, and a feed full of small wins. What is your go-to recharge ritual?',
        mediaKeys: ['vid-01'],
        createdAtOffsetDays: 1
      },
      {
        key: 'nick-post-2',
        text: 'Best dates are creative, low-key, and end with dessert.',
        mediaKeys: ['img-03', 'img-10'],
        createdAtOffsetDays: 6
      }
    ],
    interests: ['music:indie', 'food:coffee', 'travel:cities'],
    preferences: {
      preferredAgeMin: 24,
      preferredAgeMax: 34,
      preferredDistanceKm: 60,
      preferredGenders: ['FEMALE', 'NONBINARY']
    },
    quizAnswers: { q1: 'cozy', q2: 'city', q3: 'indie', q4: 'balanced', q5: 'culture' }
  },
  {
    key: 'aria',
    email: 'seed.aria@example.com',
    password: 'Password123!',
    displayName: 'Aria',
    bio: 'Night-market foodie, synthwave playlists, and sunrise hikes. Looking for someone who plans the next adventure.',
    birthdate: '1994-06-12',
    locationText: 'Austin, TX',
    lat: LOCATION_COORDS['Austin, TX'].lat,
    lng: LOCATION_COORDS['Austin, TX'].lng,
    gender: 'FEMALE',
    intent: 'LONG_TERM',
    mediaKeys: ['img-01', 'img-05', 'vid-02', 'img-11'],
    avatarKey: 'img-01',
    heroKey: 'img-05',
    posts: [
      {
        key: 'aria-post-1',
        text: 'Tell me your favorite local spot and I will bring the playlist.',
        mediaKeys: ['img-05', 'img-11'],
        createdAtOffsetDays: 2
      },
      {
        key: 'aria-post-2',
        text: 'Weekend energy: rooftop tacos, live sets, and chasing warm light.',
        mediaKeys: ['vid-02'],
        createdAtOffsetDays: 10
      }
    ],
    interests: ['music:edm', 'food:tacos', 'travel:weekenders'],
    preferences: {
      preferredAgeMin: 25,
      preferredAgeMax: 36,
      preferredDistanceKm: 80,
      preferredGenders: ['MALE', 'NONBINARY']
    },
    quizAnswers: { q1: 'live', q2: 'beach', q3: 'pop', q4: 'social', q5: 'brunch' }
  },
  {
    key: 'milo',
    email: 'seed.milo@example.com',
    password: 'Password123!',
    displayName: 'Milo',
    bio: 'Museum nerd, espresso snob, and amateur street photographer. I collect tiny stories from big cities.',
    birthdate: '1991-11-03',
    locationText: 'Brooklyn, NY',
    lat: LOCATION_COORDS['Brooklyn, NY'].lat,
    lng: LOCATION_COORDS['Brooklyn, NY'].lng,
    gender: 'MALE',
    intent: 'CASUAL',
    mediaKeys: ['img-02', 'img-04', 'img-12', 'vid-01'],
    avatarKey: 'img-02',
    heroKey: 'img-04',
    posts: [
      {
        key: 'milo-post-1',
        text: 'Quiet corners, loud laughter, and a camera that never sleeps.',
        mediaKeys: ['img-04'],
        createdAtOffsetDays: 3
      },
      {
        key: 'milo-post-2',
        text: 'Looking for a partner-in-crime for gallery hops and dumpling crawls.',
        mediaKeys: ['img-12'],
        createdAtOffsetDays: 11
      }
    ],
    interests: ['film:documentary', 'food:coffee', 'travel:cities'],
    preferences: {
      preferredAgeMin: 24,
      preferredAgeMax: 38,
      preferredDistanceKm: 30,
      preferredGenders: ['FEMALE']
    },
    quizAnswers: { q1: 'cozy', q2: 'city', q3: 'indie', q4: 'low', q5: 'culture' }
  },
  {
    key: 'sage',
    email: 'seed.sage@example.com',
    password: 'Password123!',
    displayName: 'Sage',
    bio: 'Climbing gyms, indie films, and a soft spot for cozy bookstores. Looking for someone curious.',
    birthdate: '1996-02-21',
    locationText: 'Denver, CO',
    lat: LOCATION_COORDS['Denver, CO'].lat,
    lng: LOCATION_COORDS['Denver, CO'].lng,
    gender: 'NONBINARY',
    intent: 'FRIENDS',
    mediaKeys: ['img-07', 'img-08', 'vid-02', 'img-06'],
    avatarKey: 'img-07',
    heroKey: 'img-08',
    posts: [
      {
        key: 'sage-post-1',
        text: 'Tell me your favorite trail or your favorite book.',
        mediaKeys: ['img-08'],
        createdAtOffsetDays: 4
      },
      {
        key: 'sage-post-2',
        text: 'Weekend plans are better with a sunrise hike and late-night ramen.',
        mediaKeys: ['vid-02'],
        createdAtOffsetDays: 13
      }
    ],
    interests: ['sports:climbing', 'film:sci-fi', 'travel:mountains'],
    preferences: {
      preferredAgeMin: 22,
      preferredAgeMax: 32,
      preferredDistanceKm: 120,
      preferredGenders: ['MALE', 'FEMALE', 'NONBINARY']
    },
    quizAnswers: { q1: 'adventure', q2: 'nature', q3: 'indie', q4: 'balanced', q5: 'active' }
  },
  {
    key: 'jules',
    email: 'seed.jules@example.com',
    password: 'Password123!',
    displayName: 'Jules',
    bio: 'Game nights, coffee walks, and a good sci-fi binge. Bonus points if you like museums.',
    birthdate: '1993-05-07',
    locationText: 'Seattle, WA',
    lat: LOCATION_COORDS['Seattle, WA'].lat,
    lng: LOCATION_COORDS['Seattle, WA'].lng,
    gender: 'FEMALE',
    intent: 'LONG_TERM',
    mediaKeys: ['img-06', 'img-01', 'img-11', 'vid-01'],
    avatarKey: 'img-06',
    heroKey: 'img-11',
    posts: [
      {
        key: 'jules-post-1',
        text: 'Cozy nights + board games + a soft playlist. What is your comfort ritual?',
        mediaKeys: ['img-11'],
        createdAtOffsetDays: 2
      },
      {
        key: 'jules-post-2',
        text: 'Coffee walks and rainy city adventures. Always down for a bookstore crawl.',
        mediaKeys: ['vid-01'],
        createdAtOffsetDays: 9
      }
    ],
    interests: ['music:jazz', 'film:comedy', 'food:coffee'],
    preferences: {
      preferredAgeMin: 26,
      preferredAgeMax: 36,
      preferredDistanceKm: 50,
      preferredGenders: ['MALE', 'NONBINARY']
    },
    quizAnswers: { q1: 'cozy', q2: 'city', q3: 'indie', q4: 'low', q5: 'culture' }
  },
  {
    key: 'river',
    email: 'seed.river@example.com',
    password: 'Password123!',
    displayName: 'River',
    bio: 'Design brain, soft heart, and a playlist for every mood. If there is a rooftop, I am there for sunset.',
    birthdate: '1990-12-18',
    locationText: 'Chicago, IL',
    lat: LOCATION_COORDS['Chicago, IL'].lat,
    lng: LOCATION_COORDS['Chicago, IL'].lng,
    gender: 'MALE',
    intent: 'CASUAL',
    mediaKeys: ['img-04', 'img-09', 'img-12', 'vid-02'],
    avatarKey: 'img-04',
    heroKey: 'img-12',
    posts: [
      {
        key: 'river-post-1',
        text: 'Looking for someone to split tacos and make playlists together.',
        mediaKeys: ['img-12'],
        createdAtOffsetDays: 5
      },
      {
        key: 'river-post-2',
        text: 'City skyline rides and late-night design sprints.',
        mediaKeys: ['vid-02'],
        createdAtOffsetDays: 12
      }
    ],
    interests: ['music:hiphop', 'food:tacos', 'travel:cities'],
    preferences: {
      preferredAgeMin: 23,
      preferredAgeMax: 35,
      preferredDistanceKm: 40,
      preferredGenders: ['FEMALE']
    },
    quizAnswers: { q1: 'live', q2: 'city', q3: 'hiphop', q4: 'social', q5: 'brunch' }
  },
  {
    key: 'nova',
    email: 'seed.nova@example.com',
    password: 'Password123!',
    displayName: 'Nova',
    bio: 'Always down for a new trail or a late-night taco run. Also here for beaches and bright sunrises.',
    birthdate: '1997-04-02',
    locationText: 'Miami, FL',
    lat: LOCATION_COORDS['Miami, FL'].lat,
    lng: LOCATION_COORDS['Miami, FL'].lng,
    gender: 'FEMALE',
    intent: 'FRIENDS',
    mediaKeys: ['img-08', 'img-01', 'img-05', 'vid-01'],
    avatarKey: 'img-08',
    heroKey: 'img-05',
    posts: [
      {
        key: 'nova-post-1',
        text: 'Beach resets and sunset swims. Tell me your favorite water spot.',
        mediaKeys: ['img-05'],
        createdAtOffsetDays: 1
      },
      {
        key: 'nova-post-2',
        text: 'Chasing warm light and good energy all weekend.',
        mediaKeys: ['vid-01'],
        createdAtOffsetDays: 8
      }
    ],
    interests: ['travel:beaches', 'food:sushi', 'music:edm'],
    preferences: {
      preferredAgeMin: 22,
      preferredAgeMax: 32,
      preferredDistanceKm: 90,
      preferredGenders: ['MALE', 'NONBINARY']
    },
    quizAnswers: { q1: 'adventure', q2: 'beach', q3: 'pop', q4: 'social', q5: 'active' }
  },
  {
    key: 'luca',
    email: 'seed.luca@example.com',
    password: 'Password123!',
    displayName: 'Luca',
    bio: 'Always up for a new coffee shop, a tennis match, and a stack of vinyl records.',
    birthdate: '1989-07-29',
    locationText: 'San Francisco, CA',
    lat: LOCATION_COORDS['San Francisco, CA'].lat,
    lng: LOCATION_COORDS['San Francisco, CA'].lng,
    gender: 'MALE',
    intent: 'LONG_TERM',
    mediaKeys: ['img-10', 'img-07', 'img-03', 'vid-02'],
    avatarKey: 'img-10',
    heroKey: 'img-03',
    posts: [
      {
        key: 'luca-post-1',
        text: 'Weekend ritual: tennis + espresso + the farmers market playlist.',
        mediaKeys: ['img-03'],
        createdAtOffsetDays: 4
      },
      {
        key: 'luca-post-2',
        text: 'City hikes and vinyl nights. Looking for someone who loves a good soundtrack.',
        mediaKeys: ['vid-02'],
        createdAtOffsetDays: 15
      }
    ],
    interests: ['sports:tennis', 'music:rock', 'food:coffee'],
    preferences: {
      preferredAgeMin: 25,
      preferredAgeMax: 37,
      preferredDistanceKm: 30,
      preferredGenders: ['FEMALE']
    },
    quizAnswers: { q1: 'cozy', q2: 'city', q3: 'indie', q4: 'balanced', q5: 'brunch' }
  },
  {
    key: 'inez',
    email: 'seed.inez@example.com',
    password: 'Password123!',
    displayName: 'Inez',
    bio: 'Photo walks, rainy playlists, and a never-ending list of weekend trips.',
    birthdate: '1995-03-22',
    locationText: 'Portland, OR',
    lat: LOCATION_COORDS['Portland, OR'].lat,
    lng: LOCATION_COORDS['Portland, OR'].lng,
    gender: 'FEMALE',
    intent: 'CASUAL',
    mediaKeys: ['img-06', 'img-02', 'img-11', 'vid-01'],
    avatarKey: 'img-06',
    heroKey: 'img-11',
    posts: [
      {
        key: 'inez-post-1',
        text: 'Weekend getaways > long vacations. Give me your best day-trip rec.',
        mediaKeys: ['img-11'],
        createdAtOffsetDays: 3
      },
      {
        key: 'inez-post-2',
        text: 'Camera roll full of moody skies and good coffee.',
        mediaKeys: ['vid-01'],
        createdAtOffsetDays: 14
      }
    ],
    interests: ['travel:weekenders', 'film:romance', 'food:baking'],
    preferences: {
      preferredAgeMin: 24,
      preferredAgeMax: 35,
      preferredDistanceKm: 70,
      preferredGenders: ['MALE', 'NONBINARY']
    },
    quizAnswers: { q1: 'cozy', q2: 'nature', q3: 'indie', q4: 'balanced', q5: 'culture' }
  },
  {
    key: 'remy',
    email: 'seed.remy@example.com',
    password: 'Password123!',
    displayName: 'Remy',
    bio: 'Gym days, cozy nights, and the occasional road trip. Looking for someone grounded.',
    birthdate: '1988-10-09',
    locationText: 'Boston, MA',
    lat: LOCATION_COORDS['Boston, MA'].lat,
    lng: LOCATION_COORDS['Boston, MA'].lng,
    gender: 'OTHER',
    intent: 'FRIENDS',
    mediaKeys: ['img-07', 'img-08', 'img-04', 'vid-02'],
    avatarKey: 'img-07',
    heroKey: 'img-04',
    posts: [
      {
        key: 'remy-post-1',
        text: 'Early workouts, late-night ramen. Balance is everything.',
        mediaKeys: ['img-04'],
        createdAtOffsetDays: 7
      },
      {
        key: 'remy-post-2',
        text: 'Ask me about my last spontaneous road trip.',
        mediaKeys: ['vid-02'],
        createdAtOffsetDays: 16
      }
    ],
    interests: ['sports:running', 'travel:roadtrips', 'food:bbq'],
    preferences: {
      preferredAgeMin: 23,
      preferredAgeMax: 34,
      preferredDistanceKm: 80,
      preferredGenders: ['MALE', 'FEMALE', 'NONBINARY', 'OTHER']
    },
    quizAnswers: { q1: 'adventure', q2: 'nature', q3: 'hiphop', q4: 'balanced', q5: 'active' }
  }
];

const LIKE_SEEDS: SeedLike[] = [
  { from: 'nick', to: 'aria', action: 'LIKE' },
  { from: 'aria', to: 'nick', action: 'LIKE' },
  { from: 'jules', to: 'sage', action: 'LIKE' },
  { from: 'sage', to: 'jules', action: 'LIKE' },
  { from: 'river', to: 'nova', action: 'LIKE' },
  { from: 'nova', to: 'river', action: 'LIKE' },
  { from: 'milo', to: 'aria', action: 'LIKE' },
  { from: 'inez', to: 'luca', action: 'LIKE' },
  { from: 'luca', to: 'inez', action: 'LIKE' },
  { from: 'remy', to: 'milo', action: 'DISLIKE' },
  { from: 'nick', to: 'milo', action: 'DISLIKE' }
];

const CONVERSATIONS: SeedConversation[] = [
  {
    users: ['nick', 'aria'],
    messages: [
      { sender: 'nick', body: 'Hey Aria, that rooftop playlist sounds perfect.', minutesAgo: 240 },
      { sender: 'aria', body: 'Only if you bring the tacos. Favorite spot in LA?', minutesAgo: 235 },
      { sender: 'nick', body: 'I will send you my top 3. Down for a Sunday sunset?', minutesAgo: 230 }
    ]
  },
  {
    users: ['sage', 'jules'],
    messages: [
      { sender: 'sage', body: 'What is your favorite museum in Seattle?', minutesAgo: 120 },
      { sender: 'jules', body: 'MoPOP always. Want to trade trail recs too?', minutesAgo: 118 }
    ]
  },
  {
    users: ['river', 'nova'],
    messages: [
      { sender: 'river', body: 'If you pick the beach, I will bring the playlist.', minutesAgo: 90 },
      { sender: 'nova', body: 'Deal. Sunrise swims are my favorite.', minutesAgo: 85 }
    ]
  }
];

const POST_LIKES: SeedPostLike[] = [
  { user: 'nick', postKey: 'aria-post-1', minutesAgo: 40 },
  { user: 'nick', postKey: 'nova-post-1', minutesAgo: 35 },
  { user: 'aria', postKey: 'nick-post-1', minutesAgo: 30 },
  { user: 'aria', postKey: 'sage-post-1', minutesAgo: 28 },
  { user: 'milo', postKey: 'aria-post-2', minutesAgo: 55 },
  { user: 'milo', postKey: 'inez-post-1', minutesAgo: 48 },
  { user: 'sage', postKey: 'jules-post-1', minutesAgo: 44 },
  { user: 'sage', postKey: 'river-post-1', minutesAgo: 41 },
  { user: 'jules', postKey: 'sage-post-2', minutesAgo: 52 },
  { user: 'jules', postKey: 'nick-post-2', minutesAgo: 36 },
  { user: 'river', postKey: 'nova-post-2', minutesAgo: 60 },
  { user: 'nova', postKey: 'river-post-2', minutesAgo: 58 },
  { user: 'luca', postKey: 'inez-post-2', minutesAgo: 25 },
  { user: 'inez', postKey: 'luca-post-1', minutesAgo: 20 },
  { user: 'remy', postKey: 'milo-post-1', minutesAgo: 70 }
];

const FEED_SEEN: SeedFeedSeen[] = [
  { viewer: 'nick', itemType: 'POST', itemKey: 'aria-post-1', minutesAgo: 15 },
  { viewer: 'nick', itemType: 'POST', itemKey: 'milo-post-1', minutesAgo: 12 },
  { viewer: 'nick', itemType: 'SUGGESTION', itemKey: 'jules', minutesAgo: 10 }
];

const NAMES = ['Jules', 'River', 'Kai', 'Remy', 'Nova', 'Sasha', 'Luca', 'Inez', 'Mara', 'Elio', 'Sienna', 'Rowan', 'Atlas', 'Noa', 'Indie'];
const BIOS = [
  'Slow mornings, loud playlists, and a packed camera roll.',
  'Game nights, coffee walks, and a good sci-fi binge.',
  'Always down for a new trail or a late-night taco run.',
  'Design brain, soft heart, and a playlist for every mood.',
  'If there is a rooftop, I am there for sunset.',
  'Gym days, cozy nights, and the occasional road trip.'
];

const LOCATIONS = [
  'Austin, TX',
  'Brooklyn, NY',
  'Denver, CO',
  'Seattle, WA',
  'Chicago, IL',
  'Miami, FL',
  'Los Angeles, CA',
  'San Francisco, CA',
  'Portland, OR',
  'Boston, MA'
];

const INTENTS: SeedPersona['intent'][] = ['FRIENDS', 'CASUAL', 'LONG_TERM', 'MARRIAGE'];
const GENDERS: SeedPersona['gender'][] = ['MALE', 'FEMALE', 'NONBINARY', 'OTHER'];

const MEDIA_BY_KEY = new Map(MEDIA_LIBRARY.map((item) => [item.key, item]));
const IMAGE_KEYS = MEDIA_LIBRARY.filter((item) => item.type === 'IMAGE').map((item) => item.key);

function pick<T>(items: T[], idx: number) {
  return items[idx % items.length]!;
}

function nowMinusMinutes(minutes: number) {
  return new Date(Date.now() - minutes * 60 * 1000);
}

function nowMinusDays(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function buildSyntheticPersonas(count: number, startIndex: number): SeedPersona[] {
  const seeds: SeedPersona[] = [];
  for (let i = 0; i < count; i += 1) {
    const idx = startIndex + i;
    const displayName = pick(NAMES, idx);
    const key = `demo-${displayName.toLowerCase()}-${idx}`;
    const locationText = pick(LOCATIONS, idx);
    const coords = LOCATION_COORDS[locationText];
    const mediaKeys = [
      pick(IMAGE_KEYS, idx * 2),
      pick(IMAGE_KEYS, idx * 2 + 1),
      pick(IMAGE_KEYS, idx * 2 + 2)
    ];
    const posts: SeedPost[] = [
      {
        key: `${key}-post-1`,
        text: `Weekend vibes: ${pick(BIOS, idx + 1)}`,
        mediaKeys: [mediaKeys[0], mediaKeys[1]],
        createdAtOffsetDays: 2 + (idx % 5)
      },
      {
        key: `${key}-post-2`,
        text: `Ask me about: ${pick(BIOS, idx + 2)}`,
        mediaKeys: [mediaKeys[2]],
        createdAtOffsetDays: 6 + (idx % 7)
      }
    ];
    seeds.push({
      key,
      email: `demo.${displayName.toLowerCase()}.${idx}@example.com`,
      password: 'Password123!',
      displayName,
      bio: pick(BIOS, idx),
      birthdate: `199${(idx % 9) + 1}-0${(idx % 8) + 1}-1${idx % 9}`,
      locationText,
      lat: coords?.lat,
      lng: coords?.lng,
      gender: pick(GENDERS, idx),
      intent: pick(INTENTS, idx),
      mediaKeys,
      avatarKey: mediaKeys[0],
      heroKey: mediaKeys[1],
      posts
    });
  }
  return seeds;
}

function buildPersonas(count: number) {
  if (count <= PERSONAS.length) {
    return PERSONAS.slice(0, count);
  }
  const extras = buildSyntheticPersonas(count - PERSONAS.length, PERSONAS.length + 1);
  return PERSONAS.concat(extras);
}

async function runLoader<T>(label: string, items: T[], handler: (item: T, index: number) => Promise<void>) {
  if (!items.length) return;
  for (const [index, item] of items.entries()) {
    await handler(item, index);
  }
  console.log(`Seeded ${label}: ${items.length}`);
}

function resolveMediaSeed(key: string): SeedMedia {
  const media = MEDIA_BY_KEY.get(key);
  if (!media) {
    throw new Error(`Missing media seed: ${key}`);
  }
  return media;
}

async function resetUserContent(userId: bigint) {
  const posts = await prisma.post.findMany({
    where: { userId },
    select: { id: true }
  });
  const postIds = posts.map((p) => p.id);

  if (postIds.length) {
    await prisma.postMedia.deleteMany({ where: { postId: { in: postIds } } });
    await prisma.likedPost.deleteMany({ where: { postId: { in: postIds } } });
    await prisma.post.deleteMany({ where: { id: { in: postIds } } });
  }

  await prisma.media.deleteMany({ where: { userId } });
}

async function seedPersona(seed: SeedPersona, ctx: SeedContext) {
  const passwordHash = await bcrypt.hash(seed.password, 10);

  const user = await prisma.user.upsert({
    where: { email: seed.email },
    update: { passwordHash },
    create: {
      email: seed.email,
      passwordHash,
      profile: {
        create: {
          displayName: seed.displayName,
          bio: seed.bio,
          birthdate: new Date(seed.birthdate),
          locationText: seed.locationText,
          lat: seed.lat ?? null,
          lng: seed.lng ?? null,
          gender: seed.gender,
          intent: seed.intent,
          isVisible: true
        }
      }
    },
    select: { id: true }
  });

  const profile = await prisma.profile.upsert({
    where: { userId: user.id },
    update: {
      displayName: seed.displayName,
      bio: seed.bio,
      birthdate: new Date(seed.birthdate),
      locationText: seed.locationText,
      lat: seed.lat ?? null,
      lng: seed.lng ?? null,
      gender: seed.gender,
      intent: seed.intent,
      isVisible: true
    },
    create: {
      userId: user.id,
      displayName: seed.displayName,
      bio: seed.bio,
      birthdate: new Date(seed.birthdate),
      locationText: seed.locationText,
      lat: seed.lat ?? null,
      lng: seed.lng ?? null,
      gender: seed.gender,
      intent: seed.intent,
      isVisible: true
    },
    select: { id: true }
  });

  await resetUserContent(user.id);

  const mediaByKey = new Map<string, bigint>();
  for (const key of seed.mediaKeys) {
    const mediaSeed = resolveMediaSeed(key);
    const media = await prisma.media.create({
      data: {
        userId: user.id,
        ownerUserId: user.id,
        status: 'READY',
        visibility: 'PUBLIC',
        type: mediaSeed.type,
        url: mediaSeed.url,
        thumbUrl: mediaSeed.thumbUrl ?? null,
        width: mediaSeed.width ?? null,
        height: mediaSeed.height ?? null,
        durationSec: mediaSeed.durationSec ?? null
      },
      select: { id: true }
    });
    mediaByKey.set(key, media.id);
  }

  const avatarMediaId = seed.avatarKey ? mediaByKey.get(seed.avatarKey) : mediaByKey.get(seed.mediaKeys[0]);
  const heroMediaId = seed.heroKey ? mediaByKey.get(seed.heroKey) : mediaByKey.get(seed.mediaKeys[0]);

  await prisma.profile.update({
    where: { userId: user.id },
    data: {
      avatarMediaId: avatarMediaId ?? null,
      heroMediaId: heroMediaId ?? null
    }
  });

  for (const post of seed.posts) {
    const createdAt = post.createdAtOffsetDays ? nowMinusDays(post.createdAtOffsetDays) : new Date();
    const mediaIds = post.mediaKeys
      .map((key) => mediaByKey.get(key))
      .filter((id): id is bigint => Boolean(id));

    const created = await prisma.post.create({
      data: {
        userId: user.id,
        visibility: 'PUBLIC',
        text: post.text,
        createdAt,
        media: {
          create: mediaIds.map((mediaId, idx) => ({
            order: idx,
            mediaId
          }))
        }
      },
      select: { id: true }
    });
    ctx.postsByKey.set(post.key, created.id);
  }

  ctx.usersByKey.set(seed.key, { userId: user.id, profileId: profile.id });
  ctx.mediaByUserKey.set(seed.key, mediaByKey);
}

async function ensureInterests(ctx: SeedContext) {
  for (const subject of SUBJECTS) {
    const subjectRow = await prisma.interestSubject.upsert({
      where: { key: subject.key },
      update: { label: subject.label },
      create: { key: subject.key, label: subject.label },
      select: { id: true }
    });

    for (const interest of subject.interests) {
      const interestRow = await prisma.interest.upsert({
        where: { subjectId_key: { subjectId: subjectRow.id, key: interest.key } },
        update: { label: interest.label },
        create: { subjectId: subjectRow.id, key: interest.key, label: interest.label },
        select: { id: true }
      });
      ctx.interestsByKey.set(`${subject.key}:${interest.key}`, {
        subjectId: subjectRow.id,
        interestId: interestRow.id
      });
    }
  }
}

async function ensureQuiz(ctx: SeedContext) {
  await prisma.quiz.updateMany({
    where: { isActive: true, slug: { not: QUIZ_SEED.slug } },
    data: { isActive: false }
  });

  const quiz = await prisma.quiz.upsert({
    where: { slug: QUIZ_SEED.slug },
    update: { title: QUIZ_SEED.title, isActive: true },
    create: { slug: QUIZ_SEED.slug, title: QUIZ_SEED.title, isActive: true },
    select: { id: true }
  });

  const existingQuestions = await prisma.quizQuestion.findMany({
    where: { quizId: quiz.id },
    select: { id: true }
  });
  const questionIds = existingQuestions.map((q) => q.id);
  if (questionIds.length) {
    await prisma.quizOption.deleteMany({ where: { questionId: { in: questionIds } } });
    await prisma.quizQuestion.deleteMany({ where: { id: { in: questionIds } } });
  }

  const questions: Array<{ key: string; id: bigint; options: Array<{ value: string }> }> = [];
  for (const [idx, question] of QUIZ_SEED.questions.entries()) {
    const created = await prisma.quizQuestion.create({
      data: {
        quizId: quiz.id,
        prompt: question.prompt,
        order: idx + 1,
        options: {
          create: question.options.map((opt, optIdx) => ({
            label: opt.label,
            value: opt.value,
            order: optIdx + 1
          }))
        }
      },
      select: {
        id: true,
        options: { orderBy: { order: 'asc' }, select: { value: true } }
      }
    });
    questions.push({ key: question.key, id: created.id, options: created.options });
  }

  ctx.quiz = { id: quiz.id, questions };
}

async function seedUserInterests(seed: SeedPersona, ctx: SeedContext) {
  if (!seed.interests?.length) return;
  const user = ctx.usersByKey.get(seed.key);
  if (!user) return;
  await prisma.userInterest.deleteMany({ where: { userId: user.userId } });

  const data = seed.interests
    .map((key) => ctx.interestsByKey.get(key))
    .filter((entry): entry is { subjectId: bigint; interestId: bigint } => Boolean(entry))
    .map((entry) => ({
      userId: user.userId,
      subjectId: entry.subjectId,
      interestId: entry.interestId
    }));

  if (data.length) {
    await prisma.userInterest.createMany({ data, skipDuplicates: true });
  }
}

async function seedUserPreference(seed: SeedPersona, ctx: SeedContext) {
  if (!seed.preferences) return;
  const user = ctx.usersByKey.get(seed.key);
  if (!user) return;
  await prisma.userPreference.upsert({
    where: { userId: user.userId },
    update: {
      preferredAgeMin: seed.preferences.preferredAgeMin ?? null,
      preferredAgeMax: seed.preferences.preferredAgeMax ?? null,
      preferredDistanceKm: seed.preferences.preferredDistanceKm ?? null,
      preferredGenders: seed.preferences.preferredGenders ?? null
    },
    create: {
      userId: user.userId,
      preferredAgeMin: seed.preferences.preferredAgeMin ?? null,
      preferredAgeMax: seed.preferences.preferredAgeMax ?? null,
      preferredDistanceKm: seed.preferences.preferredDistanceKm ?? null,
      preferredGenders: seed.preferences.preferredGenders ?? null
    }
  });
}

async function seedQuizResult(seed: SeedPersona, ctx: SeedContext) {
  if (!seed.quizAnswers || !ctx.quiz) return;
  const user = ctx.usersByKey.get(seed.key);
  if (!user) return;

  const answers: Record<string, string> = {};
  const scoreVec: number[] = [];

  for (const question of ctx.quiz.questions) {
    const desired = seed.quizAnswers[question.key] ?? question.options[0]?.value ?? 'na';
    const optIndex = Math.max(0, question.options.findIndex((opt) => opt.value === desired));
    const selected = question.options[optIndex]?.value ?? question.options[0]?.value ?? desired;
    answers[question.id.toString()] = selected;

    const denom = Math.max(1, question.options.length - 1);
    scoreVec.push(optIndex / denom);
  }

  await prisma.quizResult.upsert({
    where: { userId_quizId: { userId: user.userId, quizId: ctx.quiz.id } },
    update: { answers, scoreVec },
    create: { userId: user.userId, quizId: ctx.quiz.id, answers, scoreVec }
  });
}

async function seedLikes(seeds: SeedLike[], ctx: SeedContext) {
  for (const seed of seeds) {
    const from = ctx.usersByKey.get(seed.from);
    const to = ctx.usersByKey.get(seed.to);
    if (!from || !to) continue;
    await prisma.like.upsert({
      where: { fromUserId_toUserId: { fromUserId: from.userId, toUserId: to.userId } },
      update: { action: seed.action },
      create: { fromUserId: from.userId, toUserId: to.userId, action: seed.action }
    });
  }
}

function pairKey(a: string, b: string) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

async function seedMatchesAndConversations(likes: SeedLike[], ctx: SeedContext) {
  const likePairs = new Set<string>();
  for (const like of likes) {
    if (like.action !== 'LIKE') continue;
    likePairs.add(`${like.from}:${like.to}`);
  }

  const matchPairs = new Set<string>();
  for (const like of likes) {
    if (like.action !== 'LIKE') continue;
    if (likePairs.has(`${like.to}:${like.from}`)) {
      matchPairs.add(pairKey(like.from, like.to));
    }
  }

  const conversationMap = new Map<string, SeedConversation>();
  for (const convo of CONVERSATIONS) {
    conversationMap.set(pairKey(convo.users[0], convo.users[1]), convo);
  }

  for (const pair of matchPairs) {
    const [left, right] = pair.split(':');
    const userA = ctx.usersByKey.get(left);
    const userB = ctx.usersByKey.get(right);
    if (!userA || !userB) continue;

    const match = await prisma.match.upsert({
      where: { userAId_userBId: { userAId: userA.userId, userBId: userB.userId } },
      update: { state: 'ACTIVE' },
      create: {
        userAId: userA.userId,
        userBId: userB.userId,
        state: 'ACTIVE'
      },
      select: { id: true }
    });

    const conversation = await prisma.conversation.upsert({
      where: { userAId_userBId: { userAId: userA.userId, userBId: userB.userId } },
      update: { matchId: match.id },
      create: {
        matchId: match.id,
        userAId: userA.userId,
        userBId: userB.userId
      },
      select: { id: true }
    });

    const convoSeed = conversationMap.get(pair);
    if (!convoSeed) continue;

    await prisma.message.deleteMany({ where: { conversationId: conversation.id } });

    for (const message of convoSeed.messages) {
      const sender = ctx.usersByKey.get(message.sender);
      if (!sender) continue;
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderId: sender.userId,
          body: message.body,
          isSystem: message.isSystem ?? false,
          createdAt: nowMinusMinutes(message.minutesAgo)
        }
      });
    }
  }
}

async function seedPostLikes(seeds: SeedPostLike[], ctx: SeedContext) {
  for (const seed of seeds) {
    const user = ctx.usersByKey.get(seed.user);
    const postId = ctx.postsByKey.get(seed.postKey);
    if (!user || !postId) continue;
    await prisma.likedPost.upsert({
      where: { userId_postId: { userId: user.userId, postId } },
      update: {},
      create: {
        userId: user.userId,
        postId,
        createdAt: nowMinusMinutes(seed.minutesAgo ?? 60)
      }
    });
  }
}

async function seedFeedSeen(seeds: SeedFeedSeen[], ctx: SeedContext) {
  for (const seed of seeds) {
    const viewer = ctx.usersByKey.get(seed.viewer);
    if (!viewer) continue;
    let itemId: bigint | undefined;
    if (seed.itemType === 'POST') {
      itemId = ctx.postsByKey.get(seed.itemKey);
    } else {
      itemId = ctx.usersByKey.get(seed.itemKey)?.userId;
    }
    if (!itemId) continue;
    await prisma.feedSeen.upsert({
      where: { viewerUserId_itemType_itemId: { viewerUserId: viewer.userId, itemType: seed.itemType, itemId } },
      update: { seenAt: nowMinusMinutes(seed.minutesAgo ?? 10) },
      create: { viewerUserId: viewer.userId, itemType: seed.itemType, itemId, seenAt: nowMinusMinutes(seed.minutesAgo ?? 10) }
    });
  }
}

function scoreFromSeed(seed: number, min = 2, max = 5) {
  const span = max - min + 1;
  return min + (seed % span);
}

async function seedRatings(viewerUserId: bigint | null, targetUserIds: bigint[]) {
  if (!viewerUserId) return;
  const viewerProfile = await prisma.profile.findUnique({
    where: { userId: viewerUserId },
    select: { id: true }
  });
  if (!viewerProfile) return;

  const profiles = await prisma.profile.findMany({
    where: { userId: { in: targetUserIds }, deletedAt: null },
    select: { id: true }
  });

  for (const profile of profiles) {
    await prisma.profileRating.upsert({
      where: { raterProfileId_targetProfileId: { raterProfileId: viewerProfile.id, targetProfileId: profile.id } },
      update: {},
      create: {
        raterProfileId: viewerProfile.id,
        targetProfileId: profile.id,
        attractive: scoreFromSeed(Number(profile.id)),
        smart: scoreFromSeed(Number(profile.id) + 1),
        funny: scoreFromSeed(Number(profile.id) + 2),
        interesting: scoreFromSeed(Number(profile.id) + 3)
      }
    });
  }

  for (const target of profiles) {
    const raters = profiles.filter((p) => p.id !== target.id).slice(0, 3);
    for (const rater of raters) {
      await prisma.profileRating.upsert({
        where: { raterProfileId_targetProfileId: { raterProfileId: rater.id, targetProfileId: target.id } },
        update: {},
        create: {
          raterProfileId: rater.id,
          targetProfileId: target.id,
          attractive: scoreFromSeed(Number(rater.id)),
          smart: scoreFromSeed(Number(rater.id) + 1),
          funny: scoreFromSeed(Number(rater.id) + 2),
          interesting: scoreFromSeed(Number(rater.id) + 3)
        }
      });
    }
  }
}

export async function seedFeedDemo(options: { count?: number; viewerUserId?: bigint | null } = {}) {
  const count = options.count ?? PERSONAS.length;
  const seeds = buildPersonas(count);
  const ctx: SeedContext = {
    usersByKey: new Map(),
    mediaByUserKey: new Map(),
    postsByKey: new Map(),
    interestsByKey: new Map()
  };

  await ensureInterests(ctx);
  await ensureQuiz(ctx);

  await runLoader('profiles + posts', seeds, async (seed) => seedPersona(seed, ctx));
  await runLoader('preferences', seeds, async (seed) => seedUserPreference(seed, ctx));
  await runLoader('interests', seeds, async (seed) => seedUserInterests(seed, ctx));
  await runLoader('quiz results', seeds, async (seed) => seedQuizResult(seed, ctx));

  await runLoader('likes', LIKE_SEEDS, async (seed) => seedLikes([seed], ctx));
  await seedMatchesAndConversations(LIKE_SEEDS, ctx);
  await runLoader('post likes', POST_LIKES, async (seed) => seedPostLikes([seed], ctx));
  await runLoader('feed seen', FEED_SEEN, async (seed) => seedFeedSeen([seed], ctx));

  const ids = Array.from(ctx.usersByKey.values()).map((entry) => entry.userId);
  await seedRatings(options.viewerUserId ?? null, ids);

  return { ids };
}

function parseBigIntArg(flag: string) {
  const raw = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (!raw) return null;
  const value = raw.split('=')[1];
  if (!value || !/^\d+$/.test(value)) return null;
  return BigInt(value);
}

function parseIntArg(flag: string, fallback: number) {
  const raw = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (!raw) return fallback;
  const value = raw.split('=')[1];
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function main() {
  const count = parseIntArg('--count', PERSONAS.length);
  const viewerUserId = parseBigIntArg('--viewerUserId') ?? 8n;
  console.log(`Seeding demo data (${count} profiles). Types: ${SEED_DATA_TYPES.join(', ')}`);
  const result = await seedFeedDemo({ count, viewerUserId });
  console.log(`Seeded ${result.ids.length} demo profiles: ${result.ids.map((id) => id.toString()).join(', ')}`);
}

const isDirect = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirect) {
  main()
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
