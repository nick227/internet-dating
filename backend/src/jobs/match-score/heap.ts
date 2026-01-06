type ScoreRow = {
  userId: bigint;
  candidateUserId: bigint;
  score: number;
  scoreQuiz: number;
  scoreInterests: number;
  scoreRatingsQuality: number;
  scoreRatingsFit: number;
  scoreNew: number;
  scoreNearby: number;
  ratingAttractive: number | null;
  ratingSmart: number | null;
  ratingFunny: number | null;
  ratingInteresting: number | null;
  distanceKm: number | null;
  reasons: Record<string, unknown>;
  scoredAt: Date;
  algorithmVersion: string;
  tier: 'A' | 'B'; // Tier A (within preferences) or Tier B (outside preferences)
};

/**
 * Min-heap for Top-K candidates (smallest score at root)
 * Maintains only the top K highest-scoring candidates
 */
export class MinHeap {
  private heap: ScoreRow[] = [];
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  size(): number {
    return this.heap.length;
  }

  peek(): ScoreRow | null {
    return this.heap.length > 0 ? this.heap[0]! : null;
  }

  push(item: ScoreRow): void {
    if (this.heap.length < this.maxSize) {
      this.heap.push(item);
      this.bubbleUp(this.heap.length - 1);
    } else if (item.score > this.heap[0]!.score) {
      this.heap[0] = item;
      this.bubbleDown(0);
    }
  }

  toArray(): ScoreRow[] {
    return [...this.heap].sort((a, b) => b.score - a.score); // Sort descending
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.heap[parent]!.score <= this.heap[index]!.score) break;
      [this.heap[parent], this.heap[index]] = [this.heap[index]!, this.heap[parent]!];
      index = parent;
    }
  }

  private bubbleDown(index: number): void {
    while (true) {
      const left = 2 * index + 1;
      const right = 2 * index + 2;
      let smallest = index;

      if (left < this.heap.length && this.heap[left]!.score < this.heap[smallest]!.score) {
        smallest = left;
      }
      if (right < this.heap.length && this.heap[right]!.score < this.heap[smallest]!.score) {
        smallest = right;
      }
      if (smallest === index) break;
      [this.heap[index], this.heap[smallest]] = [this.heap[smallest]!, this.heap[index]!];
      index = smallest;
    }
  }
}
