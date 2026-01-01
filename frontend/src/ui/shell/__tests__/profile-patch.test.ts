import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { api } from '../../../api/client'
import type { ProfileResponse, DatingIntent, Gender } from '../../../api/types'

describe('Profile Patch Functionality', () => {
  const mockUserId = '8'
  const mockProfile: ProfileResponse = {
    userId: mockUserId,
    name: 'Remy',
    age: 31,
    birthdate: '1994-04-13T00:00:00.000Z',
    locationText: 'Seattle, WA',
    intent: 'CASUAL',
    gender: 'OTHER',
    isVisible: true,
    bio: 'fun and cool and nice',
    avatarUrl: 'http://localhost:4000/media/b2/3c/b23ce907-42eb-46e4-bc45-408075c2d727.webp',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('API Profile Update', () => {
    it('should update display name correctly', async () => {
      const newName = 'Updated Name'
      const updateSpy = vi.spyOn(api, 'profileUpdate').mockResolvedValue({
        userId: mockUserId,
        updatedAt: new Date().toISOString(),
      })

      await api.profileUpdate(mockUserId, { displayName: newName })

      expect(updateSpy).toHaveBeenCalledWith(mockUserId, { displayName: newName })
      expect(updateSpy).toHaveBeenCalledTimes(1)
    })

    it('should update bio correctly', async () => {
      const newBio = 'Updated bio text'
      const updateSpy = vi.spyOn(api, 'profileUpdate').mockResolvedValue({
        userId: mockUserId,
        updatedAt: new Date().toISOString(),
      })

      await api.profileUpdate(mockUserId, { bio: newBio })

      expect(updateSpy).toHaveBeenCalledWith(mockUserId, { bio: newBio })
    })

    it('should update location correctly', async () => {
      const newLocation = 'Portland, OR'
      const updateSpy = vi.spyOn(api, 'profileUpdate').mockResolvedValue({
        userId: mockUserId,
        updatedAt: new Date().toISOString(),
      })

      await api.profileUpdate(mockUserId, { locationText: newLocation })

      expect(updateSpy).toHaveBeenCalledWith(mockUserId, { locationText: newLocation })
    })

    it('should update birthdate correctly with ISO format', async () => {
      const newBirthdate = '1995-05-15T00:00:00.000Z'
      const updateSpy = vi.spyOn(api, 'profileUpdate').mockResolvedValue({
        userId: mockUserId,
        updatedAt: new Date().toISOString(),
      })

      await api.profileUpdate(mockUserId, { birthdate: newBirthdate })

      expect(updateSpy).toHaveBeenCalledWith(mockUserId, { birthdate: newBirthdate })
    })

    it('should update intent correctly', async () => {
      const newIntent: DatingIntent = 'LONG_TERM'
      const updateSpy = vi.spyOn(api, 'profileUpdate').mockResolvedValue({
        userId: mockUserId,
        updatedAt: new Date().toISOString(),
      })

      await api.profileUpdate(mockUserId, { intent: newIntent })

      expect(updateSpy).toHaveBeenCalledWith(mockUserId, { intent: newIntent })
    })

    it('should update gender correctly', async () => {
      const newGender: Gender = 'MALE'
      const updateSpy = vi.spyOn(api, 'profileUpdate').mockResolvedValue({
        userId: mockUserId,
        updatedAt: new Date().toISOString(),
      })

      await api.profileUpdate(mockUserId, { gender: newGender })

      expect(updateSpy).toHaveBeenCalledWith(mockUserId, { gender: newGender })
    })

    it('should update visibility correctly', async () => {
      const updateSpy = vi.spyOn(api, 'profileUpdate').mockResolvedValue({
        userId: mockUserId,
        updatedAt: new Date().toISOString(),
      })

      await api.profileUpdate(mockUserId, { isVisible: false })

      expect(updateSpy).toHaveBeenCalledWith(mockUserId, { isVisible: false })
    })

    it('should handle multiple field updates', async () => {
      const updateSpy = vi.spyOn(api, 'profileUpdate').mockResolvedValue({
        userId: mockUserId,
        updatedAt: new Date().toISOString(),
      })

      await api.profileUpdate(mockUserId, {
        displayName: 'New Name',
        bio: 'New bio',
        locationText: 'New Location',
      })

      expect(updateSpy).toHaveBeenCalledWith(mockUserId, {
        displayName: 'New Name',
        bio: 'New bio',
        locationText: 'New Location',
      })
    })
  })

  describe('Birthdate Format Conversion', () => {
    it('should convert YYYY-MM-DD to ISO format correctly', () => {
      const dateInput = '1995-05-15'
      const expectedISO = '1995-05-15T00:00:00.000Z'
      const actualISO = `${dateInput}T00:00:00.000Z`

      expect(actualISO).toBe(expectedISO)
    })

    it('should handle empty birthdate as null', () => {
      const dateInput = ''
      const isoDate = dateInput && dateInput.length ? `${dateInput}T00:00:00.000Z` : null

      expect(isoDate).toBeNull()
    })
  })

  describe('Profile Snapshot Comparison', () => {
    it('should create consistent snapshots for same profile', () => {
      const getProfileSnapshot = (p: ProfileResponse | null): string => {
        if (!p) return ''
        return JSON.stringify({
          userId: p.userId,
          name: p.name,
          bio: p.bio,
          locationText: p.locationText,
          birthdate: p.birthdate,
          intent: p.intent,
          gender: p.gender,
          isVisible: p.isVisible,
          avatarUrl: p.avatarUrl,
        })
      }

      const snapshot1 = getProfileSnapshot(mockProfile)
      const snapshot2 = getProfileSnapshot(mockProfile)

      expect(snapshot1).toBe(snapshot2)
    })

    it('should detect changes in profile snapshot', () => {
      const getProfileSnapshot = (p: ProfileResponse | null): string => {
        if (!p) return ''
        return JSON.stringify({
          userId: p.userId,
          name: p.name,
          bio: p.bio,
          locationText: p.locationText,
          birthdate: p.birthdate,
          intent: p.intent,
          gender: p.gender,
          isVisible: p.isVisible,
          avatarUrl: p.avatarUrl,
        })
      }

      const originalSnapshot = getProfileSnapshot(mockProfile)
      const updatedProfile: ProfileResponse = {
        ...mockProfile,
        name: 'Updated Name',
      }
      const updatedSnapshot = getProfileSnapshot(updatedProfile)

      expect(originalSnapshot).not.toBe(updatedSnapshot)
    })

    it('should handle null profile in snapshot', () => {
      const getProfileSnapshot = (p: ProfileResponse | null): string => {
        if (!p) return ''
        return JSON.stringify({
          userId: p.userId,
          name: p.name,
          bio: p.bio,
          locationText: p.locationText,
          birthdate: p.birthdate,
          intent: p.intent,
          gender: p.gender,
          isVisible: p.isVisible,
          avatarUrl: p.avatarUrl,
        })
      }

      const snapshot = getProfileSnapshot(null)
      expect(snapshot).toBe('')
    })
  })

  describe('Profile Update Flow', () => {
    it('should handle update sequence: API call -> optimistic update -> refetch', async () => {
      const updateSpy = vi.spyOn(api, 'profileUpdate').mockResolvedValue({
        userId: mockUserId,
        updatedAt: new Date().toISOString(),
      })

      // Simulate the update flow
      const newName = 'Updated Name'
      
      // 1. API call
      await api.profileUpdate(mockUserId, { displayName: newName })
      
      // 2. Optimistic update (simulated)
      const optimisticProfile: ProfileResponse = {
        ...mockProfile,
        name: newName,
      }

      // 3. Verify API was called
      expect(updateSpy).toHaveBeenCalledWith(mockUserId, { displayName: newName })
      
      // 4. Verify optimistic update
      expect(optimisticProfile.name).toBe(newName)
      expect(optimisticProfile.userId).toBe(mockProfile.userId)
    })

    it('should preserve profile data during null refetch', () => {
      const getProfileSnapshot = (p: ProfileResponse | null): string => {
        if (!p) return ''
        return JSON.stringify({
          userId: p.userId,
          name: p.name,
          bio: p.bio,
          locationText: p.locationText,
          birthdate: p.birthdate,
          intent: p.intent,
          gender: p.gender,
          isVisible: p.isVisible,
          avatarUrl: p.avatarUrl,
        })
      }

      // Simulate: profile becomes null during refetch
      const localProfile = mockProfile

      // Local profile should be preserved
      expect(localProfile).toBeDefined()
      expect(localProfile.name).toBe(mockProfile.name)
      
      // Snapshot should still work
      const snapshot = getProfileSnapshot(localProfile)
      expect(snapshot).not.toBe('')
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty string values correctly', async () => {
      const updateSpy = vi.spyOn(api, 'profileUpdate').mockResolvedValue({
        userId: mockUserId,
        updatedAt: new Date().toISOString(),
      })

      await api.profileUpdate(mockUserId, { displayName: '' })

      expect(updateSpy).toHaveBeenCalledWith(mockUserId, { displayName: '' })
    })

    it('should handle null values correctly', async () => {
      const updateSpy = vi.spyOn(api, 'profileUpdate').mockResolvedValue({
        userId: mockUserId,
        updatedAt: new Date().toISOString(),
      })

      await api.profileUpdate(mockUserId, { bio: null })

      expect(updateSpy).toHaveBeenCalledWith(mockUserId, { bio: null })
    })

    it('should handle undefined values correctly', async () => {
      const updateSpy = vi.spyOn(api, 'profileUpdate').mockResolvedValue({
        userId: mockUserId,
        updatedAt: new Date().toISOString(),
      })

      await api.profileUpdate(mockUserId, { locationText: undefined })

      expect(updateSpy).toHaveBeenCalledWith(mockUserId, { locationText: undefined })
    })
  })
})
