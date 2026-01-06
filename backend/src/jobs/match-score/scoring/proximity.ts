import { clamp, toNumber, isValidLatitude, isValidLongitude, haversineKm } from '../math/geo.js';

export function calculateDistanceKm(
  meLat: number | null,
  meLng: number | null,
  candidateLat: number | null,
  candidateLng: number | null
): number | null {
  const hasDistance =
    meLat !== null &&
    meLng !== null &&
    candidateLat !== null &&
    candidateLng !== null &&
    isValidLatitude(meLat) &&
    isValidLongitude(meLng) &&
    isValidLatitude(candidateLat) &&
    isValidLongitude(candidateLng);
  
  if (!hasDistance) return null;
  return haversineKm(meLat, meLng, candidateLat, candidateLng);
}

export function scoreProximity(
  distanceKm: number | null,
  preferredDistanceKm: number | null,
  defaultMaxDistanceKm: number,
  viewerLocationText: string | null,
  candidateLocationText: string | null
): number {
  if (distanceKm !== null) {
    const radius = preferredDistanceKm ?? defaultMaxDistanceKm;
    return clamp(1 - distanceKm / radius);
  }
  
  // Fallback: text match
  if (viewerLocationText && candidateLocationText && viewerLocationText === candidateLocationText) {
    return 0.25;
  }
  
  return 0; // No proximity signal
}
