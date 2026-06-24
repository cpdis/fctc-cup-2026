import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { snapToProgress, resampleToTimeGrid, matchTrack, matchToFinish } from '../scripts/match';
import { buildRoute } from '../scripts/route';
import { parseGpxFile } from '../scripts/gpx';
import { progressToCoord } from '../src/geo';
import type { LngLat } from '../src/types';
import type { TrackPoint } from '../scripts/gpx';

const here = dirname(fileURLToPath(import.meta.url));
const CANONICAL = resolve(here, '../Inaugural_FCTC_.gpx');
const DEG = 1 / 111320; // ~1 m at the equator

/** A straight 200 m route east. */
function straightRoute() {
  return buildRoute(
    [
      [0, 0],
      [200 * DEG, 0],
    ],
    1,
  );
}

function pt(lng: number, lat: number, tS: number): TrackPoint {
  return { lng, lat, tMs: tS * 1000 };
}

describe('snapToProgress', () => {
  it('is monotonic even with an injected backward-noise point', () => {
    const { lut } = straightRoute();
    // Walk forward, but point #3 jumps physically backward (GPS spike).
    const track: TrackPoint[] = [
      pt(0, 0, 0),
      pt(20 * DEG, 0, 10),
      pt(40 * DEG, 0, 20),
      pt(15 * DEG, 0, 30), // backward spike
      pt(60 * DEG, 0, 40),
      pt(200 * DEG, 0, 50),
    ];
    const prog = snapToProgress(track, lut);
    for (let i = 1; i < prog.length; i++) {
      expect(prog[i]).toBeGreaterThanOrEqual(prog[i - 1]);
    }
  });

  it('pins the start to 0 and the end to route length', () => {
    const { lut } = straightRoute();
    const track: TrackPoint[] = [
      pt(3 * DEG, 0, 0), // slightly past the line
      pt(100 * DEG, 0, 30),
      pt(197 * DEG, 0, 60), // slightly short
    ];
    const prog = snapToProgress(track, lut);
    expect(prog[0]).toBe(0);
    expect(prog[prog.length - 1]).toBeCloseTo(lut.lengthM, 5);
  });

  it('does not teleport forward past the search window', () => {
    const { lut } = straightRoute();
    // Second point is a huge spike 1 km ahead (beyond fwd window); it must not
    // be allowed to jump there (and is bounded by route length anyway).
    const track: TrackPoint[] = [
      pt(0, 0, 0),
      pt(10 * DEG, 0, 10),
      pt(5000 * DEG, 0, 20), // absurd forward spike
      pt(30 * DEG, 0, 30),
      pt(200 * DEG, 0, 40),
    ];
    const prog = snapToProgress(track, lut, { fwdWindowM: 50 });
    // The spike point should snap within ~window of the previous (~10 m), not L.
    expect(prog[2]).toBeLessThan(80);
  });
});

describe('resampleToTimeGrid', () => {
  it('produces a uniform grid that ends exactly at route length', () => {
    const { lut } = straightRoute();
    const track: TrackPoint[] = [
      pt(0, 0, 0),
      pt(100 * DEG, 0, 50),
      pt(200 * DEG, 0, 100),
    ];
    const prog = snapToProgress(track, lut);
    const { actual, finishMs } = resampleToTimeGrid(track, prog, lut, 1000);
    expect(finishMs).toBe(100_000);
    expect(actual.count).toBe(101);
    expect(actual.progressM[actual.count - 1]).toBeCloseTo(lut.lengthM, 5);
    for (let i = 1; i < actual.count; i++) {
      expect(actual.progressM[i]).toBeGreaterThanOrEqual(actual.progressM[i - 1]);
    }
  });

  it('interpolates a constant-pace runner to the halfway mark', () => {
    const { lut } = straightRoute();
    const track: TrackPoint[] = [
      pt(0, 0, 0),
      pt(200 * DEG, 0, 100),
    ];
    const prog = snapToProgress(track, lut);
    const { actual } = resampleToTimeGrid(track, prog, lut, 1000);
    const mid = actual.progressM[Math.floor((actual.count - 1) / 2)];
    expect(mid).toBeGreaterThan(lut.lengthM * 0.45);
    expect(mid).toBeLessThan(lut.lengthM * 0.55);
  });
});

describe('matchTrack — canonical Herdsman Lake track (characterization)', () => {
  const { coords, points } = parseGpxFile(CANONICAL);
  const { lut } = buildRoute(coords, 1);
  const matched = matchTrack(points, lut, 1000);

  it('finishes near the recorded ~35.6 min', () => {
    expect(matched.finishMs / 60000).toBeGreaterThan(35);
    expect(matched.finishMs / 60000).toBeLessThan(36.5);
  });

  it('produces monotonic progress that ends at route length', () => {
    const p = matched.actual.progressM;
    for (let i = 1; i < p.length; i++) {
      expect(p[i]).toBeGreaterThanOrEqual(p[i - 1]);
    }
    expect(p[p.length - 1]).toBeCloseTo(lut.lengthM, 5);
  });

  it('never makes an implausible single-step jump (>120 m/s)', () => {
    const p = matched.actual.progressM;
    for (let i = 1; i < p.length; i++) {
      expect(p[i] - p[i - 1]).toBeLessThan(120); // dt=1s, no human runs 120 m/s
    }
  });

  it('a snapped point sits on the route within a metre', () => {
    // Re-snap the canonical track and confirm the coordinate it lands on is the
    // route coordinate at that progress (round-trip through the LUT).
    const prog = snapToProgress(points, lut);
    const c = progressToCoord(lut, prog[500]);
    const onRoute: LngLat = [c[0], c[1]];
    expect(Number.isFinite(onRoute[0])).toBe(true);
    expect(prog[500]).toBeGreaterThan(0);
  });
});

describe('matchToFinish — official finish time is authoritative', () => {
  // Points evenly spaced along a 200 m straight route at 0,50,100,150,200 m.
  function evenPoints(withTimes: boolean, gpsDurMs = 0): TrackPoint[] {
    const meters = [0, 50, 100, 150, 200];
    const n = meters.length;
    return meters.map((m, i) => ({
      lng: m * DEG,
      lat: 0,
      tMs: withTimes ? (i / (n - 1)) * gpsDurMs : NaN,
    }));
  }

  it('places a timestamp-free track (Strava strips them) on the official clock', () => {
    const { lut } = straightRoute(); // ~200 m
    const m = matchToFinish(evenPoints(false), lut, 1000, 100_000);
    expect(m.finishMs).toBe(100_000);
    expect(m.actual.progressM[m.actual.count - 1]).toBeCloseTo(lut.lengthM, 5);
    // Evenly-spaced points, uniform timing -> half the loop at half the time.
    expect(m.actual.progressM[50]).toBeCloseTo(lut.lengthM / 2, 0);
  });

  it('overrides the GPS duration with the official finish (stretches the timing)', () => {
    const { lut } = straightRoute();
    // GPS says the run took 200 s; the official time is 100 s — official wins.
    const m = matchToFinish(evenPoints(true, 200_000), lut, 1000, 100_000);
    expect(m.finishMs).toBe(100_000);
    expect(m.actual.progressM[m.actual.count - 1]).toBeCloseTo(lut.lengthM, 5);
    expect(m.actual.progressM[50]).toBeCloseTo(lut.lengthM / 2, 0); // shape preserved, scaled
  });

  it('keeps progress monotonic and lands exactly on the loop length', () => {
    const { lut } = straightRoute();
    const p = matchToFinish(evenPoints(false), lut, 1000, 90_000).actual.progressM;
    for (let i = 1; i < p.length; i++) expect(p[i]).toBeGreaterThanOrEqual(p[i - 1]);
    expect(p[p.length - 1]).toBeCloseTo(lut.lengthM, 5);
  });
});
