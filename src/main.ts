import './style.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import { createMap } from './map';
import type { ReplayData } from './types';

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
  await handle.whenReady;

  boot.hidden = true;

  // Render engine, transport, leaderboard, and gap chart are wired in later
  // units once they exist. This keeps U1 a runnable map of the lake.
}

void main();
