/**
 * seedActivity - Phase B: Activity Simulation
 * Generates time-based activity (posts, likes, matches, messages)
 * Requires profiles to exist from Phase A (seedMassProfiles)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { prisma } from '../../../src/lib/prisma/client.js';
import type { GeneratedProfile, Personality } from '../lib/profileGenerator.js';
import {
  preBucketUsers,
  generatePostsForDay,
  generateLikesForDay,
  deriveMatches,
  generateMessagesForMatches,
  type UserBucket,
  type MatchWithConversation
} from '../lib/activitySimulator.js';
import { insertBatch, createProgressTracker } from '../lib/batchInserter.js';

function loadEnv() {
  if (process.env.DATABASE_URL) return;
  try {
    const raw = readFileSync(new URL('../../../.env', import.meta.url), 'utf8');
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

interface ActivityOptions {
  runSeed: string;
  startDate: Date;
  days: number;
  batchSize?: number;
  pauseMs?: number;
}

async function loadProfiles(): Promise<GeneratedProfile[]> {
  const users = await prisma.user.findMany({
    where: {
      profile: {
        isNot: null
      }
    },
    select: {
      id: true,
      email: true,
      profile: {
        select: {
          displayName: true,
          bio: true,
          birthdate: true,
          locationText: true,
          lat: true,
          lng: true,
          gender: true,
          intent: true
        }
      }
    }
  });
  
  // Load interests for each user
  const userInterests = await prisma.userInterest.findMany({
    where: { userId: { in: users.map(u => u.id) } },
    select: {
      userId: true,
      interest: {
        select: {
          key: true,
          subject: { select: { key: true } }
        }
      }
    }
  });
  
  const interestsByUser = new Map<bigint, string[]>();
  for (const ui of userInterests) {
    if (!interestsByUser.has(ui.userId)) {
      interestsByUser.set(ui.userId, []);
    }
    const key = `${ui.interest.subject.key}:${ui.interest.key}`;
    interestsByUser.get(ui.userId)!.push(key);
  }
  
  // Reconstruct personality from interests (approximation)
  const profiles: GeneratedProfile[] = users
    .filter(user => {
      // Filter out users without complete profile data
      return user.profile !== null && 
             user.profile.locationText !== null && 
             user.profile.birthdate !== null &&
             user.profile.displayName !== null &&
             user.profile.bio !== null;
    })
    .map(user => {
    // TypeScript now knows profile is not null due to filter
    const profile = user.profile!;
    
    const interests = interestsByUser.get(user.id) || [];
    const sociability = 0.5 + Math.random() * 0.3; // Approximate
    const selectivity = 0.4 + Math.random() * 0.3;
    const engagement = 0.5 + Math.random() * 0.3;
    
    const personality: Personality = {
      archetype: 'casual',
      traits: { sociability, selectivity, engagement },
      interests,
      preferredTopics: []
    };
    
    return {
      userId: user.id,
      email: user.email,
      displayName: profile.displayName!,
      bio: profile.bio!,
      birthdate: profile.birthdate!,
      locationText: profile.locationText || 'Unknown',
      lat: typeof profile.lat === 'number' ? profile.lat : Number(profile.lat) || 0,
      lng: typeof profile.lng === 'number' ? profile.lng : Number(profile.lng) || 0,
      gender: profile.gender,
      intent: profile.intent,
      personality,
      media: [],
      interests,
      completeQuiz: true
    };
  });
  
  return profiles;
}

export async function seedActivity(options: ActivityOptions) {
  const { runSeed, startDate, days, batchSize = 100, pauseMs = 20 } = options;
  
  console.log(`\n=== Phase B: Simulating ${days} days of activity ===`);
  console.log(`Run seed: ${runSeed}`);
  console.log(`Start date: ${startDate.toISOString().split('T')[0]}`);
  
  // Load existing profiles
  console.log('\n[1/2] Loading profiles...');
  const profiles = await loadProfiles();
  console.log(`  Loaded ${profiles.length} profiles`);
  
  if (profiles.length === 0) {
    console.log('\n⚠ No profiles found. Run seedMassProfiles first.');
    return;
  }
  
  // Pre-bucket users for efficient candidate sampling
  console.log('\n[2/2] Pre-bucketing users...');
  const buckets = preBucketUsers(profiles);
  const userBuckets: UserBucket[] = [];
  for (const bucket of buckets.values()) {
    userBuckets.push(...bucket);
  }
  console.log(`  Created ${buckets.size} buckets`);
  
  // Track all matches for message generation
  const allMatches = new Map<string, { userAId: bigint; userBId: bigint; state: 'ACTIVE'; createdAt: Date }>();
  
  // Day-by-day simulation
  console.log(`\n=== Simulating activity ===`);
  
  for (let day = 0; day < days; day++) {
    const dayDate = new Date(startDate);
    dayDate.setDate(dayDate.getDate() + day);
    const dateStr = dayDate.toISOString().split('T')[0];
    
    console.log(`\nDay ${day + 1}/${days} (${dateStr}):`);
    
    // Generate posts
    const posts = generatePostsForDay(runSeed, profiles, day, startDate);
    if (posts.length > 0) {
      await insertBatch('post', posts, { batchSize, pauseMs: 10 });
      console.log(`  ✓ Posts: ${posts.length}`);
    }
    
    // Generate likes
    const likes = generateLikesForDay(runSeed, buckets, userBuckets, day, startDate);
    if (likes.length > 0) {
      await insertBatch('like', likes, { batchSize: 200, pauseMs: 10 });
      const likeCount = likes.filter(l => l.action === 'LIKE').length;
      const dislikeCount = likes.filter(l => l.action === 'DISLIKE').length;
      console.log(`  ✓ Likes: ${likeCount} like, ${dislikeCount} dislike`);
    }
    
    // Derive matches from mutual likes
    const matches = deriveMatches(likes, startDate);
    if (matches.length > 0) {
      // Store in map for message generation
      for (const match of matches) {
        const key = `${match.userAId}:${match.userBId}`;
        allMatches.set(key, match);
      }
      
      // Insert matches (may need to handle duplicates)
      const matchRows = matches.map(m => ({
        userAId: m.userAId,
        userBId: m.userBId,
        state: m.state,
        createdAt: m.createdAt
      }));
      
      try {
        await insertBatch('match', matchRows, { batchSize: 50, pauseMs: 10, skipDuplicates: true });
        console.log(`  ✓ Matches: ${matches.length}`);
      } catch (err) {
        console.log(`  ⚠ Matches: ${matches.length} (some duplicates)`);
      }
    }
  }
  
  // Generate conversations and messages for all matches
  console.log(`\n=== Generating conversations ===`);
  const allMatchList = Array.from(allMatches.values());
  const profilesMap = new Map(profiles.map(p => [p.userId, p]));
  
  // Load actual match IDs from DB
  const dbMatches = await prisma.match.findMany({
    where: {
      OR: allMatchList.map(m => ({
        userAId: m.userAId,
        userBId: m.userBId
      }))
    },
    select: { id: true, userAId: true, userBId: true }
  });
  
  const matchIdMap = new Map<string, bigint>();
  for (const match of dbMatches) {
    const key = `${match.userAId}:${match.userBId}`;
    matchIdMap.set(key, match.id);
  }
  
  // Create conversations with proper match IDs
  const conversationRows = allMatchList
    .map(m => {
      const key = `${m.userAId}:${m.userBId}`;
      const matchId = matchIdMap.get(key);
      if (!matchId) return null;
      
      return {
        userAId: m.userAId,
        userBId: m.userBId,
        matchId
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
  
  if (conversationRows.length > 0) {
    try {
      await insertBatch('conversation', conversationRows, {
        batchSize: 100,
        pauseMs: 10,
        skipDuplicates: true
      });
      console.log(`  ✓ Conversations: ${conversationRows.length}`);
    } catch (err) {
      console.log(`  ⚠ Conversations: ${conversationRows.length} (some may exist)`);
    }
  }
  
  // Load conversation IDs
  const conversations = await prisma.conversation.findMany({
    where: {
      OR: allMatchList.map(m => ({
        userAId: m.userAId,
        userBId: m.userBId
      }))
    },
    select: { id: true, userAId: true, userBId: true }
  });
  
  const conversationMap = new Map<string, bigint>();
  for (const conv of conversations) {
    const key = `${conv.userAId}:${conv.userBId}`;
    conversationMap.set(key, conv.id);
  }
  
  // Generate messages with real conversation IDs
  console.log(`\n=== Generating messages ===`);
  const allMessages: Array<{
    conversationId: bigint;
    senderId: bigint;
    body: string;
    isSystem: boolean;
    createdAt: Date;
  }> = [];
  
  // Split matches into chunks to avoid memory issues
  const chunkSize = 100;
  let totalMessagesGenerated = 0;
  
  for (let i = 0; i < allMatchList.length; i += chunkSize) {
    const matchChunk = allMatchList.slice(i, Math.min(i + chunkSize, allMatchList.length));
    
    // Create MatchWithConversation objects
    const matchesWithConversations: MatchWithConversation[] = [];
    for (const match of matchChunk) {
      const convKey = `${match.userAId}:${match.userBId}`;
      const conversationId = conversationMap.get(convKey);
      if (conversationId) {
        matchesWithConversations.push({ ...match, conversationId });
      }
    }
    
    // Generate messages for this chunk
    const messages = generateMessagesForMatches(
      runSeed,
      matchesWithConversations,
      profilesMap,
      0
    );
    
    allMessages.push(...messages);
    totalMessagesGenerated += messages.length;
    
    // Insert messages in batches
    if (allMessages.length >= 500) {
      await insertBatch('message', allMessages, { batchSize: 100, pauseMs: 10 });
      console.log(`  ✓ Messages batch: ${allMessages.length} (total: ${totalMessagesGenerated})`);
      allMessages.length = 0; // Clear array
    }
  }
  
  // Insert remaining messages
  if (allMessages.length > 0) {
    await insertBatch('message', allMessages, { batchSize: 100, pauseMs: 10 });
    console.log(`  ✓ Messages final: ${allMessages.length}`);
  }
  
  console.log(`  ✓ Total messages generated: ${totalMessagesGenerated}`);
  
  // Summary
  const totalMatches = allMatchList.length;
  const totalConversations = conversations.length;
  const totalMessages = await prisma.message.count();
  const totalPosts = await prisma.post.count();
  const totalLikes = await prisma.like.count({ where: { action: 'LIKE' } });
  
  console.log(`\n✓ Phase B complete:`);
  console.log(`  - ${totalPosts} posts`);
  console.log(`  - ${totalLikes} likes`);
  console.log(`  - ${totalMatches} matches`);
  console.log(`  - ${totalConversations} conversations`);
  console.log(`  - ${totalMessages} messages`);
  
  if (totalLikes > 0) {
    const matchRate = ((totalMatches / totalLikes) * 100).toFixed(1);
    console.log(`  - ${matchRate}% match rate (target: 5-15%)`);
  }
  
  return {
    runSeed,
    days,
    stats: {
      posts: totalPosts,
      likes: totalLikes,
      matches: totalMatches,
      conversations: totalConversations,
      messages: totalMessages
    }
  };
}

function parseArg(flag: string, fallback: string): string {
  const raw = process.argv.find(arg => arg.startsWith(`${flag}=`));
  if (!raw) return fallback;
  const value = raw.split('=')[1];
  return value?.length ? value : fallback;
}

function parseIntArg(flag: string, fallback: number): number {
  const raw = process.argv.find(arg => arg.startsWith(`${flag}=`));
  if (!raw) return fallback;
  const value = raw.split('=')[1];
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function main() {
  const runSeed = parseArg('--runSeed', `seed-${Date.now()}`);
  const startDateStr = parseArg('--startDate', '2024-01-01');
  const days = parseIntArg('--days', 30);
  
  const startDate = new Date(startDateStr);
  if (isNaN(startDate.getTime())) {
    throw new Error(`Invalid start date: ${startDateStr}`);
  }
  
  await seedActivity({ runSeed, startDate, days });
}

const isDirect = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirect) {
  main()
    .catch(err => {
      console.error('Seed failed:', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
