import { parseOptionalPositiveBigInt, parsePositiveBigInt } from '../http/parse.js';

export function getOptionalUserId(raw: unknown): bigint | null {
  const parsed = parseOptionalPositiveBigInt(raw, 'x-user-id');
  if (!parsed.ok) return null;
  return parsed.value;
}

export function requireUserId(raw: unknown): { ok: true; userId: bigint } | { ok: false; error: string } {
  const parsed = parsePositiveBigInt(raw, 'x-user-id');
  if (!parsed.ok) return { ok: false, error: parsed.error };
  return { ok: true, userId: parsed.value };
}
