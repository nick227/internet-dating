import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma/client.js';

type SeedProfile = {
  email: string;
  password: string;
  displayName: string;
  bio: string;
  birthdate: string;
  locationText: string;
  gender: 'MALE' | 'FEMALE' | 'NONBINARY' | 'OTHER' | 'UNSPECIFIED';
  intent: 'FRIENDS' | 'CASUAL' | 'LONG_TERM' | 'MARRIAGE' | 'UNSPECIFIED';
  images: { url: string; thumbUrl?: string }[];
  postText: string;
};

const seeds: SeedProfile[] = [
  {
    email: 'seed.aria@example.com',
    password: 'Password123!',
    displayName: 'Aria',
    bio: 'Night-market foodie, synthwave playlists, and sunrise hikes. Looking for someone who plans the next adventure.',
    birthdate: '1994-06-12',
    locationText: 'Austin, TX',
    gender: 'FEMALE',
    intent: 'LONG_TERM',
    postText: 'Best weekends are tacos, live music, and big skies.',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1524503033411-f7a2fe8c7f74?auto=format&fit=crop&w=1400&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1524503033411-f7a2fe8c7f74?auto=format&fit=crop&w=700&q=70'
      },
      {
        url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=1400&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=700&q=70'
      },
      {
        url: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1400&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=700&q=70'
      }
    ]
  },
  {
    email: 'seed.milo@example.com',
    password: 'Password123!',
    displayName: 'Milo',
    bio: 'Museum nerd, espresso snob, and amateur street photographer. I collect tiny stories from big cities.',
    birthdate: '1991-11-03',
    locationText: 'Brooklyn, NY',
    gender: 'MALE',
    intent: 'CASUAL',
    postText: 'Quiet corners, loud laughter, and a camera that never sleeps.',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=1400&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=700&q=70'
      },
      {
        url: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=1400&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=700&q=70'
      },
      {
        url: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=1400&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=700&q=70'
      }
    ]
  },
  {
    email: 'seed.sage@example.com',
    password: 'Password123!',
    displayName: 'Sage',
    bio: 'Climbing gyms, indie films, and a soft spot for cozy bookstores. Looking for someone curious.',
    birthdate: '1996-02-21',
    locationText: 'Denver, CO',
    gender: 'NONBINARY',
    intent: 'FRIENDS',
    postText: 'Tell me your favorite trail or your favorite book.',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1400&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=700&q=70'
      },
      {
        url: 'https://images.unsplash.com/photo-1524502397800-2eeaad7c3fe5?auto=format&fit=crop&w=1400&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1524502397800-2eeaad7c3fe5?auto=format&fit=crop&w=700&q=70'
      },
      {
        url: 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=1400&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=700&q=70'
      }
    ]
  }
];

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

async function seedProfile(seed: SeedProfile) {
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
          gender: seed.gender,
          intent: seed.intent,
          isVisible: true
        }
      }
    },
    select: { id: true }
  });

  await prisma.profile.upsert({
    where: { userId: user.id },
    update: {
      displayName: seed.displayName,
      bio: seed.bio,
      birthdate: new Date(seed.birthdate),
      locationText: seed.locationText,
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
      gender: seed.gender,
      intent: seed.intent,
      isVisible: true
    }
  });

  await resetUserContent(user.id);

  const media = await Promise.all(
    seed.images.map((img) =>
      prisma.media.create({
        data: {
          userId: user.id,
          ownerUserId: user.id,
          status: 'READY',
          visibility: 'PUBLIC',
          type: 'IMAGE',
          url: img.url,
          thumbUrl: img.thumbUrl ?? null
        },
        select: { id: true }
      })
    )
  );

  await prisma.post.create({
    data: {
      userId: user.id,
      visibility: 'PUBLIC',
      text: seed.postText,
      media: {
        create: media.map((m, idx) => ({
          order: idx,
          mediaId: m.id
        }))
      }
    },
    select: { id: true }
  });

  return user.id;
}

async function main() {
  const ids: bigint[] = [];
  for (const seed of seeds) {
    const id = await seedProfile(seed);
    ids.push(id);
  }
  console.log(`Seeded ${ids.length} profiles: ${ids.map((id) => id.toString()).join(', ')}`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
