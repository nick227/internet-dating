# Scripts Directory Reorganization Plan

## Current Problems
1. **Flat structure** - 24+ files in root, hard to navigate
2. **Mixed purposes** - seeding, testing, admin, jobs all together
3. **Legacy code** - Old seed scripts (seedProfiles, seedFeedDemo) mixed with new
4. **Unclear ownership** - Hard to know which files belong to which system
5. **Duplicate files** - testFeedApi.js vs testFeedAPI.ts

## Proposed Structure

```
scripts/
├── seeding/                    # 🌱 Seeding System
│   ├── core/                  # Main seed scripts (production)
│   │   ├── seedAll.ts         ← scripts/seedAll.ts
│   │   ├── seedMassProfiles.ts ← scripts/seedMassProfiles.ts
│   │   ├── seedActivity.ts    ← scripts/seedActivity.ts
│   │   └── resetDatabase.ts   ← scripts/resetDatabase.ts
│   │
│   ├── lib/                   # Seeding utilities (KEEP AS IS - already perfect!)
│   │   ├── prng.ts
│   │   ├── mockDataGenerator.ts
│   │   ├── profileGenerator.ts
│   │   ├── activitySimulator.ts
│   │   └── batchInserter.ts
│   │
│   ├── data/                  # Seed data
│   │   └── QUIZ_SEEDS.ts      ← scripts/QUIZ_SEEDS.ts
│   │
│   ├── validation/            # Validation tools
│   │   └── validateSeeding.ts ← scripts/validateSeeding.ts
│   │
│   └── legacy/                # Old/deprecated seed scripts (ARCHIVE)
│       ├── seedProfiles.ts    ← scripts/seedProfiles.ts
│       ├── seedFeedDemo.ts    ← scripts/seedFeedDemo.ts
│       ├── seedInterests.ts   ← scripts/seedInterests.ts
│       └── seedQuizzes.ts     ← scripts/seedQuizzes.ts
│
├── jobs/                       # 🔧 Job System (Already well-organized!)
│   ├── core/                  # Job implementations
│   │   ├── matchScores.ts
│   │   ├── compatibility.ts
│   │   ├── buildUserTraits.ts
│   │   ├── interestRelationships.ts
│   │   ├── searchableUser.ts
│   │   ├── quizAnswerStats.ts
│   │   ├── feedPresort.ts
│   │   ├── feedPresortCleanup.ts
│   │   ├── trending.ts
│   │   ├── affinity.ts
│   │   ├── contentFeatures.ts
│   │   ├── profileSearchIndex.ts
│   │   ├── userInterestSets.ts
│   │   ├── mediaMetadata.ts
│   │   ├── mediaMetadataBatch.ts
│   │   ├── mediaOrphanCleanup.ts
│   │   └── statsReconcile.ts
│   │
│   ├── lib/                   # Job utilities (KEEP AS IS)
│   │   ├── registry.ts
│   │   ├── types.ts
│   │   ├── utils.ts
│   │   └── dependencyResolver.ts
│   │
│   ├── runners/               # Job execution scripts
│   │   ├── runJobs.ts         ← scripts/runJobs.ts
│   │   ├── recomputeMatchScores.ts ← scripts/recomputeMatchScores.ts
│   │   └── recomputeCompatibility.ts ← scripts/recomputeCompatibility.ts
│   │
│   └── README.md              (KEEP - excellent documentation!)
│
├── admin/                      # 👤 Admin & Setup
│   ├── createAdmin.ts         ← scripts/createAdmin.ts
│   └── runMigrations.ts       ← scripts/runMigrations.ts
│
├── testing/                    # 🧪 Test & Debug Scripts
│   ├── testFeedAPI.ts         ← scripts/testFeedAPI.ts
│   ├── testMatchScores.ts     ← scripts/testMatchScores.ts
│   ├── testFollow.ts          ← scripts/testFollow.ts
│   ├── testPresort.ts         ← scripts/testPresort.ts
│   └── apiSanity.ts           ← scripts/apiSanity.ts
│
├── maintenance/                # 🔨 Maintenance Scripts
│   ├── backfillStats.ts       ← scripts/backfillStats.ts
│   ├── verifyQuizTraits.ts    ← scripts/verifyQuizTraits.ts
│   ├── verifyUserTraits.ts    ← scripts/verifyUserTraits.ts
│   └── seed-quiz-tags.ts      ← scripts/seed-quiz-tags.ts
│
└── _archive/                   # 📦 Deprecated/Unused
    └── testFeedApi.js         ← scripts/testFeedApi.js (duplicate, JS version)
```

## Benefits

### 1. **Clear Separation by Purpose**
- Seeding scripts in one place
- Job system self-contained
- Admin tools grouped
- Testing isolated

### 2. **Easy Navigation**
- New devs can find files quickly
- Clear ownership of functionality
- Related files together

### 3. **Shared Code Visibility**
- `/seeding/lib/` - Seeding utilities
- `/jobs/lib/` - Job utilities
- Clear boundaries

### 4. **Legacy Management**
- Old seed scripts archived but accessible
- New scripts clearly identified
- No confusion about which to use

### 5. **Maintainability**
- Add new seeds: `seeding/core/`
- Add new jobs: `jobs/core/`
- Add new tests: `testing/`
- Clear patterns to follow

## Import Path Updates

### Before:
```typescript
import { prisma } from '../src/lib/prisma/client.js';
import { generateProfiles } from './lib/profileGenerator.js';
```

### After:
```typescript
import { prisma } from '../../src/lib/prisma/client.js';
import { generateProfiles } from '../lib/profileGenerator.js';
```

## Package.json Script Updates

### Before:
```json
{
  "seed:all": "tsx scripts/seedAll.ts",
  "seed:mass": "tsx scripts/seedMassProfiles.ts",
  "seed:reset": "tsx scripts/resetDatabase.ts"
}
```

### After:
```json
{
  "seed:all": "tsx scripts/seeding/core/seedAll.ts",
  "seed:mass": "tsx scripts/seeding/core/seedMassProfiles.ts",
  "seed:reset": "tsx scripts/seeding/core/resetDatabase.ts",
  "seed:validate": "tsx scripts/seeding/validation/validateSeeding.ts",
  "admin:create": "tsx scripts/admin/createAdmin.ts",
  "jobs:run": "tsx scripts/jobs/runners/runJobs.ts"
}
```

## Migration Steps

1. ✅ Create new directory structure
2. ✅ Move files to new locations
3. ✅ Update all import paths
4. ✅ Update package.json scripts
5. ✅ Test all scripts work
6. ✅ Update documentation
7. ✅ Archive unused files

## Files to Archive

- `testFeedApi.js` - Duplicate JS version (keep TS version)
- Legacy seed scripts moved to `/seeding/legacy/` (functional but deprecated)

## Timeline

- **Phase 1**: Create structure (5 min)
- **Phase 2**: Move files (10 min)
- **Phase 3**: Update imports (15 min)
- **Phase 4**: Test & verify (10 min)
- **Total**: ~40 minutes

## Success Criteria

✅ All scripts run successfully from new locations
✅ Package.json scripts work
✅ Imports resolve correctly
✅ Clear documentation of structure
✅ Easy for new devs to understand

Ready to implement?
