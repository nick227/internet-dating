/**
 * Validation utility to check seeded data integrity
 * Run after seeding to verify data quality
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { prisma } from '../../../src/lib/prisma/client.js';

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

interface ValidationResult {
  check: string;
  status: 'pass' | 'warn' | 'fail';
  value: string | number;
  expected?: string;
  message?: string;
}

async function validateSeeding(): Promise<void> {
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║   SEEDING VALIDATION                       ║');
  console.log('╚════════════════════════════════════════════╝\n');
  
  const results: ValidationResult[] = [];
  
  // Check 1: Users == Profiles
  const userCount = await prisma.user.count();
  const profileCount = await prisma.profile.count();
  results.push({
    check: 'Users equal Profiles',
    status: userCount === profileCount ? 'pass' : 'fail',
    value: `${userCount} users, ${profileCount} profiles`,
    expected: 'Equal counts'
  });
  
  // Check 2: All profiles have location
  const profilesWithLocation = await prisma.profile.count({
    where: { lat: { not: null }, lng: { not: null } }
  });
  const locationPct = (profilesWithLocation / Math.max(1, profileCount)) * 100;
  results.push({
    check: 'Profiles with location',
    status: locationPct > 95 ? 'pass' : 'warn',
    value: `${locationPct.toFixed(1)}%`,
    expected: '>95%'
  });
  
  // Check 3: Interest distribution
  const userInterestCount = await prisma.userInterest.count();
  const avgInterests = userInterestCount / Math.max(1, userCount);
  results.push({
    check: 'Avg interests per user',
    status: avgInterests >= 3 && avgInterests <= 8 ? 'pass' : 'warn',
    value: avgInterests.toFixed(1),
    expected: '3-8'
  });
  
  // Check 4: Quiz completion rate
  const quizResultCount = await prisma.quizResult.count();
  const quizCompletionPct = (quizResultCount / Math.max(1, userCount)) * 100;
  results.push({
    check: 'Quiz completion rate',
    status: quizCompletionPct >= 75 && quizCompletionPct <= 95 ? 'pass' : 'warn',
    value: `${quizCompletionPct.toFixed(1)}%`,
    expected: '80-90%'
  });
  
  // Check 5: Match rate
  const likeCount = await prisma.like.count({ where: { action: 'LIKE' } });
  const matchCount = await prisma.match.count();
  const matchRate = likeCount > 0 ? (matchCount / likeCount) * 100 : 0;
  results.push({
    check: 'Match rate (likes → matches)',
    status: matchRate >= 5 && matchRate <= 15 ? 'pass' : 'warn',
    value: `${matchRate.toFixed(1)}%`,
    expected: '5-15%'
  });
  
  // Check 6: Message penetration
  const conversationCount = await prisma.conversation.count();
  const messageCount = await prisma.message.count();
  const conversationsWithMessagesCount = await prisma.message.groupBy({
    by: ['conversationId'],
    _count: true
  });
  const msgPenetration = matchCount > 0 
    ? (conversationsWithMessagesCount.length / matchCount) * 100 
    : 0;
  results.push({
    check: 'Matches with messages',
    status: msgPenetration >= 60 && msgPenetration <= 95 ? 'pass' : 'warn',
    value: `${msgPenetration.toFixed(1)}%`,
    expected: '70-90%'
  });
  
  // Check 7: Avg messages per conversation
  const avgMessages = conversationCount > 0 ? messageCount / conversationCount : 0;
  results.push({
    check: 'Avg messages per conversation',
    status: avgMessages >= 2 && avgMessages <= 10 ? 'pass' : 'warn',
    value: avgMessages.toFixed(1),
    expected: '2-8'
  });
  
  // Check 8: Posts exist
  const postCount = await prisma.post.count();
  const avgPosts = userCount > 0 ? postCount / userCount : 0;
  results.push({
    check: 'Avg posts per user',
    status: avgPosts >= 0.5 && avgPosts <= 5 ? 'pass' : 'warn',
    value: avgPosts.toFixed(1),
    expected: '1-3'
  });
  
  // Check 9: Media attachments
  const mediaCount = await prisma.media.count();
  const avgMedia = userCount > 0 ? mediaCount / userCount : 0;
  results.push({
    check: 'Avg media per user',
    status: avgMedia >= 3 && avgMedia <= 6 ? 'pass' : 'warn',
    value: avgMedia.toFixed(1),
    expected: '3-5'
  });
  
  // Print results
  console.log('Validation Results:\n');
  
  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;
  
  for (const result of results) {
    let icon = '✓';
    let color = '';
    if (result.status === 'warn') {
      icon = '⚠';
      warnCount++;
    } else if (result.status === 'fail') {
      icon = '✗';
      failCount++;
    } else {
      passCount++;
    }
    
    const expected = result.expected ? ` (expected: ${result.expected})` : '';
    console.log(`  ${icon} ${result.check}: ${result.value}${expected}`);
    if (result.message) {
      console.log(`    → ${result.message}`);
    }
  }
  
  // Summary
  console.log('\n─────────────────────────────────────────────');
  console.log(`Summary: ${passCount} passed, ${warnCount} warnings, ${failCount} failed`);
  console.log('─────────────────────────────────────────────\n');
  
  // Overall status
  if (failCount > 0) {
    console.log('❌ Validation FAILED - Critical issues found');
    process.exitCode = 1;
  } else if (warnCount > 0) {
    console.log('⚠️  Validation PASSED with warnings');
  } else {
    console.log('✅ Validation PASSED - All checks successful!');
  }
  
  // Database stats
  console.log('\n=== Database Statistics ===');
  console.log(`Users: ${userCount}`);
  console.log(`Profiles: ${profileCount}`);
  console.log(`Interests: ${userInterestCount}`);
  console.log(`Quiz Results: ${quizResultCount}`);
  console.log(`Posts: ${postCount}`);
  console.log(`Likes: ${likeCount}`);
  console.log(`Matches: ${matchCount}`);
  console.log(`Conversations: ${conversationCount}`);
  console.log(`Messages: ${messageCount}`);
  console.log(`Media: ${mediaCount}`);
}

async function main() {
  await validateSeeding();
}

const isDirect = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirect) {
  main()
    .catch(err => {
      console.error('Validation failed:', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { validateSeeding };
