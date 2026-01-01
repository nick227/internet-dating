import { useCallback } from 'react'
import type { ProfileResponse } from '../../api/types'
import { usePresence } from '../../core/ws/presence'
import { useNavigate } from 'react-router-dom'
import { useHeroItems, type HeroMediaItem } from '../../core/profile/useHeroItems'
import { usePresenceLabel } from '../../core/profile/usePresenceLabel'
import { useHeroMosaicState } from '../../core/profile/useHeroMosaicState'
import { useMediaViewer } from '../ui/MediaViewerContext'
import { useModalState } from '../shell/useModalState'
import { HeroMosaic } from './HeroMosaic'
import { HeroTopBar } from './HeroTopBar'
import { HeroContent } from './HeroContent'
import { HeroMediaPicker } from './HeroMediaPicker'
import { api } from '../../api/client'
import { useMediaUpload } from '../../core/media/useMediaUpload'

type HeroSectionProps = {
  profile?: ProfileResponse
  isOwner?: boolean
  onMediaUpdate?: () => void
  onMore?: () => void
}

export function HeroSection({ profile, isOwner = false, onMediaUpdate, onMore }: HeroSectionProps) {
  const nav = useNavigate()
  const presenceStatus = usePresence(profile?.userId)
  const presenceLabel = usePresenceLabel(presenceStatus)
  const items = useHeroItems(profile)
  const { viewState, openPicker, closePicker } = useHeroMosaicState(items)
  const { openViewer } = useMediaViewer()
  const { openMediaViewer } = useModalState()
  const { uploadFile } = useMediaUpload()


  const handleTileClick = useCallback(
    (item: HeroMediaItem, index: number) => {
      // If owner, clicking on existing tile opens picker to change/remove it
      if (isOwner && item.src) {
        openPicker(item.id, index)
        return
      }
      
      const hasContent = item.src || item.text || item.audioUrl
      if (hasContent) {
        // Convert HeroMediaItem[] to MediaItem[] format for site-wide MediaViewer
        // Filter items with content and convert to MediaItem format
        const contentItems = items.filter(i => i.src || i.text || i.audioUrl)
        const mediaItems = contentItems.map(i => ({
          src: i.src || '',
          alt: i.alt || '',
          type: i.type === 'VIDEO' ? 'video' as const : 'image' as const,
          poster: i.preview || undefined,
        }))
        // Find the index in the filtered array - match by item id
        const filteredIndex = contentItems.findIndex(i => i.id === item.id)
        const targetIndex = filteredIndex >= 0 ? filteredIndex : 0
        // Open site-wide MediaViewer
        openViewer(mediaItems, targetIndex)
        openMediaViewer()
      } else {
        openPicker(item.id, index)
      }
    },
    [items, isOwner, openViewer, openMediaViewer, openPicker]
  )

  const handleEmptyClick = useCallback(
    (slotIndex: number) => {
      openPicker(undefined, slotIndex)
    },
    [openPicker]
  )

  const handleMediaSelect = useCallback(
    async (mediaId: string | number) => {
      if (!profile?.userId) {
        throw new Error('Profile not available')
      }
      const slotIndex = viewState.pickerSlotIndex ?? 0
      
      // Slot 0 is the hero - update heroMediaId
      if (slotIndex === 0) {
        await api.profileUpdate(profile.userId, { heroMediaId: String(mediaId) })
      } else {
        // For slots 1-6, we need to create/update a post with media
        // Get current items to determine existing media in slots
        const currentItems = items
        const currentMediaIds: string[] = []
        
        // Extract media IDs from slots 1-6 (skip slot 0 which is hero)
        for (let i = 1; i < currentItems.length && i < 7; i++) {
          if (currentItems[i]?.mediaId) {
            currentMediaIds.push(String(currentItems[i].mediaId))
          }
        }
        
        // Build the media array for slots 1-6
        // Slot index 1 = post media[0], slot index 2 = post media[1], etc.
        const targetPostIndex = slotIndex - 1
        const postMediaIds: string[] = []
        const newMediaIdStr = String(mediaId)
        
        // Copy existing media up to the target slot
        for (let i = 0; i < targetPostIndex && i < currentMediaIds.length; i++) {
          postMediaIds.push(currentMediaIds[i])
        }
        
        // Insert the new media at the target position
        postMediaIds.push(newMediaIdStr)
        
        // Add remaining media (skip the old media at target position, but allow duplicates)
        for (let i = targetPostIndex + 1; i < currentMediaIds.length; i++) {
          postMediaIds.push(currentMediaIds[i])
        }
        
        // Limit to 6 media items (slots 1-6)
        const finalMediaIds = postMediaIds.slice(0, 6)
        
        // Find or create a post to hold the mosaic media
        // Look for an existing post with media (prefer one without text)
        const postsWithMedia = (profile.posts ?? []).filter(p => p.media && p.media.length > 0)
        const mosaicPost = postsWithMedia.find(p => !p.text) || postsWithMedia[0]
        
        if (finalMediaIds.length > 0) {
          if (mosaicPost) {
            // Delete existing post and create new one with updated media
            // (PATCH doesn't support mediaIds, so we recreate)
            await api.posts.delete(mosaicPost.id)
          }
          // Create new post for mosaic media
          await api.posts.create({
            text: null,
            visibility: 'PUBLIC',
            mediaIds: finalMediaIds
          })
        } else if (mosaicPost) {
          // Delete post if no media left
          await api.posts.delete(mosaicPost.id)
        }
      }
      
      onMediaUpdate?.()
      closePicker()
    },
    [profile?.userId, profile?.posts, items, viewState.pickerSlotIndex, onMediaUpdate, closePicker]
  )

  const handleMediaUpload = useCallback(
    async (file: File) => {
      if (!profile?.userId) return
      // HeroMediaPicker already validates, but we use the shared hook for consistency
      const result = await uploadFile(file)
      await handleMediaSelect(result.mediaId)
    },
    [profile?.userId, handleMediaSelect, uploadFile]
  )

  const handleUrlSubmit = useCallback(
    async (_url: string) => {
      if (!profile?.userId) {
        throw new Error('Profile not available')
      }
      // TODO: Backend support needed for URL-to-media conversion
      // For now, this would require fetching the URL content and converting to File
      // or a new backend endpoint to create media from URLs
      throw new Error('URL submission not yet implemented - please upload a file instead')
    },
    [profile?.userId]
  )

  const handleRemove = useCallback(
    async () => {
      if (!profile?.userId) {
        throw new Error('Profile not available')
      }
      const slotIndex = viewState.pickerSlotIndex ?? 0
      
      // Slot 0 is the hero - remove by setting to null
      if (slotIndex === 0) {
        await api.profileUpdate(profile.userId, { heroMediaId: null })
      } else {
        // For slots 1-6, remove from post media array
        const currentItems = items
        const currentMediaIds: string[] = []
        
        // Extract media IDs from slots 1-6 (skip slot 0 which is hero)
        for (let i = 1; i < currentItems.length && i < 7; i++) {
          if (currentItems[i]?.mediaId) {
            currentMediaIds.push(String(currentItems[i].mediaId))
          }
        }
        
        const targetPostIndex = slotIndex - 1
        
        // Remove media at target position
        const postMediaIds = currentMediaIds.filter((_, i) => i !== targetPostIndex)
        
        // Find existing post with media
        const postsWithMedia = (profile.posts ?? []).filter(p => p.media && p.media.length > 0)
        const mosaicPost = postsWithMedia.find(p => !p.text) || postsWithMedia[0]
        
        if (mosaicPost) {
          if (postMediaIds.length > 0) {
            // Delete existing post and create new one with updated media
            // (PATCH doesn't support mediaIds, so we recreate)
            await api.posts.delete(mosaicPost.id)
            await api.posts.create({
              text: null,
              visibility: 'PUBLIC',
              mediaIds: postMediaIds.slice(0, 6)
            })
          } else {
            // Delete post if no media left
            await api.posts.delete(mosaicPost.id)
          }
        }
      }
      
      onMediaUpdate?.()
      closePicker()
    },
    [profile?.userId, profile?.posts, items, viewState.pickerSlotIndex, onMediaUpdate, closePicker]
  )

  const handleMore = onMore ?? (() => alert('TODO: menu'))

  return (
    <>
    <div className="profile__hero">
      <div className="profile__heroFallback" aria-hidden="true" />
        <div className="profile__heroScrim" />
        <HeroTopBar onBack={() => nav(-1)} onMore={handleMore} />
        <HeroContent profile={profile} presenceLabel={presenceLabel} />
        <div className="profile__heroMedia">
          <HeroMosaic
            items={items}
            onTileClick={handleTileClick}
            onEmptyClick={isOwner ? handleEmptyClick : undefined}
          />
        </div>
      </div>

      {viewState.pickerOpen && profile && (
        <HeroMediaPicker
          open={viewState.pickerOpen}
          existingMedia={profile.media ?? []}
          slotIndex={viewState.pickerSlotIndex}
          onClose={closePicker}
          onSelect={handleMediaSelect}
          onUpload={handleMediaUpload}
          onUrlSubmit={handleUrlSubmit}
          onRemove={isOwner ? handleRemove : undefined}
          hasExistingContent={viewState.pickerSlotIndex !== undefined && items[viewState.pickerSlotIndex]?.src !== undefined}
        />
      )}
    </>
  )
}
