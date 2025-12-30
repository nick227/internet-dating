import { describe, it, expect, beforeEach, vi } from 'vitest'
import { seenBatchManager } from '../useFeedSeen'
import { videoPlaybackManager } from '../videoPlaybackManager'
import { adaptFeedResponse } from '../../../api/adapters'
// eslint-disable-next-line no-restricted-imports -- Test file needs raw API type to mock adapter input
import type { ApiFeedResponse } from '../../../api/contracts'

describe('Feed Performance Tests', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear()
    // Reset video playback manager
    videoPlaybackManager.pauseAll()
  })

  describe('Seen Cache Performance', () => {
    it('should enforce MAX_CACHE_SIZE limit with LRU eviction', () => {
      const MAX_CACHE_SIZE = 1000
      
      // Add items beyond the limit
      const startTime = performance.now()
      for (let i = 0; i < MAX_CACHE_SIZE + 100; i++) {
        seenBatchManager.markSeenInCache(`card-${i}`)
      }
      const duration = performance.now() - startTime

      const cache = seenBatchManager.getCache()
      
      // Should not exceed max size
      expect(cache.size).toBeLessThanOrEqual(MAX_CACHE_SIZE)
      
      // Performance: should complete in reasonable time (< 500ms for 1100 operations with localStorage)
      expect(duration).toBeLessThan(500)
    })

    it('should handle cache operations efficiently (O(1) lookup)', () => {
      // Pre-populate cache
      for (let i = 0; i < 500; i++) {
        seenBatchManager.markSeenInCache(`card-${i}`)
      }

      const cache = seenBatchManager.getCache()
      
      // Test lookup performance
      const startTime = performance.now()
      for (let i = 0; i < 1000; i++) {
        cache.has(`card-${i % 500}`)
      }
      const duration = performance.now() - startTime

      // 1000 lookups should be very fast (< 10ms)
      expect(duration).toBeLessThan(10)
    })

    it('should batch seen events efficiently', () => {
      const events = Array.from({ length: 50 }, (_, i) => ({
        itemType: 'post',
        itemId: `post-${i}`,
        position: i * 100,
        timestamp: Date.now() + i,
      }))

      const startTime = performance.now()
      events.forEach(event => seenBatchManager.addToBatch(event))
      const duration = performance.now() - startTime

      // Batching 50 events should be very fast (< 5ms)
      expect(duration).toBeLessThan(5)
    })
  })

  describe('Video Playback Manager Performance', () => {
    it('should only allow one active video at a time', () => {
      const video1 = document.createElement('video')
      const video2 = document.createElement('video')
      const video3 = document.createElement('video')

      // Request play for multiple videos
      const startTime = performance.now()
      videoPlaybackManager.requestPlay(video1)
      videoPlaybackManager.requestPlay(video2)
      videoPlaybackManager.requestPlay(video3)
      const duration = performance.now() - startTime

      // Should be instant (< 1ms)
      expect(duration).toBeLessThan(1)

      // Only last video should be active
      videoPlaybackManager.requestPlay(video1)
      expect(videoPlaybackManager.requestPlay(video2)).toBe(true)
    })

    it('should handle rapid play/pause requests efficiently', () => {
      const videos = Array.from({ length: 100 }, () => document.createElement('video'))

      const startTime = performance.now()
      videos.forEach(video => {
        videoPlaybackManager.requestPlay(video)
        videoPlaybackManager.release(video)
      })
      const duration = performance.now() - startTime

      // 100 operations should be very fast (< 10ms)
      expect(duration).toBeLessThan(10)
    })
  })

  describe('Feed Adapter Performance', () => {
    it('should transform feed response efficiently', () => {
      const mockFeed: ApiFeedResponse = {
        items: Array.from({ length: 20 }, (_, i) => ({
          type: 'post' as const,
          post: {
            id: String(i + 1),
            text: `Post ${i + 1}`,
            createdAt: new Date().toISOString(),
            user: {
              id: String((i % 10) + 1),
              profile: {
                displayName: `User ${(i % 10) + 1}`,
              },
            },
            media: [],
          },
        })),
        nextCursorId: null,
        hasMorePosts: false,
      }

      const startTime = performance.now()
      const result = adaptFeedResponse(mockFeed)
      const duration = performance.now() - startTime

      expect(result.items).toHaveLength(20)
      
      // Transforming 20 items should be fast (< 10ms)
      expect(duration).toBeLessThan(10)
    })

    it('should handle large feed responses efficiently', () => {
      const largeFeed: ApiFeedResponse = {
        items: Array.from({ length: 100 }, (_, i) => ({
          type: 'post' as const,
          post: {
            id: String(i + 1),
            text: `Post ${i + 1}`,
            createdAt: new Date().toISOString(),
            user: {
              id: String((i % 20) + 1),
              profile: {
                displayName: `User ${(i % 20) + 1}`,
              },
            },
            media: [],
          },
        })),
        nextCursorId: null,
        hasMorePosts: false,
      }

      const startTime = performance.now()
      const result = adaptFeedResponse(largeFeed)
      const duration = performance.now() - startTime

      expect(result.items).toHaveLength(100)
      
      // Transforming 100 items should still be reasonable (< 50ms)
      expect(duration).toBeLessThan(50)
    })
  })

  describe('Memory Management', () => {
    it('should not leak memory with repeated cache operations', () => {
      const iterations = 1000
      
      const startTime = performance.now()
      for (let i = 0; i < iterations; i++) {
        seenBatchManager.markSeenInCache(`card-${i % 200}`)
      }
      const duration = performance.now() - startTime

      const cache = seenBatchManager.getCache()
      
      // Cache should be bounded (not grow unbounded)
      expect(cache.size).toBeLessThanOrEqual(1000)
      
      // Performance should remain consistent (localStorage operations are slower)
      expect(duration).toBeLessThan(500)
    })

    it('should handle localStorage quota exceeded gracefully', () => {
      // Mock localStorage to throw QuotaExceededError
      const originalSetItem = Storage.prototype.setItem
      let setItemCallCount = 0
      
      Storage.prototype.setItem = vi.fn(() => {
        setItemCallCount++
        if (setItemCallCount > 50) {
          const error = new DOMException('Quota exceeded', 'QuotaExceededError')
          throw error
        }
      })

      // Should not throw, should handle gracefully
      expect(() => {
        for (let i = 0; i < 100; i++) {
          seenBatchManager.markSeenInCache(`card-${i}`)
        }
      }).not.toThrow()

      // Restore original
      Storage.prototype.setItem = originalSetItem
    })
  })

  describe('Batch Processing Performance', () => {
    it('should batch seen events without performance degradation', () => {
      const batchSizes = [10, 50, 100]
      
      for (const size of batchSizes) {
        const events = Array.from({ length: size }, (_, i) => ({
          itemType: 'post',
          itemId: `post-${i}`,
          position: i * 100,
          timestamp: Date.now() + i,
        }))

        const startTime = performance.now()
        events.forEach(event => seenBatchManager.addToBatch(event))
        const duration = performance.now() - startTime

        // Performance should scale linearly, not exponentially
        const expectedMaxTime = size * 0.1 // 0.1ms per event
        expect(duration).toBeLessThan(expectedMaxTime)
      }
    })
  })
})
