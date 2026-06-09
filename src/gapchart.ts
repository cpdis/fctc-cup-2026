// The gap chart: one line per runner showing how many seconds ahead of (or
// behind) their own prediction they are, over race time. Each line converges to
// its final Cup delta, so the chart literally shows the standings forming
// (KTD9). Above the centerline = beating your pick. Doubles as a scrubber.
//
// gap(t): while running, it's the icon's lead over its ghost converted to time
// (distance lead / ghost pace). At the finish that equals predicted - actual,
// so it lands exactly on -delta; after finishing it's locked there.

import type { Clock } from './clock';
import type { ReplayData, Runner } from './types';
import { iconProgressAt } from './engine';

const NS = 'http://www.w3.org/2000/svg';
const VW = 1000; // viewBox width (aspect handled by CSS)
const VH = 240;
const PAD_Y = 24;
const SAMPLES = 320;
const MIN_RANGE_S = 30; // never squash the axis below ±30 s

export interface GapChartHandle {
  update(raceMs: number): void;
  setSelected(id: string | null): void;
}

/**
 * Seconds ahead(+)/behind(-) of own prediction at race time t.
 *
 * timeAhead = (predicted time to reach the runner's current spot) - (actual t)
 *           = iconProgress / ghostPace - t
 *
 * At the finish this is predicted - actualFinish = -delta, for early AND late
 * runners, so the line lands exactly on the runner's final Cup delta. (Using the
 * ghost's *clamped* progress here would break convergence for late runners,
 * whose ghost finishes first — so we compute against the unclamped pace.)
 */
export function gapSecAt(r: Runner, t: number, L: number): number {
  const finish = r.actualFinishMs as number;
  if (t >= finish) return -(r.deltaMs as number) / 1000;
  const ghostPace = L / r.predictedFinishMs; // m per ms (unclamped)
  return (iconProgressAt(r, t, L) / ghostPace - t) / 1000;
}

export function createGapChart(
  container: HTMLElement,
  data: ReplayData,
  clock: Clock,
): GapChartHandle {
  const L = data.race.routeLengthM;
  const duration = data.race.durationMs;
  const runners = data.runners.filter((r) => !r.noData);

  // Sample every runner once; find the symmetric y-range.
  const series = runners.map((r) => {
    const pts: number[] = [];
    for (let i = 0; i < SAMPLES; i++) pts.push(gapSecAt(r, (i / (SAMPLES - 1)) * duration, L));
    return { r, pts };
  });
  let maxAbs = MIN_RANGE_S;
  for (const s of series) for (const v of s.pts) maxAbs = Math.max(maxAbs, Math.abs(v));
  maxAbs *= 1.1;

  const x = (t: number): number => (t / duration) * VW;
  const y = (sec: number): number => VH / 2 - (sec / maxAbs) * (VH / 2 - PAD_Y);

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.classList.add('gc-svg');

  // centerline + ahead/behind labels
  const center = line(0, VH / 2, VW, VH / 2, 'gc-center');
  svg.appendChild(center);

  const polys = new Map<string, SVGPolylineElement>();
  for (const { r, pts } of series) {
    const poly = document.createElementNS(NS, 'polyline');
    poly.setAttribute(
      'points',
      pts.map((v, i) => `${x((i / (SAMPLES - 1)) * duration).toFixed(1)},${y(v).toFixed(1)}`).join(' '),
    );
    poly.setAttribute('fill', 'none');
    poly.setAttribute('stroke', r.color);
    poly.classList.add('gc-line');
    poly.dataset.id = r.id;
    polys.set(r.id, poly);
    svg.appendChild(poly);
  }

  const playhead = line(0, 0, 0, VH, 'gc-playhead');
  svg.appendChild(playhead);
  container.appendChild(svg);

  const axis = document.createElement('div');
  axis.className = 'gc-axis';
  axis.innerHTML = `<span class="gc-ahead">ahead</span><span class="gc-mid">vs prediction</span><span class="gc-behind">behind</span>`;
  container.appendChild(axis);

  // --- scrub by dragging the chart ---------------------------------------
  function seekFromEvent(e: PointerEvent): void {
    const rect = svg.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    clock.seek(f * duration);
  }
  let dragging = false;
  svg.addEventListener('pointerdown', (e) => {
    dragging = true;
    svg.setPointerCapture?.(e.pointerId);
    seekFromEvent(e);
  });
  svg.addEventListener('pointermove', (e) => dragging && seekFromEvent(e));
  const end = (e: PointerEvent): void => {
    dragging = false;
    svg.releasePointerCapture?.(e.pointerId);
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);

  return {
    update(raceMs: number): void {
      const px = x(raceMs);
      playhead.setAttribute('x1', String(px));
      playhead.setAttribute('x2', String(px));
    },
    setSelected(id: string | null): void {
      container.dataset.sel = id ?? '';
      for (const [rid, poly] of polys) poly.classList.toggle('sel', rid === id);
      // Raise the selected line above the others.
      if (id && polys.has(id)) svg.appendChild(polys.get(id)!);
    },
  };
}

function line(x1: number, y1: number, x2: number, y2: number, cls: string): SVGLineElement {
  const l = document.createElementNS(NS, 'line');
  l.setAttribute('x1', String(x1));
  l.setAttribute('y1', String(y1));
  l.setAttribute('x2', String(x2));
  l.setAttribute('y2', String(y2));
  l.classList.add(cls);
  return l;
}
