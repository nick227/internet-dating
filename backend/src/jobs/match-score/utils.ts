export function normalizeGenderPrefs(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const list = value.filter((entry): entry is string => typeof entry === 'string');
  return list.length ? list : null;
}

export function sleep(ms: number): Promise<void> {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
