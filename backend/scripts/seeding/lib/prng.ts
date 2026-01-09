/**
 * Deterministic PRNG implementation using xoshiro128**
 * Provides reproducible randomness for seeding operations
 */

interface RNG {
  next(): number;
  nextInt(max: number): number;
  nextFloat(min: number, max: number): number;
  choice<T>(arr: T[]): T;
  choices<T>(arr: T[], count: number): T[];
  shuffle<T>(arr: T[]): T[];
  bool(probability?: number): boolean;
}

function hashString(str: string): number[] {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  
  const s1 = h >>> 0;
  const s2 = Math.imul(s1, 2654435761) >>> 0;
  const s3 = Math.imul(s2, 2654435761) >>> 0;
  const s4 = Math.imul(s3, 2654435761) >>> 0;
  
  return [s1, s2, s3, s4];
}

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

export function makeRng(seed: string): RNG {
  const state = hashString(seed);
  
  function next(): number {
    const result = Math.imul(rotl(Math.imul(state[1], 5), 7), 9);
    const t = state[1] << 9;
    
    state[2] ^= state[0];
    state[3] ^= state[1];
    state[1] ^= state[2];
    state[0] ^= state[3];
    state[2] ^= t;
    state[3] = rotl(state[3], 11);
    
    return (result >>> 0) / 4294967296;
  }
  
  function nextInt(max: number): number {
    return Math.floor(next() * max);
  }
  
  function nextFloat(min: number, max: number): number {
    return min + next() * (max - min);
  }
  
  function choice<T>(arr: T[]): T {
    if (arr.length === 0) throw new Error('Cannot choose from empty array');
    return arr[nextInt(arr.length)]!;
  }
  
  function choices<T>(arr: T[], count: number): T[] {
    const result: T[] = [];
    for (let i = 0; i < count; i++) {
      result.push(choice(arr));
    }
    return result;
  }
  
  function shuffle<T>(arr: T[]): T[] {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = nextInt(i + 1);
      [result[i], result[j]] = [result[j]!, result[i]!];
    }
    return result;
  }
  
  function bool(probability = 0.5): boolean {
    return next() < probability;
  }
  
  return {
    next,
    nextInt,
    nextFloat,
    choice,
    choices,
    shuffle,
    bool
  };
}

export function makeUserRng(runSeed: string, userId: bigint, namespace: string): RNG {
  return makeRng(`${runSeed}:${userId}:${namespace}`);
}

export function makeDayRng(runSeed: string, userId: bigint, day: number, namespace: string): RNG {
  return makeRng(`${runSeed}:${userId}:day${day}:${namespace}`);
}

export function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

export type { RNG };
