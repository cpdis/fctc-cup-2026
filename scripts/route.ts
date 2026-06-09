// Build the canonical route lookup table: resample the raw GPX polyline to a
// uniform 1 m arc-length grid so that "distance along route" maps to a coordinate
// by a plain array index + lerp at runtime. This is the shared geometry every
// marker (ghost, GPS icon, fallback) rides.

import { haversineMeters, lerp, computeBounds } from '../src/geo';
import type { LngLat, RouteLUT } from '../src/types';

export interface BuiltRoute {
  lut: RouteLUT;
  bounds: [number, number, number, number];
  start: LngLat;
}

/** Cumulative along-track distance (metres) for each input vertex. */
function cumulative(coords: LngLat[]): number[] {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) {
    cum.push(cum[i - 1] + haversineMeters(coords[i - 1], coords[i]));
  }
  return cum;
}

/**
 * Resample `coords` to a uniform `stepM` grid along its arc length.
 * Single forward pass over the segments (O(n + count)).
 */
export function buildRoute(coords: LngLat[], stepM = 1): BuiltRoute {
  if (coords.length < 2) {
    throw new Error('Route needs at least two points');
  }
  const cum = cumulative(coords);
  const lengthM = cum[cum.length - 1];
  // Exactly uniform spacing over [0, lengthM]: the effective step is lengthM
  // divided across (count-1) intervals, so the last sample lands precisely on
  // the end vertex with no distorted final gap.
  const count = Math.max(2, Math.round(lengthM / stepM) + 1);
  const effStep = lengthM / (count - 1);

  const lng = new Array<number>(count);
  const lat = new Array<number>(count);

  let seg = 0;
  for (let k = 0; k < count; k++) {
    const d = k === count - 1 ? lengthM : k * effStep;
    while (seg < coords.length - 2 && cum[seg + 1] < d) seg++;
    const segLen = cum[seg + 1] - cum[seg];
    const t = segLen > 0 ? (d - cum[seg]) / segLen : 0;
    lng[k] = lerp(coords[seg][0], coords[seg + 1][0], t);
    lat[k] = lerp(coords[seg][1], coords[seg + 1][1], t);
  }

  const lut: RouteLUT = { stepM: effStep, count, lengthM, lng, lat };
  return { lut, bounds: computeBounds(lng, lat), start: [lng[0], lat[0]] };
}
