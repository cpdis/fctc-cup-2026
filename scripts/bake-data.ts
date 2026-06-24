// Build-time orchestrator: route + roster + results/tracks -> public/replay.json.
// Run with `npm run bake`. Race day: drop GPX into data/tracks/, put the
// OFFICIAL finish times in data/results.json, run bake, deploy.
//
// Source of truth: data/results.json (id -> official "mm:ss") is authoritative
// for every finish time, delta, and standing. A GPX, when present, only draws
// the on-map MOTION; its timing is stretched to land on the official finish, so
// the Cup result never depends on GPS quirks (Strava strips timestamps from
// other people's exports; watches drift; people forget to stop them).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGpxFile } from './gpx';
import { buildRoute } from './route';
import { matchTrack, matchToFinish } from './match';
import { colorFor } from '../src/palette';
import { haversineMeters } from '../src/geo';
import type { LngLat, ReplayData, Runner, RunnerActual } from '../src/types';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CANONICAL = resolve(ROOT, 'Inaugural_FCTC_.gpx');
const ROSTER = resolve(ROOT, 'data/roster.json');
const RESULTS = resolve(ROOT, 'data/results.json');
const FALLBACKS = resolve(ROOT, 'data/fallbacks.json');
const OUT = resolve(ROOT, 'public/replay.json');
const DT_MS = 1000;
// Ignore a GPX whose path is much longer than the loop: an untrimmed warmup /
// pre-run / cooldown would corrupt the snap. Fall back to the official time.
const TRACK_LEN_GUARD = 1.5;

interface RosterEntry {
  id: string;
  name: string;
  /** Predicted finish as "mm:ss". */
  predicted: string;
  /** Optional GPX path relative to repo root; defaults to data/tracks/<id>.gpx. */
  gpx?: string;
  color?: string;
  /** Did Not Start: on the roster but never ran. */
  dns?: boolean;
}

/** Total GPS path length in metres (to flag untrimmed warmup/cooldown). */
function pathLengthM(coords: LngLat[]): number {
  let d = 0;
  for (let i = 1; i < coords.length; i++) d += haversineMeters(coords[i - 1], coords[i]);
  return d;
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
  const results = readJson<Record<string, string>>(RESULTS, {});
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
    const base = { id: entry.id, name: entry.name, color, predictedFinishMs };
    // Official finish time (authoritative for the standings), if recorded.
    const officialMs = results[entry.id] != null ? parseMmSs(results[entry.id]) : null;
    const gpxPath = entry.gpx
      ? resolve(ROOT, entry.gpx)
      : resolve(ROOT, 'data/tracks', `${entry.id}.gpx`);
    const hasGpx = existsSync(gpxPath);

    const roundActual = (a: RunnerActual): RunnerActual => ({
      dtMs: a.dtMs,
      count: a.count,
      progressM: a.progressM.map((m) => round(m, 1)),
    });
    const finished = (finishMs: number, actual?: RunnerActual): Runner => ({
      ...base,
      actualFinishMs: finishMs,
      deltaMs: finishMs - predictedFinishMs,
      hasGps: actual !== undefined,
      ...(actual ? { actual } : {}),
    });
    const noData = (dns = false): Runner => ({
      ...base,
      actualFinishMs: null,
      deltaMs: null,
      hasGps: false,
      noData: true,
      ...(dns ? { dns: true } : {}),
    });

    let runner: Runner;
    if (entry.dns) {
      runner = noData(true);
    } else if (hasGpx && officialMs !== null) {
      // GPS draws the motion; the official time owns the finish/standings.
      const { coords, points } = parseGpxFile(gpxPath);
      const pathM = pathLengthM(coords);
      if (pathM > lut.lengthM * TRACK_LEN_GUARD) {
        console.warn(
          `  ! ${entry.id}: GPX path ${(pathM / 1000).toFixed(1)} km >> ${(lut.lengthM / 1000).toFixed(1)} km loop — ignoring track (needs trimming); using official time.`,
        );
        runner = finished(officialMs);
      } else {
        runner = finished(officialMs, roundActual(matchToFinish(points, lut, DT_MS, officialMs).actual));
      }
    } else if (hasGpx) {
      // GPX but no official time: lean on the track's own timing (needs stamps).
      try {
        const { points } = parseGpxFile(gpxPath);
        const matched = matchTrack(points, lut, DT_MS);
        runner = finished(matched.finishMs, roundActual(matched.actual));
      } catch (e) {
        console.warn(`  ! ${entry.id}: unusable GPX, no official time — no data. (${(e as Error).message})`);
        runner = noData();
      }
    } else if (officialMs !== null) {
      runner = finished(officialMs); // ran, no GPX (e.g. no watch): constant pace
    } else if (fallbacks[entry.id]) {
      runner = finished(parseMmSs(fallbacks[entry.id]));
    } else {
      runner = noData();
    }

    if (runner.actualFinishMs) maxFinish = Math.max(maxFinish, runner.actualFinishMs);
    maxFinish = Math.max(maxFinish, predictedFinishMs);
    runners.push(runner);
  });

  // Pre-race when no runner has any real data yet (predictions only): the
  // runtime renders a predicted-pace preview instead of an empty map. Flips to
  // false the moment any GPS or fallback finish gets baked in.
  const prerace = runners.length > 0 && runners.every((r) => r.actualFinishMs === null);

  const data: ReplayData = {
    race: {
      routeLengthM: round(lut.lengthM, 1),
      durationMs: maxFinish,
      startLngLat: [round(start[0], 6), round(start[1], 6)],
      bounds: bounds.map((b) => round(b, 6)) as [number, number, number, number],
      dtMs: DT_MS,
      prerace,
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
  const dns = runners.filter((r) => r.dns).length;
  const nd = runners.filter((r) => r.noData && !r.dns).length;
  console.log(
    `Baked ${OUT}\n  route: ${data.route.count} samples, ${(data.race.routeLengthM / 1000).toFixed(2)} km\n  runners: ${runners.length} (${gps} GPS, ${fb} finish-only, ${dns} DNS, ${nd} no-data)\n  duration: ${(data.race.durationMs / 60000).toFixed(1)} min${prerace ? '\n  mode: PRE-RACE (predicted-pace preview — no results yet)' : ''}`,
  );
}

main();
