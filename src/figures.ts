// Runner figures: each runner is a little CSS-animated stick figure (head in
// the runner's colour) on a DOM marker, instead of a flat dot. The engine
// stays the single source of truth for WHERE a runner is (positionOf); this
// module only owns how that looks.
//
// Why DOM markers and not a symbol layer: the run-cycle animates limbs in CSS
// (compositor-only, pauses for free via animation-play-state), whereas sprite
// frames on a symbol layer would re-run symbol placement every frame. Marker
// positioning is 11 transform writes per hot frame — cheap.
//
// Marker rule (learned the hard way): MapLibre positions the marker element
// via an inline transform, so every transform of ours (flip, scale, limb
// swings) lives on inner elements.

import maplibregl, { type Map as MlMap } from 'maplibre-gl';
import type { LngLat, Runner } from './types';

const ENTRANCE_STAGGER_MS = 55;
const FACE_EPS = 1e-6; // min lng delta before we flip the facing

// One stride = legs/arms swinging around a neutral standing pose, so a figure
// with its animation removed (paused/finished) just stands.
const FIGURE_SVG = `
<svg viewBox="0 0 24 30" width="22" height="28" aria-hidden="true">
  <g class="fig-lean">
    <g class="fig-bob">
      <path class="fig-limb fig-arm fig-arm-b" d="M12.2 13 L10 17 L11.5 20.5" />
      <path class="fig-limb fig-leg fig-leg-b" d="M11.4 19 L10.5 23.5 L10 28" />
      <path class="fig-limb fig-torso" d="M13 9.6 L11.4 19" />
      <path class="fig-limb fig-leg fig-leg-f" d="M11.4 19 L12.5 23.5 L13 28" />
      <path class="fig-limb fig-arm fig-arm-f" d="M12.2 13 L14.5 16.5 L17 18.5" />
      <circle class="fig-head" cx="13.6" cy="6" r="3.7" />
    </g>
  </g>
</svg>`;

export interface FiguresHandle {
  /** Move every figure to the engine's position for this frame. */
  update(raceMs: number): void;
  setSelected(id: string | null): void;
}

interface Fig {
  runner: Runner;
  marker: maplibregl.Marker;
  el: HTMLElement; // inner element: flip/dim/scale live here
  lastLng: number;
  facing: 1 | -1;
  done: boolean;
}

export function createFigures(
  map: MlMap,
  runners: Runner[],
  positionOf: (id: string) => LngLat | undefined,
  onSelect: (id: string) => void,
  winnerId?: string | null,
  prerace = false,
): FiguresHandle {
  // Stride cadence follows predicted pace: the bold predictions scurry, the
  // cautious ones lope. Mapped across the field to 0.46–0.68 s per stride.
  const preds = runners.map((r) => r.predictedFinishMs);
  const minP = Math.min(...preds);
  const spanP = Math.max(...preds) - minP || 1;

  const figs: Fig[] = runners.map((runner, i) => {
    const outer = document.createElement('div');
    const el = document.createElement('div');
    el.className = 'runner-fig';
    if (runner.id === winnerId) {
      el.classList.add('winner');
      outer.style.zIndex = '2'; // above the corral crowd
    }
    el.style.setProperty('--fig-color', runner.color);
    const stride = 0.46 + 0.22 * ((runner.predictedFinishMs - minP) / spanP);
    el.style.setProperty('--fig-stride', `${stride.toFixed(3)}s`);
    // Desync the strides so the field doesn't run in lockstep.
    el.style.setProperty('--fig-phase', `${-((i * 97) % 550)}ms`);
    el.style.setProperty('--fig-delay', `${i * ENTRANCE_STAGGER_MS}ms`);
    el.innerHTML = FIGURE_SVG;
    const dust = document.createElement('div');
    dust.className = 'fig-dust';
    el.appendChild(dust);
    el.addEventListener('click', (e) => {
      e.stopPropagation(); // markers live in the canvas container; don't deselect
      onSelect(runner.id);
    });
    outer.appendChild(el);

    const marker = new maplibregl.Marker({ element: outer, anchor: 'bottom' });
    return { runner, marker, el, lastLng: NaN, facing: 1 as const, done: false };
  });

  let added = false;

  function update(raceMs: number): void {
    for (const f of figs) {
      const pos = positionOf(f.runner.id);
      if (!pos) continue;
      f.marker.setLngLat(pos);

      // Face the direction of travel (lng only; hold facing through the
      // near-vertical stretches).
      const dLng = pos[0] - f.lastLng;
      if (Number.isFinite(dLng) && Math.abs(dLng) > FACE_EPS) {
        const facing = dLng < 0 ? -1 : 1;
        if (facing !== f.facing) {
          f.facing = facing;
          f.el.classList.toggle('flip', facing === -1);
        }
      }
      f.lastLng = pos[0];

      // Pre-race, a runner "finishes" (and stops the run-cycle to stand in the
      // corral) at their predicted time, since there's no real finish yet.
      const finishMs = prerace ? f.runner.predictedFinishMs : f.runner.actualFinishMs;
      const done = finishMs !== null && raceMs >= finishMs;
      if (done !== f.done) {
        f.done = done;
        f.el.classList.toggle('done', done);
      }
    }
    if (!added) {
      added = true;
      for (const f of figs) f.marker.addTo(map);
      // Entrance plays via CSS once the .in class lands a frame after add.
      requestAnimationFrame(() => figs.forEach((f) => f.el.classList.add('in')));
    }
  }

  return {
    update,
    setSelected(id: string | null): void {
      for (const f of figs) {
        const sel = f.runner.id === id;
        f.el.classList.toggle('sel', sel);
        f.el.classList.toggle('dim', id !== null && !sel);
        // Stacking: selected on top, winner above the crowd, others natural.
        f.marker.getElement().style.zIndex = sel ? '3' : f.runner.id === winnerId ? '2' : '';
      }
    },
  };
}
