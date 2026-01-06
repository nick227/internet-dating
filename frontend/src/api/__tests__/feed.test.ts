import { describe, it, expect } from 'vitest'
import { api } from '../client'
import type { FeedCard } from '../types'

describe('Feed API - Duplicate UserId Check', () => {
  it('should not have duplicate userIds in feed items', async () => {
    // Fetch initial feed page (home page view)
    const response = await api.feed()
    
    expect(response).toBeDefined()
    expect(response.items).toBeDefined()
    expect(Array.isArray(response.items)).toBe(true)
    
    const items = response.items as FeedCard[]
    
    if (items.length === 0) {
      console.log('Feed is empty - skipping duplicate check')
      return
    }
    
    // Extract all userIds from feed items
    const userIds: (string | number)[] = []
    const userIdToItems = new Map<string | number, FeedCard[]>()
    
    for (const item of items) {
      if (item.actor?.id != null) {
        const userId = item.actor.id
        userIds.push(userId)
        
        if (!userIdToItems.has(userId)) {
          userIdToItems.set(userId, [])
        }
        userIdToItems.get(userId)!.push(item)
      }
    }
    
    // Find userIds that exceed maxPerActor limit
    // Backend allows up to 3 items per actor (maxPerActor: 3)
    const MAX_PER_ACTOR = 3
    const violations: Array<{ userId: string | number; count: number; items: FeedCard[] }> = []
    
    for (const [userId, userItems] of userIdToItems.entries()) {
      if (userItems.length > MAX_PER_ACTOR) {
        violations.push({ userId, count: userItems.length, items: userItems })
      }
    }
    
    // Report results
    const uniqueUserIds = new Set(userIds)
    console.log(`\nFeed Analysis:`)
    console.log(`- Total items: ${items.length}`)
    console.log(`- Items with actors: ${userIds.length}`)
    console.log(`- Unique userIds: ${uniqueUserIds.size}`)
    
    if (violations.length > 0) {
      console.log(`\n⚠️  Found ${violations.length} userId(s) exceeding maxPerActor limit (${MAX_PER_ACTOR}):`)
      for (const { userId, count, items } of violations) {
        console.log(`  - UserId ${userId} appears ${count} times (limit: ${MAX_PER_ACTOR}):`)
        items.forEach((item, idx) => {
          console.log(`    ${idx + 1}. ${item.kind} card (id: ${item.id})`)
        })
      }
    } else {
      console.log(`\n✅ All userIds within maxPerActor limit (${MAX_PER_ACTOR})`)
    }
    
    // Assert no violations of maxPerActor limit
    expect(violations.length).toBe(0)
  }, 30000) // 30 second timeout for API call
})
