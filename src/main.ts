import './style.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl from 'maplibre-gl';
import confetti from 'canvas-confetti';
import { createMap } from './map';
import { createAutoCamera } from './camera';
import { createFigures } from './figures';
import { Clock } from './clock';
import { createTransport } from './transport';
import { createEngine } from './engine';
import { createLeaderboard } from './leaderboard';
import { createLayout } from './layout';
import { createGapChart } from './gapchart';
import { finalWinnerId } from './standings';
import { formatDelta } from './geo';
import { toggleTheme, onThemeChange } from './theme';
import type { ReplayData } from './types';

/** Subsystems that need a per-frame tick (transport, engine, gap chart…). */
type FrameFn = (raceMs: number) => void;

const boot = document.getElementById('boot') as HTMLElement;

function fail(msg: string): void {
  boot.textContent = msg;
  boot.dataset.error = 'true';
}

async function loadReplay(): Promise<ReplayData | null> {
  try {
    const res = await fetch(import.meta.env.BASE_URL + 'replay.json', {
      cache: 'no-cache',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ReplayData;
  } catch {
    fail('No replay.json yet — run `npm run bake`.');
    return null;
  }
}

async function main(): Promise<void> {
  const data = await loadReplay();
  if (!data) return;

  const mapEl = document.getElementById('map') as HTMLElement;
  const handle = createMap(mapEl, data.race, data.route);

  const clock = new Clock({ durationMs: data.race.durationMs });
  const frames: FrameFn[] = [];

  // Idle-frame gating: do per-frame work only when time is actually moving or
  // the view is mid-transition (entrance, selection, camera glide). When the
  // replay is paused or parked at the finish, a frame costs one clock read —
  // the winner halo pulses in CSS, so nothing needs JS. (A hot frame is the
  // expensive thing: two GeoJSON setDatas + a map repaint.)
  let lastT = -1;
  let dirtyUntil = performance.now() + 1300; // covers the entrance stagger
  const markDirty = (ms = 700): void => {
    dirtyUntil = Math.max(dirtyUntil, performance.now() + ms);
  };
  let cameraSettling = (): boolean => false; // bound once the map is ready

  // Theme toggle: CSS swaps instantly via data-theme; the map swaps styles and
  // the route/runner layers re-add themselves — keep frames hot while the new
  // style settles so the re-added (empty) sources get repainted even if paused.
  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
  onThemeChange(() => markDirty(8000));

  const transport = createTransport(
    document.getElementById('transport') as HTMLElement,
    clock,
    { runners: data.runners, durationMs: data.race.durationMs },
  );
  frames.push((t) => transport.update(t));

  const root = document.documentElement;
  function loop(): void {
    const t = clock.tick();
    // The figures' run-cycle pauses in CSS whenever the clock isn't running.
    const racing = String(clock.playing);
    if (root.dataset.racing !== racing) root.dataset.racing = racing;
    if (t !== lastT || performance.now() < dirtyUntil || cameraSettling()) {
      lastT = t;
      for (const f of frames) f(t);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // The engine needs the style loaded before it can add its layers.
  await handle.whenReady;

  const winnerId = finalWinnerId(data.runners);
  const engine = createEngine(handle.map, data);
  frames.push((t) => engine.render(t));

  // Figures ride the engine's positions, so they must update after it.
  const figures = createFigures(
    handle.map,
    data.runners.filter((r) => !r.noData),
    (id) => engine.positionOf(id),
    (id) => setSelection(selectedId === id ? null : id),
  );
  frames.push((t) => figures.update(t));
  // The style load can outlast the boot dirty window; without this the engine
  // never paints its first (paused, t=0) frame and the start line looks empty.
  markDirty(1600); // covers the staggered entrance

  // --- auto camera ---------------------------------------------------------
  // Follows the pack: in tight on the start huddle, widening as the field
  // strings out. Any manual pan/zoom hands the camera back to the user; the
  // masthead button re-arms it.
  const camera = createAutoCamera(handle.map, { padding: handle.fitPadding });
  cameraSettling = () => camera.settling();
  frames.push(() => camera.onFrame(engine.positionsSnapshot()));

  const camBtn = document.getElementById('cam-toggle') as HTMLButtonElement | null;
  if (camBtn) {
    const syncCam = (on: boolean): void => {
      camBtn.classList.toggle('active', on);
      camBtn.setAttribute('aria-pressed', String(on));
    };
    camBtn.addEventListener('click', () => {
      camera.setEnabled(!camera.enabled());
      markDirty(2500); // let the glide back to the pack play out
    });
    camera.onChange(syncCam);
    syncCam(camera.enabled());
  }

  // --- selection + on-map label (U6) -------------------------------------
  const runnersById = new Map(data.runners.map((r) => [r.id, r]));
  const startPos = data.race.startLngLat;
  let selectedId: string | null = null;

  const labelEl = document.createElement('div');
  labelEl.className = 'runner-label';
  const labelMarker = new maplibregl.Marker({ element: labelEl, anchor: 'bottom', offset: [0, -32] });

  const leaderboard = createLeaderboard(
    document.getElementById('leaderboard') as HTMLElement,
    data.runners,
    { onSelect: (id) => setSelection(selectedId === id ? null : id) },
  );
  frames.push((t) => leaderboard.update(t));

  createLayout(
    document.getElementById('panel') as HTMLElement,
    document.getElementById('sheet-handle') as HTMLElement,
  );

  // Gap chart. On phones it lives at the top of the bottom sheet; on desktop
  // it's a wide strip above the transport (CSS owns position).
  const gapEl = document.getElementById('gapchart') as HTMLElement;
  if (matchMedia('(max-width: 900px)').matches) {
    const panel = document.getElementById('panel') as HTMLElement;
    panel.insertBefore(gapEl, document.getElementById('leaderboard'));
    gapEl.classList.add('in-sheet');
  }
  const gapChart = createGapChart(gapEl, data, clock);
  frames.push((t) => gapChart.update(t));

  // --- finish pops ---------------------------------------------------------
  // The moment a runner crosses the line, their name + delta floats up from
  // their corral slot, so every finish is announced even when markers overlap.
  let prevT = -1;
  frames.push((t) => {
    const from = prevT;
    prevT = t;
    // Only on a modest forward step (normal playback): a scrub or a finish-tick
    // tween jumps minutes at a time and would fire a storm of stale pops.
    if (from < 0 || t <= from || t - from > 120_000) return;
    for (const r of data.runners) {
      const f = r.actualFinishMs;
      if (f === null || f <= from || f > t) continue;
      // MapLibre positions the marker element via an inline transform, so the
      // float animation lives on an inner child (animating the marker element
      // itself would override that transform and park the chip at 0,0).
      const el = document.createElement('div');
      const chip = document.createElement('div');
      chip.className = 'finish-pop';
      chip.style.setProperty('--fp-color', r.color);
      chip.innerHTML = `<b>${r.name}</b><em>${formatDelta(r.deltaMs)}</em>`;
      el.appendChild(chip);
      const m = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -32] })
        .setLngLat(engine.positionOf(r.id) ?? startPos)
        .addTo(handle.map);
      setTimeout(() => m.remove(), 2600);
    }
  });

  // --- winner halo ---------------------------------------------------------
  // A CSS-pulsed DOM marker on the winner's parked dot: the finished state
  // animates entirely in the compositor, so the frame loop can go idle.
  // Pulse animates an inner child; the marker element's transform belongs to
  // MapLibre (same trap as the finish-pop chips above).
  const haloOuter = document.createElement('div');
  const haloEl = document.createElement('div');
  haloEl.className = 'winner-halo';
  haloOuter.appendChild(haloEl);
  const haloMarker = new maplibregl.Marker({ element: haloOuter });
  let haloShown = false;
  frames.push((t) => {
    if (!winnerId) return;
    const w = runnersById.get(winnerId)!;
    const done = w.actualFinishMs !== null && t >= w.actualFinishMs;
    if (done && !haloShown) {
      haloShown = true;
      haloEl.style.setProperty('--halo-color', w.color);
      haloMarker.setLngLat(engine.positionOf(winnerId) ?? startPos).addTo(handle.map);
    } else if (!done && haloShown) {
      haloShown = false;
      haloMarker.remove();
    }
  });

  // --- winner reveal (U8) ------------------------------------------------
  const winnerEl = document.getElementById('winner') as HTMLElement;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let revealed = false;
  frames.push((t) => {
    if (!winnerId) return;
    const w = runnersById.get(winnerId)!;
    const done = w.actualFinishMs !== null && t >= w.actualFinishMs && clock.atEnd;
    if (done && !revealed) {
      revealed = true;
      winnerEl.style.setProperty('--w-color', w.color);
      winnerEl.innerHTML = `<span class="w-trophy">🏆</span><span class="w-text"><b>${w.name}</b> wins the Cup <em>${formatDelta(w.deltaMs)}</em></span>`;
      winnerEl.hidden = false;
      // Confetti bursts from behind the card (canvas sits under it, z-wise).
      if (!reducedMotion) {
        const burst = (angle: number, x: number): void => {
          void confetti({
            particleCount: 90,
            angle,
            spread: 65,
            startVelocity: 55,
            gravity: 0.9,
            ticks: 240,
            origin: { x, y: 0.5 },
            zIndex: 29, // just under #winner (z-index 30)
            colors: [w.color, '#ffd23f', '#ffffff', '#3fe0a0', '#ff6fb5'],
          });
        };
        burst(60, 0.42);
        burst(120, 0.58);
        setTimeout(() => {
          burst(75, 0.45);
          burst(105, 0.55);
        }, 350);
      }
    } else if (!done && revealed) {
      revealed = false;
      winnerEl.hidden = true;
      confetti.reset();
    }
  });

  function setSelection(id: string | null): void {
    selectedId = id;
    markDirty(700); // let the dim / label transition play out
    engine.setSelected(id);
    figures.setSelected(id);
    leaderboard.setSelected(id);
    gapChart.setSelected(id);
    if (id) {
      const r = runnersById.get(id)!;
      labelEl.innerHTML = `<span class="rl-name">${r.name}</span><span class="rl-delta"></span>`;
      labelEl.style.setProperty('--rl-color', r.color);
      // Position before adding, or MapLibre reads lng of an undefined LngLat.
      labelMarker.setLngLat(engine.positionOf(id) ?? startPos);
      labelMarker.addTo(handle.map);
    } else {
      labelMarker.remove();
    }
  }

  // Keep the label glued to the selected icon, with a live delta once finished.
  frames.push((t) => {
    if (!selectedId) return;
    const p = engine.positionOf(selectedId);
    if (p) labelMarker.setLngLat(p);
    const r = runnersById.get(selectedId)!;
    const deltaEl = labelEl.querySelector('.rl-delta') as HTMLElement | null;
    if (deltaEl) {
      const done = r.actualFinishMs !== null && t >= r.actualFinishMs;
      deltaEl.textContent = done ? formatDelta(r.deltaMs) : '';
    }
  });

  // Figures select themselves (DOM click in figures.ts); a tap on empty map
  // deselects. Marker clicks stopPropagation, so they never reach this.
  handle.map.on('click', () => setSelection(null));

  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__fctc = {
      clock,
      engine,
      data,
      camera,
      map: handle.map,
      fitPadding: handle.fitPadding,
    };
  }

  // The gap chart (U7) pushes its callback here too.

  boot.hidden = true;
}

void main();
