import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildRoute } from '../scripts/route';
import { parseGpxFile } from '../scripts/gpx';
import { progressToCoord, haversineMeters } from '../src/geo';
import type { LngLat } from '../src/types';

const here = dirname(fileURLToPath(import.meta.url));
const CANONICAL_GPX = resolve(here, '../Inaugural_FCTC_.gpx');

describe('buildRoute (synthetic)', () => {
  // A straight 100 m line east.
  const dLng = 1 / 111320;
  const coords: LngLat[] = [
    [0, 0],
    [100 * dLng, 0],
  ];

  it('produces a uniform LUT of the right length', () => {
    const { lut } = buildRoute(coords, 1);
    expect(lut.lengthM).toBeCloseTo(100, 0);
    expect(lut.count).toBe(101);
    // stepM is the *effective* uniform spacing (~requested), not exactly 1.
    expect(lut.stepM).toBeCloseTo(1, 1);
    expect(lut.stepM * (lut.count - 1)).toBeCloseTo(lut.lengthM, 6);
  });

  it('spaces samples ~stepM apart', () => {
    const { lut } = buildRoute(coords, 1);
    for (let i = 1; i < lut.count; i++) {
      const d = haversineMeters(
        [lut.lng[i - 1], lut.lat[i - 1]],
        [lut.lng[i], lut.lat[i]],
      );
      expect(d).toBeGreaterThan(0.9);
      expect(d).toBeLessThan(1.1);
    }
  });

  it('round-trips the midpoint through progressToCoord', () => {
    const { lut } = buildRoute(coords, 1);
    // At exactly half the route length the coordinate is half the longitude
    // span, independent of the equator-distance approximation.
    const c = progressToCoord(lut, lut.lengthM / 2);
    expect(c[0]).toBeCloseTo((100 * dLng) / 2, 7);
    expect(c[1]).toBe(0);
  });

  it('clamps progress beyond the ends to the endpoints', () => {
    const { lut } = buildRoute(coords, 1);
    expect(progressToCoord(lut, -10)).toEqual([lut.lng[0], lut.lat[0]]);
    expect(progressToCoord(lut, 999)).toEqual([
      lut.lng[lut.count - 1],
      lut.lat[lut.count - 1],
    ]);
  });
});

describe('buildRoute (canonical Herdsman Lake GPX)', () => {
  const { coords } = parseGpxFile(CANONICAL_GPX);
  const built = buildRoute(coords, 1);

  it('parses a substantial track', () => {
    expect(coords.length).toBeGreaterThan(1500);
  });

  it('measures ~7.74 km within 1%', () => {
    expect(built.lut.lengthM).toBeGreaterThan(7660);
    expect(built.lut.lengthM).toBeLessThan(7820);
  });

  it('is a closed loop (start ~ end)', () => {
    const start: LngLat = [built.lut.lng[0], built.lut.lat[0]];
    const end: LngLat = [
      built.lut.lng[built.lut.count - 1],
      built.lut.lat[built.lut.count - 1],
    ];
    expect(haversineMeters(start, end)).toBeLessThan(15);
  });

  it('produces bounds enclosing the start point', () => {
    const [w, s, e, n] = built.bounds;
    expect(built.start[0]).toBeGreaterThanOrEqual(w);
    expect(built.start[0]).toBeLessThanOrEqual(e);
    expect(built.start[1]).toBeGreaterThanOrEqual(s);
    expect(built.start[1]).toBeLessThanOrEqual(n);
  });
});
