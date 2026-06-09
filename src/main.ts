import './style.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl from 'maplibre-gl';
import { createMap } from './map';
import { Clock } from './clock';
import { createTransport } from './transport';
import { createEngine } from './engine';
import { createLeaderboard } from './leaderboard';
import { createLayout } from './layout';
import { createGapChart } from './gapchart';
import { formatDelta } from './geo';
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

  const transport = createTransport(
    document.getElementById('transport') as HTMLElement,
    clock,
    { runners: data.runners, durationMs: data.race.durationMs },
  );
  frames.push((t) => transport.update(t));

  function loop(): void {
    const t = clock.tick();
    for (const f of frames) f(t);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // The engine needs the style loaded before it can add its layers.
  await handle.whenReady;

  const engine = createEngine(handle.map, data);
  frames.push((t) => engine.render(t));

  // --- selection + on-map label (U6) -------------------------------------
  const runnersById = new Map(data.runners.map((r) => [r.id, r]));
  const startPos = data.race.startLngLat;
  let selectedId: string | null = null;

  const labelEl = document.createElement('div');
  labelEl.className = 'runner-label';
  const labelMarker = new maplibregl.Marker({ element: labelEl, anchor: 'bottom', offset: [0, -14] });

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

  function setSelection(id: string | null): void {
    selectedId = id;
    engine.setSelected(id);
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

  // Tap a runner on the map to select; tap empty map to deselect.
  handle.map.on('click', 'runners-icon', (e) => {
    const id = e.features?.[0]?.id;
    if (id != null) setSelection(String(id));
  });
  handle.map.on('click', (e) => {
    const hit = handle.map.queryRenderedFeatures(e.point, { layers: ['runners-icon'] });
    if (hit.length === 0) setSelection(null);
  });
  handle.map.on('mouseenter', 'runners-icon', () => {
    handle.map.getCanvas().style.cursor = 'pointer';
  });
  handle.map.on('mouseleave', 'runners-icon', () => {
    handle.map.getCanvas().style.cursor = '';
  });

  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__fctc = { clock, engine, data };
  }

  // The gap chart (U7) pushes its callback here too.

  boot.hidden = true;
}

void main();
