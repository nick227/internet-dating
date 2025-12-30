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
    
    // Find duplicates
    const seen = new Set<string | number>()
    const duplicates: Array<{ userId: string | number; items: FeedCard[] }> = []
    
    for (const userId of userIds) {
      if (seen.has(userId)) {
        const items = userIdToItems.get(userId) || []
        duplicates.push({ userId, items })
      } else {
        seen.add(userId)
      }
    }
    
    // Report results
    console.log(`\nFeed Analysis:`)
    console.log(`- Total items: ${items.length}`)
    console.log(`- Items with actors: ${userIds.length}`)
    console.log(`- Unique userIds: ${seen.size}`)
    
    if (duplicates.length > 0) {
      console.log(`\n⚠️  Found ${duplicates.length} duplicate userId(s):`)
      for (const { userId, items } of duplicates) {
        console.log(`  - UserId ${userId} appears ${items.length} times:`)
        items.forEach((item, idx) => {
          console.log(`    ${idx + 1}. ${item.kind} card (id: ${item.id})`)
        })
      }
    } else {
      console.log(`\n✅ No duplicate userIds found`)
    }
    
    // Assert no duplicates
    expect(duplicates.length).toBe(0)
  }, 30000) // 30 second timeout for API call
})
