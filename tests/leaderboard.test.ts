import { describe, it, expect, beforeEach } from 'vitest';
import { createLeaderboard } from '../src/leaderboard';
import type { Runner } from '../src/types';

function runner(id: string, predicted: number, actual: number | null): Runner {
  return {
    id,
    name: id.toUpperCase(),
    color: '#fff',
    predictedFinishMs: predicted,
    actualFinishMs: actual,
    deltaMs: actual === null ? null : actual - predicted,
    hasGps: false,
    noData: actual === null,
  };
}

const runners = [
  runner('slow', 100_000, 200_000), // +100s
  runner('close', 100_000, 102_000), // +2s ← winner
  runner('early', 100_000, 150_000), // +50s
];

function rowIds(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.lb-row')).map(
    (el) => (el as HTMLElement).dataset.id as string,
  );
}

describe('createLeaderboard', () => {
  let container: HTMLElement;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('shows roster order with "running" before anyone finishes', () => {
    const lb = createLeaderboard(container, runners, { onSelect: () => {} });
    lb.update(0);
    expect(rowIds(container)).toEqual(['slow', 'close', 'early']);
    const deltas = Array.from(container.querySelectorAll('.lb-delta')).map((e) => e.textContent);
    expect(deltas.every((d) => d === 'running')).toBe(true);
  });

  it('re-sorts finishers by |delta| ahead of still-running', () => {
    const lb = createLeaderboard(container, runners, { onSelect: () => {} });
    lb.update(160_000); // close + early finished, slow not
    expect(rowIds(container)).toEqual(['close', 'early', 'slow']);
  });

  it('marks the closest finisher as winner with a trophy', () => {
    const lb = createLeaderboard(container, runners, { onSelect: () => {} });
    lb.update(999_000);
    const winnerRow = container.querySelector('.lb-row.winner') as HTMLElement;
    expect(winnerRow.dataset.id).toBe('close');
    expect(winnerRow.querySelector('.lb-rank')!.textContent).toBe('🏆');
  });

  it('formats signed deltas with early/late sign', () => {
    const lb = createLeaderboard(container, runners, { onSelect: () => {} });
    lb.update(999_000);
    const close = container.querySelector('[data-id="close"] .lb-delta') as HTMLElement;
    expect(close.textContent).toBe('+0:02');
    expect(close.dataset.sign).toBe('late');
  });

  it('fires onSelect with the runner id when a row is clicked', () => {
    let picked: string | null = null;
    const lb = createLeaderboard(container, runners, { onSelect: (id) => (picked = id) });
    lb.update(0);
    (container.querySelector('[data-id="early"]') as HTMLButtonElement).click();
    expect(picked).toBe('early');
  });

  it('reflects selection via data-sel and the selected class', () => {
    const lb = createLeaderboard(container, runners, { onSelect: () => {} });
    lb.update(0);
    lb.setSelected('close');
    expect(container.dataset.sel).toBe('close');
    expect((container.querySelector('[data-id="close"]') as HTMLElement).classList.contains('selected')).toBe(true);
    lb.setSelected(null);
    expect(container.dataset.sel).toBe('');
  });

  describe('pre-race start list', () => {
    // All no-data (no actual time) -> the board is a start list, not results.
    const startList = [
      runner('cam', 130_000, null),
      runner('aaron', 90_000, null),
      runner('bram', 110_000, null),
    ];

    it('orders by predicted finish and shows each predicted time', () => {
      const lb = createLeaderboard(container, startList, { onSelect: () => {} }, true);
      lb.update(0);
      expect(rowIds(container)).toEqual(['aaron', 'bram', 'cam']);
      const deltas = Array.from(container.querySelectorAll('.lb-delta')).map((e) => e.textContent);
      expect(deltas).toEqual(['1:30', '1:50', '2:10']);
      const ranks = Array.from(container.querySelectorAll('.lb-rank')).map((e) => e.textContent);
      expect(ranks).toEqual(['1', '2', '3']);
      expect(
        (container.querySelector('[data-id="aaron"] .lb-delta') as HTMLElement).dataset.sign,
      ).toBe('pred');
    });

    it('never re-sorts on update (no live result to form) and still selects', () => {
      const lb = createLeaderboard(container, startList, { onSelect: () => {} }, true);
      lb.update(999_000);
      expect(rowIds(container)).toEqual(['aaron', 'bram', 'cam']);
      lb.setSelected('bram');
      expect(container.dataset.sel).toBe('bram');
      expect(
        (container.querySelector('[data-id="bram"]') as HTMLElement).classList.contains('selected'),
      ).toBe(true);
    });
  });
});
