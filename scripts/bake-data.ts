// Build-time orchestrator: route + roster + tracks/fallbacks -> public/replay.json.
// Run with `npm run bake`. This is the only thing that has to happen on race
// morning: drop GPX into data/tracks/, note any finish-only runners in
// data/fallbacks.json, run bake, deploy.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGpxFile } from './gpx';
import { buildRoute } from './route';
import { matchTrack } from './match';
import { colorFor } from '../src/palette';
import type { ReplayData, Runner } from '../src/types';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CANONICAL = resolve(ROOT, 'Inaugural_FCTC_.gpx');
const ROSTER = resolve(ROOT, 'data/roster.json');
const FALLBACKS = resolve(ROOT, 'data/fallbacks.json');
const OUT = resolve(ROOT, 'public/replay.json');
const DT_MS = 1000;

interface RosterEntry {
  id: string;
  name: string;
  /** Predicted finish as "mm:ss". */
  predicted: string;
  /** Optional GPX path relative to repo root; defaults to data/tracks/<id>.gpx. */
  gpx?: string;
  color?: string;
}

function parseMmSs(s: string): number {
  const [m, sec] = s.split(':').map(Number);
  return Math.round((m * 60 + sec) * 1000);
}

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function main(): void {
  const roster = readJson<RosterEntry[]>(ROSTER, []);
  const fallbacks = readJson<Record<string, string>>(FALLBACKS, {});
  if (roster.length === 0) {
    throw new Error(`No roster at ${ROSTER}. Run \`npm run seed-demo\` or add runners.`);
  }

  const { coords } = parseGpxFile(CANONICAL);
  const { lut, bounds, start } = buildRoute(coords, 1);

  const runners: Runner[] = [];
  let maxFinish = 0;

  roster.forEach((entry, i) => {
    const predictedFinishMs = parseMmSs(entry.predicted);
    const color = entry.color ?? colorFor(i);
    const gpxPath = entry.gpx
      ? resolve(ROOT, entry.gpx)
      : resolve(ROOT, 'data/tracks', `${entry.id}.gpx`);

    let runner: Runner;
    if (existsSync(gpxPath)) {
      const { points } = parseGpxFile(gpxPath);
      const matched = matchTrack(points, lut, DT_MS);
      runner = {
        id: entry.id,
        name: entry.name,
        color,
        predictedFinishMs,
        actualFinishMs: matched.finishMs,
        deltaMs: matched.finishMs - predictedFinishMs,
        hasGps: true,
        actual: {
          dtMs: matched.actual.dtMs,
          count: matched.actual.count,
          progressM: matched.actual.progressM.map((m) => round(m, 1)),
        },
      };
    } else if (fallbacks[entry.id]) {
      const actualFinishMs = parseMmSs(fallbacks[entry.id]);
      runner = {
        id: entry.id,
        name: entry.name,
        color,
        predictedFinishMs,
        actualFinishMs,
        deltaMs: actualFinishMs - predictedFinishMs,
        hasGps: false,
      };
    } else {
      runner = {
        id: entry.id,
        name: entry.name,
        color,
        predictedFinishMs,
        actualFinishMs: null,
        deltaMs: null,
        hasGps: false,
        noData: true,
      };
    }

    if (runner.actualFinishMs) maxFinish = Math.max(maxFinish, runner.actualFinishMs);
    maxFinish = Math.max(maxFinish, predictedFinishMs);
    runners.push(runner);
  });

  const data: ReplayData = {
    race: {
      routeLengthM: round(lut.lengthM, 1),
      durationMs: maxFinish,
      startLngLat: [round(start[0], 6), round(start[1], 6)],
      bounds: bounds.map((b) => round(b, 6)) as [number, number, number, number],
      dtMs: DT_MS,
    },
    route: {
      stepM: lut.stepM,
      count: lut.count,
      lengthM: round(lut.lengthM, 1),
      lng: lut.lng.map((v) => round(v, 6)),
      lat: lut.lat.map((v) => round(v, 6)),
    },
    runners,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(data));

  const gps = runners.filter((r) => r.hasGps).length;
  const fb = runners.filter((r) => !r.hasGps && !r.noData).length;
  const nd = runners.filter((r) => r.noData).length;
  console.log(
    `Baked ${OUT}\n  route: ${data.route.count} samples, ${(data.race.routeLengthM / 1000).toFixed(2)} km\n  runners: ${runners.length} (${gps} GPS, ${fb} finish-only, ${nd} no-data)\n  duration: ${(data.race.durationMs / 60000).toFixed(1)} min`,
  );
}

main();
