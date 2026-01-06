import { prisma } from '../lib/prisma/client.js';
import { Prisma } from '@prisma/client';

type ProfileSearchIndexJobOptions = {
  userId?: bigint | null;
  userBatchSize?: number;
  pauseMs?: number;
};

const DEFAULT_CONFIG = {
  userBatchSize: 100,
  pauseMs: 50
};

function sleep(ms: number) {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function calculateAge(birthdate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthdate.getFullYear();
  const monthDiff = today.getMonth() - birthdate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthdate.getDate())) {
    age--;
  }
  return age;
}

function calculateAgeBucket(age: number): number | null {
  if (age < 18) return null;
  return Math.floor((age - 18) / 5); // 0=18-22, 1=23-27, 2=28-32, etc.
}

function parseLocation(locationText: string | null): { city: string | null; state: string | null; country: string | null } {
  if (!locationText) return { city: null, state: null, country: null };
  
  // Simple parsing: "City, State" or "City, State, Country"
  const parts = locationText.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return { city: locationText, state: null, country: null };
  if (parts.length === 1) return { city: parts[0], state: null, country: null };
  if (parts.length === 2) return { city: parts[0], state: parts[1], country: null };
  return { city: parts[0], state: parts[1], country: parts.slice(2).join(', ') };
}

function extractTop5Keywords(top5Lists: Array<{ title: string; items: Array<{ text: string }> }>): string[] {
  const keywords = new Set<string>();
  
  for (const list of top5Lists) {
    // Extract from title
    const titleWords = list.title
      .toLowerCase()
      .split(/\W+/)
      .filter(w => w.length >= 3);
    titleWords.forEach(w => keywords.add(w));
    
    // Extract from items
    for (const item of list.items) {
      const itemWords = item.text
        .toLowerCase()
        .split(/\W+/)
        .filter(w => w.length >= 3);
      itemWords.forEach(w => keywords.add(w));
    }
  }
  
  return Array.from(keywords).slice(0, 50); // Cap at 50 keywords
}

export async function buildProfileSearchIndex(options: ProfileSearchIndexJobOptions = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  
  if (config.userId) {
    // Single user
    await buildProfileSearchIndexForUser(config.userId);
  } else {
    // All users in batches
    let skip = 0;
    let hasMore = true;
    
    while (hasMore) {
      const users = await prisma.user.findMany({
        where: { deletedAt: null },
        skip,
        take: config.userBatchSize,
        include: {
          profile: {
            include: {
              top5Lists: {
                include: {
                  items: {
                    orderBy: { order: 'asc' }
                  }
                },
                take: 10
              }
            }
          },
          interests: {
            include: {
              interest: true
            }
          },
          traits: true
        }
      });
      
      if (users.length === 0) {
        hasMore = false;
        break;
      }
      
      for (const user of users) {
        await buildProfileSearchIndexForUser(user.id, user);
      }
      
      skip += config.userBatchSize;
      await sleep(config.pauseMs);
    }
  }
}

async function buildProfileSearchIndexForUser(userId: bigint, userData?: any) {
  const user = userData || await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: {
        include: {
          top5Lists: {
            include: {
              items: {
                orderBy: { order: 'asc' }
              }
            },
            take: 10
          }
        }
      },
      interests: {
        include: {
          interest: true
        }
      },
      traits: true
    }
  });
  
  if (!user || !user.profile) {
    // Delete index entry if profile doesn't exist
    await prisma.profileSearchIndex.deleteMany({
      where: { userId }
    });
    return;
  }
  
  const age = user.profile.birthdate ? calculateAge(user.profile.birthdate) : null;
  const ageBucket = age !== null ? calculateAgeBucket(age) : null;
  const locationTokens = parseLocation(user.profile.locationText);
  
  const traitSummary = user.traits.reduce((acc: Record<string, number>, t: any) => {
    acc[t.traitKey] = Number(t.value);
    return acc;
  }, {});
  
  const top5Keywords = extractTop5Keywords(user.profile.top5Lists || []);
  
  await prisma.profileSearchIndex.upsert({
    where: { userId },
    create: {
      userId,
      displayName: user.profile.displayName,
      bio: user.profile.bio,
      locationText: user.profile.locationText,
      gender: user.profile.gender,
      intent: user.profile.intent,
      age,
      ageBucket,
      birthdate: user.profile.birthdate,
      locationCity: locationTokens.city,
      locationState: locationTokens.state,
      locationCountry: locationTokens.country,
      interestCount: user.interests.length,
      traitCount: user.traits.length,
      traitSummary: Object.keys(traitSummary).length > 0 ? traitSummary : Prisma.JsonNull,
      top5Keywords: top5Keywords.length > 0 ? top5Keywords : Prisma.JsonNull,
      isVisible: user.profile.isVisible,
      isDeleted: user.deletedAt !== null,
      accountCreatedAt: user.createdAt
    },
    update: {
      displayName: user.profile.displayName,
      bio: user.profile.bio,
      locationText: user.profile.locationText,
      gender: user.profile.gender,
      intent: user.profile.intent,
      age,
      ageBucket,
      birthdate: user.profile.birthdate,
      locationCity: locationTokens.city,
      locationState: locationTokens.state,
      locationCountry: locationTokens.country,
      interestCount: user.interests.length,
      traitCount: user.traits.length,
      traitSummary: Object.keys(traitSummary).length > 0 ? traitSummary : Prisma.JsonNull,
      top5Keywords: top5Keywords.length > 0 ? top5Keywords : Prisma.JsonNull,
      isVisible: user.profile.isVisible,
      isDeleted: user.deletedAt !== null,
      accountCreatedAt: user.createdAt,
      indexedAt: new Date()
    }
  });
}

export async function buildProfileSearchIndexForAll(options: ProfileSearchIndexJobOptions = {}) {
  return buildProfileSearchIndex(options);
}
