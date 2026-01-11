import { feedConfig, type FeedSlot } from '../config.js';
import type { FeedCandidateSet, FeedItem, ViewerContext } from '../types.js';

type PostMediaType = Extract<FeedSlot, { kind: 'post' }>['mediaType'];
type SuggestionSource = Extract<FeedSlot, { kind: 'suggestion' }>['source'];
type PostSlot = Extract<FeedSlot, { kind: 'post' }>;
type SuggestionSlot = Extract<FeedSlot, { kind: 'suggestion' }>;

function isPostSlot(slot: FeedSlot): slot is PostSlot {
  return slot.kind === 'post';
}

function isSuggestionSlot(slot: FeedSlot): slot is SuggestionSlot {
  return slot.kind === 'suggestion';
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function expandSequence(sequence: readonly FeedSlot[]) {
  const expanded: FeedSlot[] = [];
  for (const slot of sequence) {
    const count = slot.count && slot.count > 1 ? Math.floor(slot.count) : 1;
    for (let i = 0; i < count; i += 1) {
      expanded.push(slot);
    }
  }
  return expanded;
}

export function mergeAndRank(_ctx: ViewerContext, candidates: FeedCandidateSet): FeedItem[] {
  const items: FeedItem[] = [];
  const seed = Number.isFinite(_ctx.seed ?? NaN) ? Math.floor(_ctx.seed ?? 0) : null;
  const maxItems = Math.min(_ctx.take, feedConfig.caps.maxItemsPerResponse);
  
  // Convert candidates to unified FeedItem format
  const postItems: FeedItem[] = candidates.posts.map((post) => ({
    type: 'post' as const,
    post,
    actorId: post.user.id,
    source: 'post' as const,
    tier: 'everyone' as const
  }));
  const filteredPostItems = postItems;

  const questions = candidates.questions ?? [];
  const questionItems: FeedItem[] = questions.map((question) => ({
    type: 'question' as const,
    question,
    actorId: question.id,
    source: 'question' as const,
    tier: 'everyone' as const
  }));
  
  const rawSuggestionItems: FeedItem[] = candidates.suggestions.map((suggestion) => ({
    type: 'suggestion' as const,
    suggestion,
    actorId: suggestion.userId,
    source: suggestion.source === 'match' ? 'match' : 'suggested',
    tier: 'everyone' as const
  }));
  const suggestionItems = (() => {
    if (!rawSuggestionItems.length) return rawSuggestionItems;
    if (seed == null) {
      return rawSuggestionItems.slice().sort((a, b) => {
        const scoreA = a.suggestion?.score ?? 0;
        const scoreB = b.suggestion?.score ?? 0;
        return scoreB - scoreA;
      });
    }

    const rng = mulberry32(seed);
    return rawSuggestionItems
      .map((item) => ({
        item,
        score: item.suggestion?.score ?? 0,
        seedRank: rng()
      }))
      .sort((a, b) => {
        const scoreDelta = b.score - a.score;
        if (scoreDelta !== 0) return scoreDelta;
        return a.seedRank - b.seedRank;
      })
      .map(({ item }) => item);
  })();
  
  const actorCounts = new Map<bigint, number>();
  const usedPostIds = new Set<bigint>();
  const usedSuggestionIds = new Set<bigint>();
  const usedQuestionIds = new Set<bigint>();

  const postBuckets = new Map<string, FeedItem[]>();
  postBuckets.set('all', filteredPostItems);
  for (const item of filteredPostItems) {
    const mediaType = item.post?.mediaType ?? 'text';
    const list = postBuckets.get(mediaType) ?? [];
    list.push(item);
    postBuckets.set(mediaType, list);
  }
  const postIndices = new Map<string, number>();

  const suggestionBuckets = new Map<string, FeedItem[]>();
  suggestionBuckets.set('all', suggestionItems);
  suggestionBuckets.set('match', suggestionItems.filter((item) => item.source === 'match'));
  suggestionBuckets.set('suggested', suggestionItems.filter((item) => item.source === 'suggested'));
  const suggestionIndices = new Map<string, number>();

  const questionIndexRef = { value: 0 };

  const takeNextPost = (mediaType?: PostMediaType) => {
    const key = !mediaType || mediaType === 'any' ? 'all' : mediaType;
    const bucket = postBuckets.get(key) ?? [];
    let index = postIndices.get(key) ?? 0;
    while (index < bucket.length) {
      const item = bucket[index];
      index += 1;
      if (usedPostIds.has(item.post!.id)) continue;
      const actorCount = actorCounts.get(item.actorId) ?? 0;
      if (actorCount >= feedConfig.caps.maxPerActor) continue;
      usedPostIds.add(item.post!.id);
      postIndices.set(key, index);
      return item;
    }
    postIndices.set(key, index);
    return null;
  };

  const takeNextPostForLayout = (
    mediaType?: PostMediaType,
    presentation?: PostSlot['presentation']
  ) => {
    if (!presentation) return takeNextPost(mediaType);
    const matched = takeNextPost(mediaType);
    if (matched) return matched;
    if (mediaType && mediaType !== 'any') {
      return takeNextPost('any');
    }
    return null;
  };

  const takeNextSuggestion = (source?: SuggestionSource) => {
    const key = source ?? 'all';
    const bucket = suggestionBuckets.get(key) ?? [];
    let index = suggestionIndices.get(key) ?? 0;
    while (index < bucket.length) {
      const item = bucket[index];
      index += 1;
      if (usedSuggestionIds.has(item.actorId)) continue;
      const actorCount = actorCounts.get(item.actorId) ?? 0;
      if (actorCount >= feedConfig.caps.maxPerActor) continue;
      usedSuggestionIds.add(item.actorId);
      suggestionIndices.set(key, index);
      return item;
    }
    suggestionIndices.set(key, index);
    return null;
  };

  const takeNextQuestion = () => {
    let index = questionIndexRef.value;
    while (index < questionItems.length) {
      const item = questionItems[index];
      index += 1;
      if (usedQuestionIds.has(item.question!.id)) continue;
      usedQuestionIds.add(item.question!.id);
      questionIndexRef.value = index;
      return item;
    }
    questionIndexRef.value = index;
    return null;
  };

  const sequence = expandSequence(feedConfig.sequence);

  const mosaicSlots = feedConfig.sequence.filter((slot) => isPostSlot(slot) && slot.presentation === 'mosaic');
  if (mosaicSlots.length > 0) {
    const missingMosaicSlots: Array<{
      kind: FeedSlot['kind'];
      mediaType?: PostMediaType;
      source?: SuggestionSource;
      count: number;
      available: number;
    }> = [];

    for (const slot of mosaicSlots) {
      if (isPostSlot(slot)) {
        const key = !slot.mediaType || slot.mediaType === 'any' ? 'all' : slot.mediaType;
        const available = (postBuckets.get(key)?.length ?? 0);
        if (available === 0 && (postBuckets.get('all')?.length ?? 0) === 0) {
          missingMosaicSlots.push({
            kind: slot.kind,
            mediaType: slot.mediaType,
            count: slot.count,
            available,
          });
        }
      } else if (isSuggestionSlot(slot)) {
        const key = slot.source ?? 'all';
        const available = (suggestionBuckets.get(key)?.length ?? 0);
        if (available === 0) {
          missingMosaicSlots.push({
            kind: slot.kind,
            source: slot.source,
            count: slot.count,
            available,
          });
        }
      }
    }

    if (missingMosaicSlots.length > 0) {
      console.warn('[feed] Mosaic slots have no candidates', {
        missingMosaicSlots,
        postCandidatesByType: {
          all: postBuckets.get('all')?.length ?? 0,
          image: postBuckets.get('image')?.length ?? 0,
          mixed: postBuckets.get('mixed')?.length ?? 0,
          video: postBuckets.get('video')?.length ?? 0,
          text: postBuckets.get('text')?.length ?? 0,
        },
        suggestionCandidatesBySource: {
          all: suggestionBuckets.get('all')?.length ?? 0,
          match: suggestionBuckets.get('match')?.length ?? 0,
          suggested: suggestionBuckets.get('suggested')?.length ?? 0,
        },
      });
    } else {
      const totalPosts = postBuckets.get('all')?.length ?? 0;
      const typedMissing = mosaicSlots.filter(
        (slot): slot is PostSlot =>
          slot.kind === 'post' &&
          slot.mediaType != null &&
          slot.mediaType !== 'any' &&
          (postBuckets.get(slot.mediaType)?.length ?? 0) === 0
      );
      if (typedMissing.length > 0 && totalPosts > 0) {
        console.info('[feed] Mosaic slots missing typed candidates; falling back to any post', {
          typedMissing: typedMissing.map((slot) => ({
            kind: slot.kind,
            mediaType: slot.mediaType,
            count: slot.count,
          })),
          postCandidatesByType: {
            all: totalPosts,
            image: postBuckets.get('image')?.length ?? 0,
            mixed: postBuckets.get('mixed')?.length ?? 0,
            video: postBuckets.get('video')?.length ?? 0,
            text: postBuckets.get('text')?.length ?? 0,
          },
        });
      }
    }
  }
  const hasRemaining = () =>
    usedPostIds.size < filteredPostItems.length ||
    usedSuggestionIds.size < suggestionItems.length ||
    usedQuestionIds.size < questionItems.length;

  if (sequence.length > 0) {
    let slotIndex = 0;
    let idleCount = 0;

    while (items.length < maxItems && hasRemaining()) {
      const slot = sequence[slotIndex % sequence.length];
      let chosen: FeedItem | null = null;

      if (slot.kind === 'post') {
        chosen = takeNextPostForLayout(slot.mediaType, slot.presentation);
      } else if (slot.kind === 'suggestion') {
        chosen = takeNextSuggestion(slot.source);
      } else if (slot.kind === 'question') {
        chosen = takeNextQuestion();
      }

      slotIndex += 1;

      if (!chosen) {
        idleCount += 1;
        if (idleCount >= sequence.length) break;
        continue;
      }

      idleCount = 0;
      const actorCount = actorCounts.get(chosen.actorId) ?? 0;
      actorCounts.set(chosen.actorId, actorCount + 1);
      const presentation =
        slot.kind === 'post' || slot.kind === 'suggestion'
          ? slot.presentation
          : undefined;
      items.push(
        presentation
          ? { ...chosen, presentation: { mode: presentation } }
          : chosen
      );
    }
  } else {
    // Minimal fallback when sequence is empty.
    let postIndex = 0;
    let suggestionIndex = 0;

    while (items.length < maxItems && (postIndex < filteredPostItems.length || suggestionIndex < suggestionItems.length)) {
      let chosen: FeedItem | null = null;

      if (postIndex < filteredPostItems.length) {
        const postItem = filteredPostItems[postIndex];
        const actorCount = actorCounts.get(postItem.actorId) ?? 0;
        if (actorCount < feedConfig.caps.maxPerActor) {
          chosen = postItem;
        }
      }

      if (!chosen && suggestionIndex < suggestionItems.length) {
        const suggestionItem = suggestionItems[suggestionIndex];
        const actorCount = actorCounts.get(suggestionItem.actorId) ?? 0;
        if (actorCount < feedConfig.caps.maxPerActor) {
          chosen = suggestionItem;
        }
      }

      if (!chosen) break;

      const actorCount = actorCounts.get(chosen.actorId) ?? 0;
      actorCounts.set(chosen.actorId, actorCount + 1);
      items.push(chosen);

      if (chosen.type === 'post') {
        postIndex += 1;
      } else {
        suggestionIndex += 1;
      }
    }
  }

  return items;
}
