export function enforceMaxStreak<T>(
  items: T[],
  getKey: (item: T) => string,
  maxStreak: number
): T[] {
  if (maxStreak <= 0) return items;

  const result: T[] = [];
  let lastKey: string | null = null;
  let streak = 0;

  for (const item of items) {
    const key = getKey(item);
    if (key === lastKey) {
      streak += 1;
      if (streak > maxStreak) continue;
    } else {
      lastKey = key;
      streak = 1;
    }
    result.push(item);
  }

  return result;
}
