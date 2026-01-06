import { clamp } from './vectors.js';

export function newnessScore(updatedAt: Date, halfLifeDays: number): number {
  const ageMs = Date.now() - updatedAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays <= 0) return 1;
  const decay = Math.log(2) / Math.max(1, halfLifeDays);
  return clamp(Math.exp(-decay * ageDays));
}

export function computeAge(birthdate: Date | null): number | null {
  if (!birthdate) return null;
  const now = new Date();
  let age = now.getFullYear() - birthdate.getFullYear();
  const m = now.getMonth() - birthdate.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birthdate.getDate())) {
    age -= 1;
  }
  return age;
}
