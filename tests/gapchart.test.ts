import { describe, it, expect } from 'vitest';
import { gapSecAt } from '../src/gapchart';
import type { Runner } from '../src/types';

const L = 1000;

function fallback(predicted: number, actual: number): Runner {
  return {
    id: 'r',
    name: 'R',
    color: '#fff',
    predictedFinishMs: predicted,
    actualFinishMs: actual,
    deltaMs: actual - predicted,
    hasGps: false,
  };
}

describe('gapSecAt', () => {
  it('is ~0 throughout for a runner exactly on prediction', () => {
    const r = fallback(100_000, 100_000);
    for (const t of [0, 25_000, 50_000, 99_000, 100_000]) {
      expect(gapSecAt(r, t, L)).toBeCloseTo(0, 6);
    }
  });

  it('converges to -delta at the finish for an EARLY runner', () => {
    const r = fallback(100_000, 90_000); // 10 s early, delta -10s
    expect(gapSecAt(r, 90_000, L)).toBeCloseTo(10, 6); // +10 s ahead
    // mid-run it is already positive (ahead of schedule)
    expect(gapSecAt(r, 45_000, L)).toBeGreaterThan(0);
  });

  it('converges to -delta at the finish for a LATE runner (the bug case)', () => {
    const r = fallback(100_000, 120_000); // 20 s late, delta +20s
    // Just before finishing, and at finish, it must approach -20 s, not 0.
    const nearEnd = gapSecAt(r, 119_000, L);
    expect(nearEnd).toBeLessThan(-19);
    expect(nearEnd).toBeGreaterThan(-20.1);
    expect(gapSecAt(r, 120_000, L)).toBeCloseTo(-20, 6);
    expect(gapSecAt(r, 60_000, L)).toBeLessThan(0); // behind schedule mid-run
  });

  it('locks the value after the runner finishes', () => {
    const r = fallback(100_000, 90_000);
    expect(gapSecAt(r, 90_000, L)).toBeCloseTo(10, 6);
    expect(gapSecAt(r, 200_000, L)).toBeCloseTo(10, 6); // still 10 s, locked
  });

  it('matches the leaderboard delta in sign and magnitude', () => {
    const r = fallback(100_000, 113_000); // delta +13s (late)
    const finalGap = gapSecAt(r, r.actualFinishMs as number, L);
    expect(finalGap).toBeCloseTo(-(r.deltaMs as number) / 1000, 6);
  });
});
