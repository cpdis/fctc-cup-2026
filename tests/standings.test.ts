import { describe, it, expect } from 'vitest';
import { finalWinnerId, liveStandings } from '../src/standings';
import type { Runner } from '../src/types';

function runner(id: string, predicted: number, actual: number | null): Runner {
  return {
    id,
    name: id,
    color: '#fff',
    predictedFinishMs: predicted,
    actualFinishMs: actual,
    deltaMs: actual === null ? null : actual - predicted,
    hasGps: false,
    noData: actual === null,
  };
}

describe('finalWinnerId', () => {
  it('picks the smallest absolute delta', () => {
    const runners = [
      runner('a', 100_000, 110_000), // +10s
      runner('b', 100_000, 97_000), // -3s  ← closest
      runner('c', 100_000, 130_000), // +30s
    ];
    expect(finalWinnerId(runners)).toBe('b');
  });

  it('ignores no-data runners', () => {
    const runners = [runner('a', 100_000, null), runner('b', 100_000, 105_000)];
    expect(finalWinnerId(runners)).toBe('b');
  });

  it('returns null when nobody has a delta', () => {
    expect(finalWinnerId([runner('a', 100_000, null)])).toBe(null);
  });
});

describe('liveStandings', () => {
  const runners = [
    runner('slow', 100_000, 200_000), // finishes at 200s, +100s
    runner('close', 100_000, 102_000), // finishes at 102s, +2s
    runner('early', 100_000, 150_000), // finishes at 150s, +50s
  ];

  it('lists only finishers, sorted by |delta|, before still-running', () => {
    // At t=160s: close (102s) and early (150s) have finished; slow has not.
    const s = liveStandings(runners, 160_000);
    expect(s.map((x) => x.runner.id)).toEqual(['close', 'early', 'slow']);
    expect(s[0].finished).toBe(true);
    expect(s[1].finished).toBe(true);
    expect(s[2].finished).toBe(false);
  });

  it('treats nobody as finished before the first finish', () => {
    const s = liveStandings(runners, 50_000);
    expect(s.every((x) => !x.finished)).toBe(true);
  });

  it('ranks all three once everyone has finished', () => {
    const s = liveStandings(runners, 999_000);
    expect(s.map((x) => x.runner.id)).toEqual(['close', 'early', 'slow']);
    expect(s.every((x) => x.finished)).toBe(true);
  });
});
