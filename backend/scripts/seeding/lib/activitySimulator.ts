/**
 * Activity simulation engine
 * Generates time-based user activity in deterministic manner
 */

import type { RNG } from './prng.js';
import { makeDayRng, lerp } from './prng.js';
import { generatePostText, generateMessageOpener, generateMessageResponse } from './mockDataGenerator.js';
import type { GeneratedProfile, Personality } from './profileGenerator.js';

interface UserBucket {
  userId: bigint;
  city: string;
  ageBucket: number;
  intent: string;
  personality: Personality;
}

interface GeneratedPost {
  userId: bigint;
  text: string;
  visibility: 'PUBLIC';
  createdAt: Date;
}

interface GeneratedLike {
  fromUserId: bigint;
  toUserId: bigint;
  action: 'LIKE' | 'DISLIKE';
  createdAt: Date;
}

interface GeneratedMatch {
  userAId: bigint;
  userBId: bigint;
  state: 'ACTIVE';
  createdAt: Date;
}

interface GeneratedMessage {
  conversationId: bigint;
  senderId: bigint;
  body: string;
  isSystem: boolean;
  createdAt: Date;
}

interface MatchWithConversation extends GeneratedMatch {
  conversationId: bigint;
}

interface ActivityForDay {
  posts: GeneratedPost[];
  likes: GeneratedLike[];
  matches: GeneratedMatch[];
  messages: GeneratedMessage[];
}

export function preBucketUsers(profiles: GeneratedProfile[]): Map<string, UserBucket[]> {
  const buckets = new Map<string, UserBucket[]>();
  
  for (const profile of profiles) {
    // Skip profiles with missing required data
    if (!profile.locationText || !profile.birthdate || !profile.intent || !profile.displayName || !profile.bio) {
      continue;
    }
    
    const city = profile.locationText.split(',')[0]?.trim() || profile.locationText;
    const ageBucket = Math.floor((new Date().getFullYear() - profile.birthdate.getFullYear()) / 5);
    const key = `${city}:${ageBucket}:${profile.intent}`;
    
    if (!buckets.has(key)) {
      buckets.set(key, []);
    }
    
    buckets.get(key)!.push({
      userId: profile.userId,
      city,
      ageBucket,
      intent: profile.intent,
      personality: profile.personality
    });
  }
  
  return buckets;
}

function getCandidates(buckets: Map<string, UserBucket[]>, user: UserBucket, rng: RNG, count: number): UserBucket[] {
  const key = `${user.city}:${user.ageBucket}:${user.intent}`;
  const pool = buckets.get(key) || [];
  
  // Filter out self and shuffle
  const candidates = pool.filter(c => c.userId !== user.userId);
  const shuffled = rng.shuffle(candidates);
  
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

function calculateLikeProbability(
  rng: RNG,
  userA: UserBucket,
  userB: UserBucket
): number {
  // Base probability driven by selectivity
  const base = lerp(0.05, 0.35, 1 - userA.personality.traits.selectivity);
  
  // Interest overlap (simplified)
  const interestsA = new Set(userA.personality.interests);
  const interestsB = new Set(userB.personality.interests);
  const overlap = [...interestsA].filter(i => interestsB.has(i)).length;
  const maxOverlap = Math.min(interestsA.size, interestsB.size);
  const interestBonus = maxOverlap > 0 ? (overlap / maxOverlap) * 0.3 : 0;
  
  // Intent compatibility
  let intentMultiplier = 1.0;
  if (userA.intent === 'FRIENDS' && userB.intent === 'MARRIAGE') intentMultiplier = 0.1;
  if (userA.intent === 'MARRIAGE' && userB.intent === 'FRIENDS') intentMultiplier = 0.1;
  if (userA.intent === 'CASUAL' && userB.intent === 'MARRIAGE') intentMultiplier = 0.3;
  
  let probability = (base + interestBonus) * intentMultiplier;
  return Math.min(0.95, Math.max(0.01, probability));
}

export function generatePostsForDay(
  runSeed: string,
  profiles: GeneratedProfile[],
  day: number,
  startDate: Date
): GeneratedPost[] {
  const posts: GeneratedPost[] = [];
  const dayDate = new Date(startDate);
  dayDate.setDate(dayDate.getDate() + day);
  
  for (const profile of profiles) {
    const rng = makeDayRng(runSeed, profile.userId, day, 'posts');
    const { engagement } = profile.personality.traits;
    
    // Post probability based on engagement
    // High engagement: ~30% per day (2-3 posts/week)
    // Low engagement: ~10% per day (~1 post/week)
    const postProbability = lerp(0.1, 0.3, engagement);
    
    if (rng.bool(postProbability)) {
      const text = generatePostText(rng);
      const hourOffset = rng.nextInt(24);
      const createdAt = new Date(dayDate);
      createdAt.setHours(hourOffset, rng.nextInt(60), 0, 0);
      
      posts.push({
        userId: profile.userId,
        text,
        visibility: 'PUBLIC',
        createdAt
      });
    }
  }
  
  return posts;
}

export function generateLikesForDay(
  runSeed: string,
  buckets: Map<string, UserBucket[]>,
  allUsers: UserBucket[],
  day: number,
  startDate: Date
): GeneratedLike[] {
  const likes: GeneratedLike[] = [];
  const dayDate = new Date(startDate);
  dayDate.setDate(dayDate.getDate() + day);
  
  for (const user of allUsers) {
    const rng = makeDayRng(runSeed, user.userId, day, 'likes');
    const { sociability } = user.personality.traits;
    
    // Number of profiles to evaluate today
    // High sociability: 3-8 profiles
    // Low sociability: 1-3 profiles
    const evaluateCount = Math.floor(lerp(1, 8, sociability));
    const candidates = getCandidates(buckets, user, rng, evaluateCount);
    
    for (const candidate of candidates) {
      const probability = calculateLikeProbability(rng, user, candidate);
      const action = rng.bool(probability) ? 'LIKE' : 'DISLIKE';
      
      const hourOffset = rng.nextInt(24);
      const createdAt = new Date(dayDate);
      createdAt.setHours(hourOffset, rng.nextInt(60), 0, 0);
      
      likes.push({
        fromUserId: user.userId,
        toUserId: candidate.userId,
        action,
        createdAt
      });
    }
  }
  
  return likes;
}

export function deriveMatches(likes: GeneratedLike[], startDate: Date): GeneratedMatch[] {
  const matches: GeneratedMatch[] = [];
  const likeMap = new Map<string, GeneratedLike>();
  
  // Index all likes
  for (const like of likes) {
    if (like.action === 'LIKE') {
      const key = `${like.fromUserId}:${like.toUserId}`;
      likeMap.set(key, like);
    }
  }
  
  // Find mutual likes
  const processed = new Set<string>();
  for (const like of likes) {
    if (like.action !== 'LIKE') continue;
    
    const reverseKey = `${like.toUserId}:${like.fromUserId}`;
    const reverseLike = likeMap.get(reverseKey);
    
    if (reverseLike) {
      const pairKey = [like.fromUserId, like.toUserId].sort((a, b) => Number(a - b)).join(':');
      
      if (!processed.has(pairKey)) {
        processed.add(pairKey);
        
        // Match created at later of two likes
        const createdAt = like.createdAt > reverseLike.createdAt ? like.createdAt : reverseLike.createdAt;
        
        // Ensure userAId < userBId for consistency
        const [userAId, userBId] = [like.fromUserId, like.toUserId].sort((a, b) => Number(a - b));
        
        matches.push({
          userAId,
          userBId,
          state: 'ACTIVE',
          createdAt
        });
      }
    }
  }
  
  return matches;
}

export function generateMessagesForMatches(
  runSeed: string,
  matches: MatchWithConversation[],
  profilesMap: Map<bigint, GeneratedProfile>,
  day: number
): GeneratedMessage[] {
  const messages: GeneratedMessage[] = [];
  
  for (const match of matches) {
    const profileA = profilesMap.get(match.userAId);
    const profileB = profilesMap.get(match.userBId);
    if (!profileA || !profileB) continue;
    
    const rng = makeDayRng(runSeed, match.userAId, day, `messages:${match.userBId}`);
    
    // Who sends first? Higher sociability sends first
    const aStarts = profileA.personality.traits.sociability > profileB.personality.traits.sociability;
    const firstSender = aStarts ? profileA : profileB;
    const responder = aStarts ? profileB : profileA;
    
    // Response probability based on both sociability
    const responseProbability = (responder.personality.traits.sociability + 
                                  firstSender.personality.traits.sociability) / 2;
    
    // Should they message? (70-90% of matches get messages)
    if (!rng.bool(0.8)) continue;
    
    // Use the conversationId from the match
    const conversationId = match.conversationId;
    
    // Opener
    const openerText = generateMessageOpener(rng);
    const openerTime = new Date(match.createdAt);
    openerTime.setMinutes(openerTime.getMinutes() + rng.nextInt(120)); // 0-2 hours after match
    
    messages.push({
      conversationId,
      senderId: firstSender.userId,
      body: openerText,
      isSystem: false,
      createdAt: openerTime
    });
    
    // Response?
    if (rng.bool(responseProbability)) {
      const responseText = generateMessageResponse(rng);
      const responseTime = new Date(openerTime);
      responseTime.setMinutes(responseTime.getMinutes() + rng.nextInt(180)); // 0-3 hours after opener
      
      messages.push({
        conversationId,
        senderId: responder.userId,
        body: responseText,
        isSystem: false,
        createdAt: responseTime
      });
      
      // Continue conversation? 2-5 more exchanges
      const exchangeCount = 1 + rng.nextInt(4);
      let currentTime = responseTime;
      let currentSender = firstSender;
      
      for (let i = 0; i < exchangeCount; i++) {
        if (!rng.bool(0.7)) break; // 70% chance to continue
        
        const msgText = generateMessageResponse(rng);
        currentTime = new Date(currentTime);
        currentTime.setMinutes(currentTime.getMinutes() + rng.nextInt(240)); // 0-4 hours
        
        messages.push({
          conversationId,
          senderId: currentSender.userId,
          body: msgText,
          isSystem: false,
          createdAt: currentTime
        });
        
        // Switch sender
        currentSender = currentSender.userId === firstSender.userId ? responder : firstSender;
      }
    }
  }
  
  return messages;
}

export type { UserBucket, GeneratedPost, GeneratedLike, GeneratedMatch, GeneratedMessage, ActivityForDay, MatchWithConversation };
