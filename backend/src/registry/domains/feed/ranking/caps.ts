export function capByKey<T>(
  items: T[],
  getKey: (item: T) => string,
  limits: Record<string, number>
): T[] {
  const counts = new Map<string, number>();
  const capped: T[] = [];

  for (const item of items) {
    const key = getKey(item);
    const limit = limits[key];
    if (limit === undefined) {
      capped.push(item);
      continue;
    }

    const next = (counts.get(key) ?? 0) + 1;
    if (next > limit) continue;
    counts.set(key, next);
    capped.push(item);
  }

  return capped;
}
