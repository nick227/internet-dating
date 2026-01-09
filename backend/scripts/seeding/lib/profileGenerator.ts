/**
 * Profile generation with personality system
 * Generates complete profile data structures in-memory
 */

import type { RNG } from './prng.js';
import { makeUserRng, lerp } from './prng.js';
import { generateName, generateLocation, generateAge, generateBio } from './mockDataGenerator.js';

type Gender = 'MALE' | 'FEMALE' | 'NONBINARY' | 'OTHER' | 'UNSPECIFIED';
type Intent = 'FRIENDS' | 'CASUAL' | 'LONG_TERM' | 'MARRIAGE' | 'UNSPECIFIED';

interface PersonalityTraits {
  sociability: number; // 0-1: affects posting frequency, message response rate
  selectivity: number; // 0-1: affects like/dislike ratio
  engagement: number; // 0-1: affects quiz completion, profile detail
}

type Archetype = 'adventurer' | 'intellectual' | 'social' | 'creative' | 'athletic' | 'casual';

interface Personality {
  archetype: Archetype;
  traits: PersonalityTraits;
  interests: string[];
  preferredTopics: string[];
}

interface MediaSeed {
  type: 'IMAGE' | 'VIDEO';
  url: string;
  thumbUrl: string;
  width?: number;
  height?: number;
  durationSec?: number;
}

interface GeneratedProfile {
  userId: bigint;
  email: string;
  displayName: string;
  bio: string;
  birthdate: Date;
  locationText: string;
  lat: number;
  lng: number;
  gender: Gender;
  intent: Intent;
  personality: Personality;
  media: MediaSeed[];
  interests: string[];
  completeQuiz: boolean;
}

const GENDERS: Gender[] = ['MALE', 'FEMALE', 'NONBINARY'];
const INTENTS: Intent[] = ['FRIENDS', 'CASUAL', 'LONG_TERM', 'MARRIAGE'];

const INTEREST_KEYS = [
  'music:indie', 'music:hiphop', 'music:jazz', 'music:rock', 'music:edm',
  'film:documentary', 'film:thriller', 'film:romance', 'film:comedy', 'film:sci-fi',
  'sports:soccer', 'sports:basketball', 'sports:tennis', 'sports:running', 'sports:climbing',
  'food:sushi', 'food:bbq', 'food:baking', 'food:coffee', 'food:tacos',
  'travel:roadtrips', 'travel:beaches', 'travel:mountains', 'travel:cities', 'travel:weekenders'
];

function generatePersonality(rng: RNG): Personality {
  const archetypes: Archetype[] = ['adventurer', 'intellectual', 'social', 'creative', 'athletic', 'casual'];
  const archetype = rng.choice(archetypes);
  
  // Generate traits influenced by archetype
  let baseSociability = 0.5;
  let baseSelectivity = 0.5;
  let baseEngagement = 0.6;
  
  switch (archetype) {
    case 'adventurer':
      baseSociability = 0.7;
      baseSelectivity = 0.4;
      baseEngagement = 0.8;
      break;
    case 'intellectual':
      baseSociability = 0.4;
      baseSelectivity = 0.7;
      baseEngagement = 0.9;
      break;
    case 'social':
      baseSociability = 0.9;
      baseSelectivity = 0.3;
      baseEngagement = 0.7;
      break;
    case 'creative':
      baseSociability = 0.6;
      baseSelectivity = 0.6;
      baseEngagement = 0.8;
      break;
    case 'athletic':
      baseSociability = 0.7;
      baseSelectivity = 0.5;
      baseEngagement = 0.6;
      break;
    case 'casual':
      baseSociability = 0.5;
      baseSelectivity = 0.5;
      baseEngagement = 0.5;
      break;
  }
  
  // Add variation
  const sociability = Math.max(0.2, Math.min(0.9, baseSociability + rng.nextFloat(-0.2, 0.2)));
  const selectivity = Math.max(0.2, Math.min(0.9, baseSelectivity + rng.nextFloat(-0.2, 0.2)));
  const engagement = Math.max(0.3, Math.min(0.95, baseEngagement + rng.nextFloat(-0.15, 0.15)));
  
  // Select interests based on archetype
  const interestCount = 3 + rng.nextInt(6); // 3-8 interests
  const shuffled = rng.shuffle(INTEREST_KEYS);
  const interests = shuffled.slice(0, interestCount);
  
  // Derive topics from interests
  const preferredTopics = interests.map(i => i.split(':')[0]!).filter((v, i, a) => a.indexOf(v) === i);
  
  return {
    archetype,
    traits: {
      sociability,
      selectivity,
      engagement
    },
    interests,
    preferredTopics
  };
}

function generateMediaUrls(rng: RNG, count: number): MediaSeed[] {
  const media: MediaSeed[] = [];
  for (let i = 0; i < count; i++) {
    const seed = rng.nextInt(100000);
    const width = 800 + rng.nextInt(400);
    const height = 600 + rng.nextInt(400);
    
    media.push({
      type: 'IMAGE',
      url: `https://picsum.photos/seed/${seed}/${width}/${height}`,
      thumbUrl: `https://picsum.photos/seed/${seed}/400/300`,
      width,
      height
    });
  }
  return media;
}

export function generateProfile(runSeed: string, index: number): GeneratedProfile {
  const userId = BigInt(index + 1);
  const rng = makeUserRng(runSeed, userId, 'profile');
  
  const gender = rng.choice(GENDERS);
  const displayName = generateName(rng, gender);
  const age = generateAge(rng);
  const birthdate = new Date();
  birthdate.setFullYear(birthdate.getFullYear() - age);
  
  const location = generateLocation(rng);
  const intent = rng.choice(INTENTS);
  const personality = generatePersonality(rng);
  
  // Generate interests for bio
  const interestLabels = personality.interests.map(i => {
    const [, label] = i.split(':');
    return label || i;
  });
  
  const bio = generateBio(rng, interestLabels);
  
  // Generate media (3-5 images)
  const mediaCount = 3 + rng.nextInt(3);
  const media = generateMediaUrls(rng, mediaCount);
  
  // 80-90% complete quiz
  const completeQuiz = rng.bool(0.85);
  
  return {
    userId,
    email: `test.user${userId}@example.com`,
    displayName,
    bio,
    birthdate,
    locationText: location.text,
    lat: location.lat,
    lng: location.lng,
    gender,
    intent,
    personality,
    media,
    interests: personality.interests,
    completeQuiz
  };
}

export function generateProfiles(runSeed: string, count: number): GeneratedProfile[] {
  const profiles: GeneratedProfile[] = [];
  for (let i = 0; i < count; i++) {
    profiles.push(generateProfile(runSeed, i));
  }
  return profiles;
}

export type { GeneratedProfile, Personality, PersonalityTraits, Archetype, Gender, Intent, MediaSeed };
