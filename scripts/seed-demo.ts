// Generate a realistic demo dataset so `npm run dev` shows a full field out of
// the box, and so the map-matcher gets exercised on multiple noisy tracks.
// Run with `npm run seed-demo`. On race day this is replaced by real GPX in
// data/tracks/ + real predicted times in data/roster.json.
//
// GPS runners get a synthetic track warped from the canonical route (varied
// pace through the run + GPS noise). Finish-only runners go straight to
// fallbacks.json. Output is deterministic (seeded PRNG) so commits are stable.

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGpxFile } from './gpx';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CANONICAL = resolve(ROOT, 'Inaugural_FCTC_.gpx');
const TRACKS = resolve(ROOT, 'data/tracks');

/** mulberry32 — tiny seeded PRNG for reproducible noise. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Demo {
  id: string;
  name: string;
  gps: boolean;
  /** Target actual finish, seconds. */
  finishS: number;
  /** Predicted = finish + this (seconds). Small = good predictor. */
  predOffsetS: number;
  /** Number of pace waves through the run, for gap-chart drama. */
  waves: number;
}

// A spread of finishes (30–44 min, under the ~45 cap) and prediction offsets so
// the Cup has a clear-ish winner (Gia, +4 s) and some wild misses.
const DEMO: Demo[] = [
  { id: 'ada', name: 'Ada', gps: true, finishS: 30 * 60 + 12, predOffsetS: -38, waves: 3 },
  { id: 'bram', name: 'Bram', gps: true, finishS: 32 * 60 + 5, predOffsetS: 71, waves: 2 },
  { id: 'cleo', name: 'Cleo', gps: true, finishS: 34 * 60 + 48, predOffsetS: -22, waves: 4 },
  { id: 'dane', name: 'Dane', gps: true, finishS: 36 * 60 + 30, predOffsetS: 55, waves: 2 },
  { id: 'esi', name: 'Esi', gps: true, finishS: 38 * 60 + 9, predOffsetS: -90, waves: 3 },
  { id: 'finn', name: 'Finn', gps: true, finishS: 41 * 60 + 20, predOffsetS: 130, waves: 5 },
  { id: 'gia', name: 'Gia', gps: false, finishS: 33 * 60 + 40, predOffsetS: 4, waves: 0 },
  { id: 'hugo', name: 'Hugo', gps: false, finishS: 35 * 60 + 2, predOffsetS: -47, waves: 0 },
  { id: 'ivy', name: 'Ivy', gps: false, finishS: 37 * 60 + 55, predOffsetS: 88, waves: 0 },
  { id: 'jonas', name: 'Jonas', gps: false, finishS: 40 * 60 + 11, predOffsetS: -15, waves: 0 },
  { id: 'kit', name: 'Kit', gps: false, finishS: 44 * 60 + 0, predOffsetS: 33, waves: 0 },
];

const NOISE_M = 4; // GPS jitter amplitude
const M_PER_DEG = 111320;

function fmtMmSs(totalS: number): string {
  const s = Math.max(0, Math.round(totalS));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function buildGpx(name: string, pts: { lat: number; lng: number; tMs: number }[]): string {
  const body = pts
    .map(
      (p) =>
        `   <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lng.toFixed(7)}"><time>${new Date(p.tMs).toISOString()}</time></trkpt>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="fctc-seed" xmlns="http://www.topografix.com/GPX/1/1">\n <trk><name>${name}</name><trkseg>\n${body}\n </trkseg></trk>\n</gpx>\n`;
}

function main(): void {
  mkdirSync(TRACKS, { recursive: true });
  const { points } = parseGpxFile(CANONICAL);
  const startEpoch = points[0].tMs; // mass start anchor
  const canonElapsed = points.map((p) => p.tMs - startEpoch);
  const canonDurS = canonElapsed[canonElapsed.length - 1] / 1000;

  const roster: { id: string; name: string; predicted: string }[] = [];
  const fallbacks: Record<string, string> = {};

  for (const d of DEMO) {
    const paceFactor = d.finishS / canonDurS;
    let actualFinishS = d.finishS;

    if (d.gps) {
      const rand = rng(hash(d.id));
      const phase = rand() * Math.PI * 2;
      const ampl = 0.12;
      const cosLat = Math.cos((points[0].lat * Math.PI) / 180);

      // Warp pace through the run; re-stamp times; add GPS noise.
      const out: { lat: number; lng: number; tMs: number }[] = [];
      let acc = 0;
      for (let i = 0; i < points.length; i++) {
        const dtCanon = i === 0 ? 0 : canonElapsed[i] - canonElapsed[i - 1];
        const frac = i / (points.length - 1);
        const local = paceFactor * (1 + ampl * Math.sin(frac * Math.PI * d.waves + phase));
        acc += dtCanon * local;
        const noiseLat = ((rand() - 0.5) * 2 * NOISE_M) / M_PER_DEG;
        const noiseLng = ((rand() - 0.5) * 2 * NOISE_M) / (M_PER_DEG * cosLat);
        out.push({
          lat: points[i].lat + noiseLat,
          lng: points[i].lng + noiseLng,
          tMs: startEpoch + acc,
        });
      }
      actualFinishS = acc / 1000;
      writeFileSync(resolve(TRACKS, `${d.id}.gpx`), buildGpx(d.name, out));
    } else {
      fallbacks[d.id] = fmtMmSs(actualFinishS);
    }

    const predictedS = Math.max(60, actualFinishS + d.predOffsetS);
    roster.push({ id: d.id, name: d.name, predicted: fmtMmSs(predictedS) });
  }

  writeFileSync(resolve(ROOT, 'data/roster.json'), JSON.stringify(roster, null, 2) + '\n');
  writeFileSync(
    resolve(ROOT, 'data/fallbacks.json'),
    JSON.stringify(fallbacks, null, 2) + '\n',
  );
  console.log(
    `Seeded ${DEMO.length} demo runners (${DEMO.filter((d) => d.gps).length} GPS, ${DEMO.filter((d) => !d.gps).length} finish-only).`,
  );
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

main();
