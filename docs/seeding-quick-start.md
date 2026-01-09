# Seeding Quick Start Guide

## TL;DR - Get Started in 30 Seconds

```bash
cd backend

# Generate 100 profiles with 7 days of activity
node scripts/seedAll.ts --count=100 --activityDays=7

# Generate 500 profiles with 30 days of activity (production-like)
node scripts/seedAll.ts --count=500 --activityDays=30 --runSeed=prod-sim
```

That's it! The system will:
1. ✅ Create profiles with realistic data
2. ✅ Simulate activity (posts, likes, matches, messages)
3. ✅ Run jobs to compute match scores and compatibility

## Common Commands

### Quick Test (100 profiles, fast)
```bash
node scripts/seedAll.ts --count=100 --activityDays=7 --skipJobs
```
*Takes ~2 minutes, skips jobs for speed*

### Production-like Dataset (500 profiles)
```bash
node scripts/seedAll.ts --count=500 --activityDays=30
```
*Takes ~5-8 minutes, includes all jobs*

### Large Scale Test (1000 profiles)
```bash
node scripts/seedAll.ts --count=1000 --activityDays=30
```
*Takes ~10-15 minutes*

### Profiles Only (No Activity)
```bash
node scripts/seedMassProfiles.ts --runSeed=demo-2024 --count=500
```
*Takes ~1 minute*

### Activity Only (For Existing Profiles)
```bash
node scripts/seedActivity.ts --runSeed=demo-2024 --startDate=2024-01-01 --days=30
```
*Takes ~3 minutes*

## What Gets Created

### Profiles (Phase A)
- Users with emails like `test.user1@example.com`
- Complete profiles (name, bio, location, age, gender, intent)
- 3-5 images per profile (placeholder URLs)
- 3-8 interests per user
- 85% complete personality quizzes

### Activity (Phase B)
- Posts: 1-3 per week per active user
- Likes: personality-driven, compatibility-based
- Matches: ~8-12% of likes become matches
- Conversations: 70-90% of matches
- Messages: 2-8 messages per conversation

### Jobs (Phase C)
- Match scores computed
- Compatibility scores computed
- Searchable user snapshots (if job exists)
- Interest relationships (if job exists)

## Key Features

### Deterministic & Reproducible
Same `--runSeed` produces identical data every time:
```bash
node scripts/seedAll.ts --count=100 --runSeed=test-123
# Run again with same seed = identical output
node scripts/seedAll.ts --count=100 --runSeed=test-123
```

### Append-Safe
Can add more activity without regenerating profiles:
```bash
# Initial seed
node scripts/seedMassProfiles.ts --runSeed=demo --count=500
node scripts/seedActivity.ts --runSeed=demo --startDate=2024-01-01 --days=30

# Add 30 more days later
node scripts/seedActivity.ts --runSeed=demo --startDate=2024-02-01 --days=30
```

### Realistic Behavior
- Personalities drive all actions (posts, likes, messages)
- Compatible users more likely to match
- Activity patterns emerge naturally (not hardcoded)

## Reset Database

### Full Reset
```sql
TRUNCATE TABLE users CASCADE;
TRUNCATE TABLE interest_subjects CASCADE;
```

### Activity Only (Keep Profiles)
```sql
DELETE FROM messages;
DELETE FROM conversations;
DELETE FROM matches;
DELETE FROM likes;
DELETE FROM posts;
```

## Useful Flags

| Flag | Purpose | Default |
|------|---------|---------|
| `--count=N` | Number of profiles | 100 |
| `--activityDays=N` | Days to simulate | 30 |
| `--runSeed=STRING` | Seed for reproducibility | `seed-{timestamp}` |
| `--startDate=YYYY-MM-DD` | Activity start date | 2024-01-01 |
| `--skipActivity` | Skip activity generation | false |
| `--skipJobs` | Skip job execution | false |
| `--batchSize=N` | DB batch size | 50-200 |

## Validation Queries

Check your seeded data:

```sql
-- Profile count
SELECT COUNT(*) as total_profiles FROM profiles;

-- Activity summary
SELECT 
  (SELECT COUNT(*) FROM posts) as posts,
  (SELECT COUNT(*) FROM likes WHERE action = 'LIKE') as likes,
  (SELECT COUNT(*) FROM matches) as matches,
  (SELECT COUNT(*) FROM messages) as messages;

-- Match rate (should be 5-15%)
SELECT 
  COUNT(*) * 100.0 / (SELECT COUNT(*) FROM likes WHERE action = 'LIKE') as match_rate_pct
FROM matches;

-- Average interests per user (should be ~5)
SELECT AVG(interest_count) as avg_interests
FROM (
  SELECT COUNT(*) as interest_count 
  FROM user_interests 
  GROUP BY user_id
) as counts;
```

## Troubleshooting

**"No profiles found" error:**
→ Run `seedMassProfiles` first

**Slow performance:**
→ Use `--batchSize=25` and `--pauseMs=50`

**Out of memory:**
→ Reduce `--count` or `--activityDays`

**Need help:**
→ See `docs/seeding-process-summary.md` for full details

## Examples

### Scenario 1: Local Development Testing
```bash
# Quick dataset for development
node scripts/seedAll.ts --count=50 --activityDays=7 --skipJobs
```

### Scenario 2: Algorithm Testing
```bash
# Medium dataset with full jobs
node scripts/seedAll.ts --count=300 --activityDays=14
```

### Scenario 3: Load Testing
```bash
# Large dataset for stress testing
node scripts/seedAll.ts --count=1000 --activityDays=30 --skipJobs
# Run jobs separately when needed
```

### Scenario 4: Demo Data
```bash
# Reproducible demo data
node scripts/seedAll.ts --count=200 --activityDays=30 --runSeed=demo-2024
```

### Scenario 5: Incremental Activity
```bash
# Month 1
node scripts/seedAll.ts --count=500 --activityDays=30 --runSeed=prod --startDate=2024-01-01

# Month 2 (add more activity)
node scripts/seedActivity.ts --runSeed=prod --startDate=2024-02-01 --days=30

# Month 3
node scripts/seedActivity.ts --runSeed=prod --startDate=2024-03-01 --days=30
```

## Performance Expectations

| Profiles | Activity Days | Time | DB Size |
|----------|---------------|------|---------|
| 100 | 7 | ~2 min | ~50 MB |
| 500 | 30 | ~8 min | ~200 MB |
| 1000 | 30 | ~15 min | ~400 MB |
| 1000 | 90 | ~30 min | ~800 MB |

*Times on Railway/Local Postgres, may vary*

## Next Steps

1. Run your first seed: `node scripts/seedAll.ts --count=100`
2. Check the data in your app
3. Verify metrics with validation queries
4. Scale up as needed

For more details, see `docs/seeding-process-summary.md` or `docs/site-seeding-plan.md`
