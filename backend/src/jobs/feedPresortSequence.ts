import { feedConfig } from '../registry/domains/feed/config.js'
import type { FeedItem } from '../registry/domains/feed/types.js'

type SequenceSlot = {
  kind: 'post' | 'suggestion' | 'question'
  mediaType?: 'video' | 'image' | 'text' | 'mixed' | 'any'
  source?: 'match' | 'suggested'
  count?: number
  presentation?: 'single' | 'mosaic' | 'grid' | 'highlight'
}

function expandSequence(sequence: readonly SequenceSlot[]) {
  const expanded: SequenceSlot[] = []
  for (const slot of sequence) {
    const count = slot.count && slot.count > 1 ? Math.floor(slot.count) : 1
    for (let i = 0; i < count; i += 1) {
      expanded.push(slot)
    }
  }
  return expanded
}

/**
 * Apply feed sequence logic (pre-run config.ts sequence pattern)
 * This eliminates real-time pattern matching on every request
 */
export function applyFeedSequence(rankedItems: FeedItem[]): FeedItem[] {
  // Use feedConfig.sequence directly (not distribution.sequence)
  const sequenceConfig = feedConfig.sequence
  if (!sequenceConfig || sequenceConfig.length === 0) {
    // No sequence defined, return items as-is
    return rankedItems
  }
  
  const sequence = expandSequence(sequenceConfig)
  if (sequence.length === 0) {
    // No sequence defined, return items as-is
    return rankedItems
  }

  const items: FeedItem[] = []
  const actorCounts = new Map<bigint, number>()
  const usedPostIds = new Set<bigint>()
  const usedSuggestionIds = new Set<bigint>()
  const usedQuestionIds = new Set<bigint>()

  // Organize items into buckets
  const postBuckets = new Map<string, FeedItem[]>()
  postBuckets.set('all', rankedItems.filter((item) => item.type === 'post'))
  for (const item of rankedItems) {
    if (item.type === 'post') {
      const mediaType = item.post?.mediaType ?? 'text'
      const list = postBuckets.get(mediaType) ?? []
      list.push(item)
      postBuckets.set(mediaType, list)
    }
  }
  const postIndices = new Map<string, number>()

  const suggestionBuckets = new Map<string, FeedItem[]>()
  const allSuggestions = rankedItems.filter((item) => item.type === 'suggestion')
  suggestionBuckets.set('all', allSuggestions)
  suggestionBuckets.set('match', allSuggestions.filter((item) => item.source === 'match'))
  suggestionBuckets.set('suggested', allSuggestions.filter((item) => item.source === 'suggested'))
  const suggestionIndices = new Map<string, number>()

  const questionItems = rankedItems.filter((item) => item.type === 'question')
  const questionIndexRef = { value: 0 }

  const takeNextPost = (mediaType?: SequenceSlot['mediaType']): FeedItem | null => {
    const key = !mediaType || mediaType === 'any' ? 'all' : mediaType
    const bucket = postBuckets.get(key) ?? []
    let index = postIndices.get(key) ?? 0
    while (index < bucket.length) {
      const item = bucket[index]
      index += 1
      if (usedPostIds.has(item.post!.id)) continue
      const actorCount = actorCounts.get(item.actorId) ?? 0
      if (actorCount >= feedConfig.caps.maxPerActor) continue
      usedPostIds.add(item.post!.id)
      postIndices.set(key, index)
      return item
    }
    postIndices.set(key, index)
    return null
  }

  const takeNextPostForLayout = (
    mediaType?: SequenceSlot['mediaType'],
    presentation?: 'single' | 'mosaic' | 'grid' | 'highlight'
  ): FeedItem | null => {
    if (!presentation) return takeNextPost(mediaType)
    const matched = takeNextPost(mediaType)
    if (matched) return matched
    if (mediaType && mediaType !== 'any') {
      return takeNextPost('any')
    }
    return null
  }

  const takeNextSuggestion = (source?: SequenceSlot['source']): FeedItem | null => {
    const key = source ?? 'all'
    const bucket = suggestionBuckets.get(key) ?? []
    let index = suggestionIndices.get(key) ?? 0
    while (index < bucket.length) {
      const item = bucket[index]
      index += 1
      if (usedSuggestionIds.has(item.actorId)) continue
      const actorCount = actorCounts.get(item.actorId) ?? 0
      if (actorCount >= feedConfig.caps.maxPerActor) continue
      usedSuggestionIds.add(item.actorId)
      suggestionIndices.set(key, index)
      return item
    }
    suggestionIndices.set(key, index)
    return null
  }

  const takeNextQuestion = (): FeedItem | null => {
    let index = questionIndexRef.value
    while (index < questionItems.length) {
      const item = questionItems[index]
      index += 1
      if (usedQuestionIds.has(item.question!.id)) continue
      usedQuestionIds.add(item.question!.id)
      questionIndexRef.value = index
      return item
    }
    questionIndexRef.value = index
    return null
  }

  const hasRemaining = () =>
    usedPostIds.size < (postBuckets.get('all')?.length ?? 0) ||
    usedSuggestionIds.size < allSuggestions.length ||
    usedQuestionIds.size < questionItems.length

  let slotIndex = 0
  let idleCount = 0

  while (items.length < rankedItems.length && hasRemaining()) {
    const slot = sequence[slotIndex % sequence.length]
    let chosen: FeedItem | null = null

    if (slot.kind === 'post') {
      chosen = takeNextPostForLayout(slot.mediaType, slot.presentation)
    } else if (slot.kind === 'suggestion') {
      chosen = takeNextSuggestion(slot.source)
    } else if (slot.kind === 'question') {
      chosen = takeNextQuestion()
    }

    slotIndex += 1

    if (!chosen) {
      idleCount += 1
      if (idleCount >= sequence.length) break
      continue
    }

    idleCount = 0
    const actorCount = actorCounts.get(chosen.actorId) ?? 0
    actorCounts.set(chosen.actorId, actorCount + 1)
    items.push(chosen)
  }

  return items
}
