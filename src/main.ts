import './style.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import { createMap } from './map';
import { Clock } from './clock';
import { createTransport } from './transport';
import { createEngine } from './engine';
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

  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__fctc = { clock, engine, data };
  }

  // The leaderboard (U6) and gap chart (U7) push their callbacks here too.

  boot.hidden = true;
}

void main();
