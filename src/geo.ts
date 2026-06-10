// Pure geometry + formatting helpers. No MapLibre, no DOM, no build-only deps,
// so this module is safe to import from the runtime engine, the build scripts,
// and the tests alike. Keep it allocation-light: the runtime hot path calls
// progressToCoord ~30x per frame.

import type { LngLat, RouteLUT } from './types';

const R_EARTH = 6_371_000; // metres

const toRad = (d: number): number => (d * Math.PI) / 180;
const toDeg = (r: number): number => (r * 180) / Math.PI;

/** Great-circle distance in metres between two [lng, lat] points. */
export function haversineMeters(a: LngLat, b: LngLat): number {
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const dLat = lat2 - lat1;
  const dLng = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Convert a distance-along-route (metres) into a coordinate by lerping into the
 * uniform LUT. Two array reads and a lerp; this is the runtime hot path.
 * Clamps to the route ends so noise or overshoot can never index out of bounds.
 */
export function progressToCoord(lut: RouteLUT, metres: number): LngLat {
  let d = metres;
  if (d <= 0) return [lut.lng[0], lut.lat[0]];
  if (d >= lut.lengthM) return [lut.lng[lut.count - 1], lut.lat[lut.count - 1]];
  const f = d / lut.stepM;
  const i = Math.floor(f);
  if (i >= lut.count - 1) return [lut.lng[lut.count - 1], lut.lat[lut.count - 1]];
  const frac = f - i;
  return [
    lerp(lut.lng[i], lut.lng[i + 1], frac),
    lerp(lut.lat[i], lut.lat[i + 1], frac),
  ];
}

/** Compass bearing in degrees (0=N, 90=E) from a to b. */
export function bearingDeg(a: LngLat, b: LngLat): number {
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const dLng = toRad(b[0] - a[0]);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** [west, south, east, north] enclosing the given coordinate arrays. */
export function computeBounds(
  lng: number[],
  lat: number[],
): [number, number, number, number] {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (let i = 0; i < lng.length; i++) {
    if (lng[i] < w) w = lng[i];
    if (lng[i] > e) e = lng[i];
    if (lat[i] < s) s = lat[i];
    if (lat[i] > n) n = lat[i];
  }
  return [w, s, e, n];
}

/** mm:ss for a duration in ms (e.g. 1980000 -> "33:00"). */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Signed delta for the leaderboard: negative = early (beat prediction). */
export function formatDelta(ms: number | null): string {
  if (ms === null) return '—';
  const sign = ms < 0 ? '-' : '+';
  return sign + formatClock(Math.abs(ms));
}

/** Shortest signed angular difference b-a in degrees, in (-180, 180]. */
export function angleDelta(a: number, b: number): number {
  let d = ((b - a + 540) % 360) - 180;
  if (d === -180) d = 180;
  return d;
}
