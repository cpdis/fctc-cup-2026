// Map-matching: project a runner's noisy GPS onto the canonical route and turn
// it into a clean, monotonic "distance along route" series resampled onto a
// uniform race-elapsed-time grid. This is the only genuinely fiddly algorithm
// in the build (KTD7); the pitfalls (backward jitter, the start/finish seam,
// self-intersections) are all handled here so the runtime stays a dumb lerp.

import type { RouteLUT, RunnerActual } from '../src/types';
import type { TrackPoint } from './gpx';

export interface MatchOptions {
  /** How far back along the route a snap may move vs the previous point. */
  backWindowM?: number;
  /** How far forward a snap may search (bounds self-intersection wrong-arm). */
  fwdWindowM?: number;
}

export interface MatchedRunner {
  actual: RunnerActual;
  /** Race-elapsed ms when the runner completes the loop. */
  finishMs: number;
}

/**
 * Snap each GPS point to the nearest route sample within a forward window of
 * the previous snap, then enforce monotonic progress. The window is the
 * defence against the loop passing near itself (a far point can't win) and the
 * start/finish seam (we never search backward across it).
 */
export function snapToProgress(
  points: TrackPoint[],
  lut: RouteLUT,
  opts: MatchOptions = {},
): number[] {
  const backWindowM = opts.backWindowM ?? 25;
  const fwdWindowM = opts.fwdWindowM ?? 400;
  const n = lut.count;
  const idxBack = Math.max(1, Math.round(backWindowM / lut.stepM));
  const idxFwd = Math.max(1, Math.round(fwdWindowM / lut.stepM));

  // Scale longitude by cos(lat) so squared-degree distance is ~isotropic. One
  // cosine for the whole track is plenty over a 2 km area.
  const cosLat = Math.cos((points[0].lat * Math.PI) / 180);

  const progressM = new Array<number>(points.length);
  let prevIdx = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    // First point: everyone mass-starts at the line, so search only near the
    // route start, never the seam end.
    const lo = i === 0 ? 0 : Math.max(0, prevIdx - idxBack);
    const hi = i === 0 ? Math.min(n - 1, idxFwd) : Math.min(n - 1, prevIdx + idxFwd);

    let best = prevIdx;
    let bestD = Infinity;
    for (let j = lo; j <= hi; j++) {
      const dx = (p.lng - lut.lng[j]) * cosLat;
      const dy = p.lat - lut.lat[j];
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    if (best < prevIdx) best = prevIdx; // monotonic: never step backward
    prevIdx = best;
    progressM[i] = best * lut.stepM;
  }

  // Pin the seam: clean departure from and arrival at the line.
  progressM[0] = 0;
  progressM[progressM.length - 1] = lut.lengthM;
  return progressM;
}

/**
 * Resample an irregular (time, progress) series onto a uniform dtMs grid of
 * race-elapsed time, so the runtime reads progress with a plain index + lerp.
 */
export function resampleToTimeGrid(
  points: TrackPoint[],
  progressM: number[],
  lut: RouteLUT,
  dtMs: number,
): MatchedRunner {
  const t0 = points[0].tMs;
  const elapsed = points.map((p) => p.tMs - t0);
  const finishMs = elapsed[elapsed.length - 1];
  const count = Math.max(2, Math.floor(finishMs / dtMs) + 1);

  const out = new Array<number>(count);
  let j = 0;
  for (let k = 0; k < count; k++) {
    const t = k === count - 1 ? finishMs : k * dtMs;
    while (j < elapsed.length - 2 && elapsed[j + 1] < t) j++;
    const span = elapsed[j + 1] - elapsed[j];
    const f = span > 0 ? (t - elapsed[j]) / span : 0;
    out[k] = progressM[j] + (progressM[j + 1] - progressM[j]) * f;
  }
  // Land exactly on the finish, and guard monotonicity after interpolation.
  out[count - 1] = lut.lengthM;
  for (let k = 1; k < count; k++) if (out[k] < out[k - 1]) out[k] = out[k - 1];

  return { actual: { dtMs, count, progressM: out }, finishMs };
}

/** Convenience: snap + resample in one call. Throws if the track has no times. */
export function matchTrack(
  points: TrackPoint[],
  lut: RouteLUT,
  dtMs: number,
  opts?: MatchOptions,
): MatchedRunner {
  if (points.length < 2) throw new Error('Track needs at least two points');
  if (Number.isNaN(points[0].tMs) || Number.isNaN(points[points.length - 1].tMs)) {
    throw new Error('Track has no timestamps; cannot place it on the race clock');
  }
  const progressM = snapToProgress(points, lut, opts);
  return resampleToTimeGrid(points, progressM, lut, dtMs);
}
