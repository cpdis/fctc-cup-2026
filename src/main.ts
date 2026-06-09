import './style.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import { createMap } from './map';
import { Clock } from './clock';
import { createTransport } from './transport';
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

  // The render engine (U5), leaderboard (U6), and gap chart (U7) push their own
  // per-frame callbacks here as they come online.

  function loop(): void {
    const t = clock.tick();
    for (const f of frames) f(t);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  await handle.whenReady;
  boot.hidden = true;
}

void main();
