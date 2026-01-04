import { prisma } from '../../lib/prisma/client.js';
import { Prisma } from '@prisma/client';

/**
 * ARCHITECTURAL RULE: Search reads from exactly one authoritative surface.
 * If a field is not in ProfileSearchIndex, it is not searchable.
 * 
 * Exceptions (explicitly allowed):
 * 1. UserTrait queries for trait filtering (by design, materialized tables don't contain dynamic trait ranges)
 * 2. Final media URL hydration join (transitional, with hard caps - see API endpoint comments)
 */

// Feature flag to enforce materialized search architecture
export const FORCE_MATERIALIZED_SEARCH = process.env.FORCE_MATERIALIZED_SEARCH !== 'false';

/**
 * Architecture enforcement function (no-op at runtime).
 * 
 * Architecture enforcement is done via static analysis test:
 * See: backend/src/services/search/__tests__/architecture.test.ts
 * 
 * Runtime checking is not feasible - stack traces don't capture import statements.
 * The test file scans source code directly to prevent architectural violations.
 */
export function assertNoLiveModelAccess(): void {
  // No-op: Enforcement handled by architecture.test.ts
}
export type SearchSort = 'newest' | 'age';

export interface TraitFilter {
  key: string;
  min?: number;
  max?: number;
  group?: string;
}

export interface SearchParams {
  // Text Search
  q?: string;
  
  // Profile Filters
  gender?: string[];
  intent?: string[];
  ageMin?: number;
  ageMax?: number;
  location?: string;
  
  // Trait Filters (MAX 3)
  traits?: TraitFilter[];
  
  // Interest Filters (MAX 5)
  interests?: string[];
  interestSubjects?: string[];
  
  // Top5 Filters
  top5Query?: string;
  top5Type?: 'title' | 'item';
  
  // Sorting
  sort?: SearchSort;
  
  // Pagination
  limit?: number;
  cursor?: string;
}

interface SearchCursor {
  userId: string;
  sortValue?: number;
  userIdNum?: string;
}

export class ProfileSearchQueryBuilder {
  private baseUserIds: bigint[] = [];
  private viewerId?: bigint;
  private filters: SearchParams;
  
  constructor(filters: SearchParams, viewerId?: bigint) {
    this.filters = filters;
    this.viewerId = viewerId;
  }
  
  async initialize(): Promise<void> {
    // Step 1: Canonical base filter (viewer-agnostic, guaranteed safety)
    const baseSearchable = await prisma.searchableUser.findMany({
      where: {
        isVisible: true,
        isDeleted: false
      },
      select: { userId: true }
    });
    this.baseUserIds = baseSearchable.map(x => x.userId);
    
    // Step 2: Apply block filtering at query time (viewer-specific, sparse)
    if (this.viewerId) {
      const blocks = await prisma.userBlock.findMany({
        where: {
          OR: [{ blockerId: this.viewerId }, { blockedId: this.viewerId }]
        },
        select: {
          blockerId: true,
          blockedId: true
        }
      });
      const blockedUserIds = new Set(
        blocks.map(b => b.blockerId === this.viewerId! ? b.blockedId : b.blockerId)
      );
      // Exclude blocked users (blocks are sparse, this stays cheap)
      this.baseUserIds = this.baseUserIds.filter(id => !blockedUserIds.has(id));
    }
  }
  
  async buildWhere(): Promise<Prisma.ProfileSearchIndexWhereInput> {
    const where: Prisma.ProfileSearchIndexWhereInput = {
      userId: { in: this.baseUserIds }
    };
    
    // Text search (displayName, bio, locationText)
    if (this.filters.q && this.filters.q.trim().length > 0) {
      const q = this.filters.q.trim();
      where.AND = where.AND || [];
      where.AND.push({
        OR: [
          { displayName: { contains: q, mode: 'insensitive' } },
          { bio: { contains: q, mode: 'insensitive' } },
          { locationText: { contains: q, mode: 'insensitive' } }
        ]
      });
    }
    
    // Gender filter
    if (this.filters.gender && this.filters.gender.length > 0) {
      where.gender = { in: this.filters.gender as any[] };
    }
    
    // Intent filter
    if (this.filters.intent && this.filters.intent.length > 0) {
      where.intent = { in: this.filters.intent as any[] };
    }
    
    // Age filter (via ageBucket)
    if (this.filters.ageMin !== undefined || this.filters.ageMax !== undefined) {
      const minBucket = this.filters.ageMin ? Math.floor((this.filters.ageMin - 18) / 5) : null;
      const maxBucket = this.filters.ageMax ? Math.floor((this.filters.ageMax - 18) / 5) : null;
      if (minBucket !== null || maxBucket !== null) {
        where.ageBucket = {
          ...(minBucket !== null ? { gte: minBucket } : {}),
          ...(maxBucket !== null ? { lte: maxBucket } : {})
        };
      }
    }
    
    // Location filter
    if (this.filters.location && this.filters.location.trim().length > 0) {
      const location = this.filters.location.trim();
      const locationOr = [
        { locationText: { contains: location, mode: 'insensitive' } },
        { locationCity: { contains: location, mode: 'insensitive' } },
        { locationState: { contains: location, mode: 'insensitive' } },
        { locationCountry: { contains: location, mode: 'insensitive' } }
      ];
      
      if (where.AND) {
        where.AND.push({ OR: locationOr });
      } else {
        where.AND = [{ OR: locationOr }];
      }
    }
    
    // Collect all userId filters to intersect at the end
    const userIdFilters: bigint[][] = [];
    
    // Interest filtering (via InterestUserSet) - AND logic (must have all)
    if (this.filters.interests && this.filters.interests.length > 0) {
      const matchingUserIds = await this.intersectInterestSets(this.filters.interests);
      const filtered = matchingUserIds.filter(id => this.baseUserIds.includes(id));
      if (filtered.length === 0) {
        // No matches, return impossible query
        where.userId = { in: [] };
        return where;
      }
      userIdFilters.push(filtered);
    }
    
    // Interest subjects (OR logic) - user has any of these subjects
    if (this.filters.interestSubjects && this.filters.interestSubjects.length > 0) {
      const matchingUserIds = await this.unionInterestSubjects(this.filters.interestSubjects);
      const filtered = matchingUserIds.filter(id => this.baseUserIds.includes(id));
      if (filtered.length === 0) {
        where.userId = { in: [] };
        return where;
      }
      userIdFilters.push(filtered);
    }
    
    // Trait filtering (from traitSummary JSON)
    // Note: Prisma JSON filtering is limited, so we filter userIds first via UserTrait
    // then intersect with existing userIds
    if (this.filters.traits && this.filters.traits.length > 0) {
      const traitUserIds = await this.filterByTraits(this.filters.traits);
      const filtered = traitUserIds.filter(id => this.baseUserIds.includes(id));
      if (filtered.length === 0) {
        where.userId = { in: [] };
        return where;
      }
      userIdFilters.push(filtered);
    }
    
    // Intersect all userId filters (interests AND interestSubjects AND traits)
    if (userIdFilters.length > 0) {
      const sets = userIdFilters.map(arr => new Set(arr));
      const intersection = Array.from(
        sets.reduce((a, b) => new Set([...a].filter(x => b.has(x))))
      );
      where.userId = { in: intersection };
    }
    
    return where;
  }
  
  getOrderBy(sort?: SearchSort): Prisma.ProfileSearchIndexOrderByWithRelationInput[] {
    const sortType = sort || this.filters.sort || 'newest';
    
    switch (sortType) {
      case 'newest':
        return [{ accountCreatedAt: 'desc' }, { userId: 'desc' }];
      case 'age':
        return [{ age: 'asc' }, { userId: 'desc' }];
      default:
        return [{ accountCreatedAt: 'desc' }, { userId: 'desc' }];
    }
  }
  
  decodeCursor(): Prisma.ProfileSearchIndexWhereUniqueInput | undefined {
    if (!this.filters.cursor) return undefined;
    
    try {
      const decoded = Buffer.from(this.filters.cursor, 'base64').toString('utf-8');
      const cursor: SearchCursor = JSON.parse(decoded);
      
      // For now, use userId as cursor (can be enhanced with sortValue)
      return { userId: BigInt(cursor.userId) };
    } catch {
      return undefined;
    }
  }
  
  encodeCursor(userId: bigint, sortValue?: number): string {
    const cursor: SearchCursor = {
      userId: userId.toString(),
      sortValue,
      userIdNum: userId.toString()
    };
    return Buffer.from(JSON.stringify(cursor)).toString('base64');
  }
  
  getBaseUserIds(): bigint[] {
    return [...this.baseUserIds];
  }
  
  setBaseUserIds(userIds: bigint[]): void {
    this.baseUserIds = userIds;
  }
  
  private async intersectInterestSets(interestIds: string[]): Promise<bigint[]> {
    if (interestIds.length === 0) return [];
    
    // Get sets for each interest
    const sets = await Promise.all(
      interestIds.map(id =>
        prisma.interestUserSet.findMany({
          where: { interestId: BigInt(id) },
          select: { userId: true }
        }).then(r => new Set(r.map(x => x.userId)))
      )
    );
    
    // Intersect all sets
    if (sets.length === 0) return [];
    if (sets.length === 1) return Array.from(sets[0]);
    
    return Array.from(
      sets.reduce((a, b) => new Set([...a].filter(x => b.has(x))))
    );
  }
  
  private async unionInterestSubjects(subjectKeys: string[]): Promise<bigint[]> {
    if (subjectKeys.length === 0) return [];
    
    // Get subject IDs
    const subjects = await prisma.interestSubject.findMany({
      where: { key: { in: subjectKeys } },
      select: { id: true }
    });
    
    if (subjects.length === 0) return [];
    
    // Get userIds for each subject
    const sets = await Promise.all(
      subjects.map(subject =>
        prisma.interestSubjectUserSet.findMany({
          where: { subjectId: subject.id },
          select: { userId: true }
        }).then(r => new Set(r.map(x => x.userId)))
      )
    );
    
    // Union all sets
    const union = new Set<bigint>();
    for (const set of sets) {
      for (const userId of set) {
        union.add(userId);
      }
    }
    
    return Array.from(union);
  }
  
  private async filterByTraits(traits: TraitFilter[]): Promise<bigint[]> {
    // Group traits by group ID
    const groups = new Map<string, TraitFilter[]>();
    const ungrouped: TraitFilter[] = [];
    
    for (const trait of traits) {
      if (trait.group) {
        if (!groups.has(trait.group)) {
          groups.set(trait.group, []);
        }
        groups.get(trait.group)!.push(trait);
      } else {
        ungrouped.push(trait);
      }
    }
    
    // Get userIds matching each trait filter
    const groupResults: bigint[][] = [];
    
    // Process groups (OR logic within group)
    for (const [group, groupTraits] of groups.entries()) {
      const groupSets: Set<bigint>[] = [];
      for (const trait of groupTraits) {
        const min = trait.min ?? -10;
        const max = trait.max ?? 10;
        const matching = await prisma.userTrait.findMany({
          where: {
            traitKey: trait.key,
            value: { gte: min, lte: max }
          },
          select: { userId: true }
        });
        groupSets.push(new Set(matching.map(t => t.userId)));
      }
      // Union within group (OR)
      const groupUnion = new Set<bigint>();
      for (const set of groupSets) {
        for (const userId of set) {
          groupUnion.add(userId);
        }
      }
      groupResults.push(Array.from(groupUnion));
    }
    
    // Process ungrouped traits (AND logic)
    for (const trait of ungrouped) {
      const min = trait.min ?? -10;
      const max = trait.max ?? 10;
      const matching = await prisma.userTrait.findMany({
        where: {
          traitKey: trait.key,
          value: { gte: min, lte: max }
        },
        select: { userId: true }
      });
      groupResults.push(matching.map(t => t.userId));
    }
    
    // Intersect all groups (AND between groups)
    if (groupResults.length === 0) return [];
    if (groupResults.length === 1) return groupResults[0];
    
    const sets = groupResults.map(arr => new Set(arr));
    return Array.from(
      sets.reduce((a, b) => new Set([...a].filter(x => b.has(x))))
    );
  }
  
  async build(): Promise<Prisma.ProfileSearchIndexFindManyArgs> {
    const where = await this.buildWhere();
    const orderBy = this.getOrderBy();
    const cursor = this.decodeCursor();
    const limit = Math.min(this.filters.limit || 20, 50);
    
    return {
      where,
      orderBy,
      cursor,
      take: cursor ? limit + 1 : limit, // +1 to detect if there's more
      skip: cursor ? 1 : 0 // Skip cursor item
    };
  }
}
