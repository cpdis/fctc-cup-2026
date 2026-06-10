// Cup standings: live-sorted by closeness to prediction. Rows slide (FLIP) when
// the order changes — which only happens as runners finish — so the DOM is
// touched only on real changes, not every frame. Selecting a row highlights
// that runner everywhere (shared dim token) via the onSelect callback.

import type { Runner } from './types';
import { liveStandings, finalWinnerId } from './standings';
import { formatClock, formatDelta } from './geo';

export interface LeaderboardHandle {
  update(raceMs: number): void;
  setSelected(id: string | null): void;
}

export function createLeaderboard(
  container: HTMLElement,
  runners: Runner[],
  opts: { onSelect: (id: string) => void },
): LeaderboardHandle {
  const winnerId = finalWinnerId(runners);
  const rows = new Map<string, HTMLButtonElement>();

  for (const r of runners) {
    const row = document.createElement('button');
    row.className = 'lb-row';
    row.type = 'button';
    row.dataset.id = r.id;
    row.innerHTML = `
      <span class="lb-rank"></span>
      <span class="lb-swatch" style="background:${r.color}"></span>
      <span class="lb-name">${escapeHtml(r.name)}</span>
      <span class="lb-delta">${r.noData ? 'no data' : 'running'}</span>`;
    row.addEventListener('click', () => opts.onSelect(r.id));
    rows.set(r.id, row);
    container.appendChild(row);
  }

  let lastOrderKey = '';

  function paintRow(row: HTMLButtonElement, rank: number, finished: boolean, runner: Runner): void {
    const isWinner = finished && runner.id === winnerId;
    row.querySelector('.lb-rank')!.textContent = isWinner ? '🏆' : finished ? String(rank) : '·';
    const deltaEl = row.querySelector('.lb-delta') as HTMLElement;
    if (runner.noData) {
      deltaEl.textContent = 'no data';
      deltaEl.dataset.sign = 'none';
    } else if (finished) {
      deltaEl.textContent = formatDelta(runner.deltaMs);
      deltaEl.dataset.sign = (runner.deltaMs ?? 0) < 0 ? 'early' : 'late';
    } else {
      deltaEl.textContent = 'running';
      deltaEl.dataset.sign = 'running';
    }
    row.classList.toggle('finished', finished);
    row.classList.toggle('winner', isWinner);
    row.title = `${runner.name} · predicted ${formatClock(runner.predictedFinishMs)}`;
  }

  return {
    update(raceMs: number): void {
      const standings = liveStandings(runners, raceMs);
      const orderKey = standings.map((s) => `${s.runner.id}${s.finished ? '1' : '0'}`).join();
      if (orderKey === lastOrderKey) return; // nothing changed; skip all DOM work
      lastOrderKey = orderKey;

      // FLIP: First (measure), reorder + repaint (Last), Invert + Play.
      const first = new Map<string, number>();
      for (const [id, el] of rows) first.set(id, el.getBoundingClientRect().top);

      standings.forEach((s, i) => {
        const row = rows.get(s.runner.id)!;
        container.appendChild(row); // reorder
        paintRow(row, i + 1, s.finished, s.runner);
      });

      for (const [id, el] of rows) {
        const dy = (first.get(id) ?? 0) - el.getBoundingClientRect().top;
        if (!dy) continue;
        el.style.transition = 'none';
        el.style.transform = `translateY(${dy}px)`;
        requestAnimationFrame(() => {
          el.style.transition = 'transform var(--dur-move) var(--ease-move)';
          el.style.transform = '';
        });
      }
    },

    setSelected(id: string | null): void {
      container.dataset.sel = id ?? '';
      for (const [rid, el] of rows) el.classList.toggle('selected', rid === id);
    },
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
