export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function normalizeScalar(value: unknown): string | null {
  if (Array.isArray(value)) {
    return normalizeScalar(value[0]);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) return null;
    return String(value);
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return null;
}

export function parsePositiveBigInt(value: unknown, label: string): ParseResult<bigint> {
  const raw = normalizeScalar(value);
  if (!raw || !/^\d+$/.test(raw)) {
    return { ok: false, error: `${label} must be a positive integer` };
  }
  const parsed = BigInt(raw);
  if (parsed <= 0n) {
    return { ok: false, error: `${label} must be a positive integer` };
  }
  return { ok: true, value: parsed };
}

export function parseOptionalPositiveBigInt(value: unknown, label: string): ParseResult<bigint | null> {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: null };
  }
  const parsed = parsePositiveBigInt(value, label);
  if (!parsed.ok) return parsed;
  return { ok: true, value: parsed.value };
}

export function parseOptionalPositiveBigIntList(value: unknown, label: string): ParseResult<bigint[] | null> {
  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }
  if (!Array.isArray(value)) {
    return { ok: false, error: `${label} must be an array` };
  }
  const items: bigint[] = [];
  for (const entry of value) {
    const parsed = parsePositiveBigInt(entry, label);
    if (!parsed.ok) return parsed;
    items.push(parsed.value);
  }
  return { ok: true, value: items };
}

export function parseLimit(value: unknown, fallback: number, max: number, label = 'take'): ParseResult<number> {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: fallback };
  }
  const raw = normalizeScalar(value);
  if (!raw) return { ok: false, error: `${label} must be a positive integer` };
  const num = Number(raw);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num <= 0) {
    return { ok: false, error: `${label} must be a positive integer` };
  }
  return { ok: true, value: Math.min(num, max) };
}

export function parseOptionalNumber(value: unknown, label: string): ParseResult<number | undefined> {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: undefined };
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { ok: false, error: `${label} must be a number` };
    return { ok: true, value };
  }
  if (typeof value === 'bigint') {
    return { ok: true, value: Number(value) };
  }
  const raw = normalizeScalar(value);
  if (raw === null) return { ok: false, error: `${label} must be a number` };
  const num = Number(raw);
  if (!Number.isFinite(num)) return { ok: false, error: `${label} must be a number` };
  return { ok: true, value: num };
}

export function parseOptionalDate(value: unknown, label: string): ParseResult<Date | undefined> {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: undefined };
  }
  const raw = normalizeScalar(value);
  if (!raw) return { ok: false, error: `${label} must be a valid date` };
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, error: `${label} must be a valid date` };
  }
  return { ok: true, value: parsed };
}

export function parseOptionalBoolean(value: unknown, label: string): ParseResult<boolean | undefined> {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: undefined };
  }
  if (typeof value === 'boolean') {
    return { ok: true, value };
  }
  if (typeof value === 'number') {
    if (value === 1) return { ok: true, value: true };
    if (value === 0) return { ok: true, value: false };
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return { ok: true, value: true };
    if (normalized === 'false') return { ok: true, value: false };
    if (normalized === '1') return { ok: true, value: true };
    if (normalized === '0') return { ok: true, value: false };
  }
  return { ok: false, error: `${label} must be a boolean` };
}
