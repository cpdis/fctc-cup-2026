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
  prerace = false,
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
      <span class="lb-actual"></span>
      <span class="lb-delta">${r.dns ? 'DNS' : r.noData ? 'no data' : 'running'}</span>`;
    row.addEventListener('click', () => opts.onSelect(r.id));
    rows.set(r.id, row);
    container.appendChild(row);
  }

  function setSelected(id: string | null): void {
    container.dataset.sel = id ?? '';
    for (const [rid, el] of rows) el.classList.toggle('selected', rid === id);
  }

  // Pre-race: there are no results, so the board is a static start list ordered
  // by predicted finish, with each runner's prediction in the delta column.
  if (prerace) {
    container.dataset.prerace = 'true';
    [...runners]
      .sort((a, b) => a.predictedFinishMs - b.predictedFinishMs)
      .forEach((r, i) => {
        const row = rows.get(r.id)!;
        container.appendChild(row); // reorder into start-list order
        row.querySelector('.lb-rank')!.textContent = String(i + 1);
        const deltaEl = row.querySelector('.lb-delta') as HTMLElement;
        deltaEl.textContent = formatClock(r.predictedFinishMs);
        deltaEl.dataset.sign = 'pred';
        row.title = `${r.name} · predicted ${formatClock(r.predictedFinishMs)}`;
      });
    return { update() {}, setSelected };
  }

  let lastOrderKey = '';

  function paintRow(row: HTMLButtonElement, rank: number, finished: boolean, runner: Runner): void {
    const isWinner = finished && runner.id === winnerId;
    row.querySelector('.lb-rank')!.textContent = isWinner ? '🏆' : finished ? String(rank) : '·';
    // Actual finish clock (blank until they cross the line).
    const actualEl = row.querySelector('.lb-actual') as HTMLElement;
    actualEl.textContent = finished ? formatClock(runner.actualFinishMs as number) : '';
    const deltaEl = row.querySelector('.lb-delta') as HTMLElement;
    if (runner.dns) {
      deltaEl.textContent = 'DNS';
      deltaEl.dataset.sign = 'none';
    } else if (runner.noData) {
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
    row.title = `${runner.name} · predicted ${formatClock(runner.predictedFinishMs)} · actual ${
      finished ? formatClock(runner.actualFinishMs as number) : '—'
    }`;
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

    setSelected,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
