import { describe, it, expect } from 'vitest';
import {
  haversineMeters,
  progressToCoord,
  bearingDeg,
  computeBounds,
  formatClock,
  formatDelta,
  angleDelta,
  lerp,
} from '../src/geo';
import type { RouteLUT } from '../src/types';

// A tiny synthetic LUT: a straight 10 m line east at 1 m spacing.
function straightLut(): RouteLUT {
  const count = 11;
  const lng: number[] = [];
  const lat: number[] = [];
  // ~1 m of longitude at the equator is ~8.98e-6 deg; keep lat 0 for simplicity.
  const dLng = 1 / 111320;
  for (let i = 0; i < count; i++) {
    lng.push(i * dLng);
    lat.push(0);
  }
  return { stepM: 1, count, lengthM: 10, lng, lat };
}

describe('haversineMeters', () => {
  it('measures ~1 m for ~1 m of longitude at the equator', () => {
    const d = haversineMeters([0, 0], [1 / 111320, 0]);
    expect(d).toBeGreaterThan(0.9);
    expect(d).toBeLessThan(1.1);
  });
  it('is zero for identical points', () => {
    expect(haversineMeters([115.8, -31.9], [115.8, -31.9])).toBe(0);
  });
});

describe('progressToCoord', () => {
  const lut = straightLut();
  it('returns the start at 0 and below 0 (clamp)', () => {
    expect(progressToCoord(lut, 0)).toEqual([lut.lng[0], lut.lat[0]]);
    expect(progressToCoord(lut, -50)).toEqual([lut.lng[0], lut.lat[0]]);
  });
  it('returns the end at length and beyond (clamp)', () => {
    const end = [lut.lng[lut.count - 1], lut.lat[lut.count - 1]];
    expect(progressToCoord(lut, 10)).toEqual(end);
    expect(progressToCoord(lut, 999)).toEqual(end);
  });
  it('lerps between samples', () => {
    const c = progressToCoord(lut, 2.5);
    expect(c[0]).toBeCloseTo(2.5 / 111320, 9);
    expect(c[1]).toBe(0);
  });
});

describe('bearingDeg', () => {
  it('points east as ~90 degrees', () => {
    expect(bearingDeg([0, 0], [1, 0])).toBeCloseTo(90, 0);
  });
  it('points north as ~0 degrees', () => {
    expect(bearingDeg([0, 0], [0, 1])).toBeCloseTo(0, 0);
  });
});

describe('computeBounds', () => {
  it('encloses all coordinates as [w,s,e,n]', () => {
    expect(computeBounds([2, -1, 3], [5, 0, -2])).toEqual([-1, -2, 3, 5]);
  });
});

describe('formatClock / formatDelta', () => {
  it('formats mm:ss', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(1980000)).toBe('33:00');
    expect(formatClock(65000)).toBe('1:05');
  });
  it('signs the delta, negative = early', () => {
    expect(formatDelta(-65000)).toBe('-1:05');
    expect(formatDelta(12000)).toBe('+0:12');
    expect(formatDelta(0)).toBe('+0:00');
    expect(formatDelta(null)).toBe('—');
  });
});

describe('angleDelta', () => {
  it('takes the shortest path across the 0/360 seam', () => {
    expect(angleDelta(350, 10)).toBe(20);
    expect(angleDelta(10, 350)).toBe(-20);
    expect(angleDelta(0, 180)).toBe(180);
  });
});

describe('lerp', () => {
  it('interpolates', () => {
    expect(lerp(0, 10, 0.25)).toBe(2.5);
  });
});
