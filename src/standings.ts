// Cup standings logic, shared by the transport (winner tick), leaderboard
// (live re-sort), and gap chart. The Cup is won by the smallest |delta| —
// closest actual finish to your own prediction — not by who's fastest.

import type { Runner } from './types';

export interface Standing {
  runner: Runner;
  /** True once this runner has crossed the line at the given time. */
  finished: boolean;
  /** Signed delta in ms once finished, else null. */
  deltaMs: number | null;
}

/** Final Cup winner: the runner whose real finish was closest to prediction. */
export function finalWinnerId(runners: Runner[]): string | null {
  let best: Runner | null = null;
  for (const r of runners) {
    if (r.deltaMs === null) continue;
    if (best === null || Math.abs(r.deltaMs) < Math.abs(best.deltaMs as number)) {
      best = r;
    }
  }
  return best?.id ?? null;
}

/**
 * Standings at race-elapsed time `t`: finishers (sorted by |delta| ascending)
 * first, then still-running and no-data runners. Stable within each group by
 * roster order so the list doesn't jitter between equal entries.
 */
export function liveStandings(runners: Runner[], t: number): Standing[] {
  const decorated = runners.map((runner, i) => {
    const finished =
      !runner.noData &&
      runner.actualFinishMs !== null &&
      t >= runner.actualFinishMs;
    return {
      runner,
      finished,
      deltaMs: finished ? runner.deltaMs : null,
      order: i,
    };
  });

  decorated.sort((a, b) => {
    if (a.finished && b.finished) {
      const d = Math.abs(a.deltaMs as number) - Math.abs(b.deltaMs as number);
      return d !== 0 ? d : a.order - b.order;
    }
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    return a.order - b.order;
  });

  return decorated.map(({ runner, finished, deltaMs }) => ({
    runner,
    finished,
    deltaMs,
  }));
}
