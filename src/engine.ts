// The render engine. Once per frame it turns the clock's scalar time into
// on-map motion: a ghost dot (constant predicted pace) and a short trail per
// runner, plus the authoritative icon POSITION for each runner — the visible
// runner figure itself is a DOM marker owned by src/figures.ts, fed from
// positionOf()/positionsSnapshot().
//
// Perf contract (the whole app must idle when nothing moves):
//  - Ghosts and trails live in one GeoJSON source each, so a frame costs two
//    setData calls total. Circle layers are used deliberately: no symbol
//    fade-on-move, so motion stays flicker-free with no extra config.
//  - The winner halo and the figures are DOM markers animated by CSS, NOT
//    per-frame paint updates — the finished/paused app does zero JS per frame.
//
// Finish corral: finished runners park in a tidy row angled off the finish
// line (ordered by finish time) instead of stacking on one point, so every
// finisher stays visible and selectable.
//
// Type-only maplibre imports, deliberately: the engine stays loadable in
// jsdom tests (maplibre's bundle touches window APIs at import time). DOM
// markers (halo, labels, pops) belong to main.ts.

import type { Map as MlMap, GeoJSONSource } from 'maplibre-gl';
import type { Feature, FeatureCollection, Point, LineString } from 'geojson';
import { progressToCoord } from './geo';
import type { ReplayData, Runner, RouteLUT, LngLat } from './types';

const GHOST_R = 5;
const TRAIL_M = 220; // length of the icon's trail, in metres along the route
const TRAIL_STRIDE_M = 8; // sample the trail every ~8 m
const DIM = 0.3;
const ENTRANCE_MS = 320;
const ENTRANCE_STAGGER_MS = 55;
// Corral layout: a small crowd in rows beside the finish line. Figures are
// ~22 px wide, so the gaps must survive the zoomed-out end-of-race framing.
const CORRAL_PER_ROW = 6;
const CORRAL_GAP_M = 13; // sideways spacing between parked finishers
const CORRAL_BACK_M = 9; // first slot's sideways clearance from the finish point
const CORRAL_ALONG_M = 6; // first row's clearance past the line
const CORRAL_ROW_M = 12; // spacing between rows

const easeOut = (p: number): number => 1 - (1 - p) ** 3;

/** Ghost progress (metres): constant predicted pace, clamped to the loop. */
export function ghostProgressAt(r: Runner, t: number, L: number): number {
  return L * Math.min(1, Math.max(0, t / r.predictedFinishMs));
}

/**
 * Icon progress (metres) at race time t. GPS runners lerp their baked samples;
 * everyone else (finish-time-only fallback) runs constant pace to their real
 * finish — the same code path as the ghost, just to a different time.
 */
export function iconProgressAt(r: Runner, t: number, L: number): number {
  if (r.hasGps && r.actual) {
    const a = r.actual;
    if (t >= (r.actualFinishMs as number)) return L;
    const f = t / a.dtMs;
    const i = Math.min(a.count - 2, Math.max(0, Math.floor(f)));
    const frac = f - i;
    return a.progressM[i] + (a.progressM[i + 1] - a.progressM[i]) * frac;
  }
  const finish = r.actualFinishMs ?? L;
  return L * Math.min(1, Math.max(0, t / finish));
}

/**
 * Static corral slots: one parking spot per finisher, in finish order, laid
 * out as a small crowd in rows beside the finish line — sideways off the
 * route's final heading, each row a bit further past the line. Pure +
 * precomputable (finish times are baked).
 */
export function corralSlots(route: RouteLUT, runners: Runner[]): Map<string, LngLat> {
  const finishers = runners
    .filter((r) => r.actualFinishMs !== null)
    .sort((a, b) => (a.actualFinishMs as number) - (b.actualFinishMs as number));

  const end = progressToCoord(route, route.lengthM);
  const before = progressToCoord(route, route.lengthM - 15);
  // Unit heading + perpendicular at the finish, in metre-space.
  let dx = end[0] - before[0];
  let dy = end[1] - before[1];
  const cosLat = Math.cos((end[1] * Math.PI) / 180);
  dx *= cosLat; // to metre-proportional space
  const len = Math.hypot(dx, dy) || 1;
  const hx = dx / len;
  const hy = dy / len;
  const px = -hy;
  const py = hx;

  const mToLng = 1 / (111_320 * cosLat);
  const mToLat = 1 / 111_320;

  const slots = new Map<string, LngLat>();
  finishers.forEach((r, i) => {
    const side = CORRAL_BACK_M + (i % CORRAL_PER_ROW) * CORRAL_GAP_M;
    const along = CORRAL_ALONG_M + Math.floor(i / CORRAL_PER_ROW) * CORRAL_ROW_M;
    slots.set(r.id, [
      end[0] + (px * side + hx * along) * mToLng,
      end[1] + (py * side + hy * along) * mToLat,
    ]);
  });
  return slots;
}

export interface EngineHandle {
  render(raceMs: number): void;
  setSelected(id: string | null): void;
  /** Current icon position for a runner, for the on-map label (U6). */
  positionOf(id: string): LngLat | undefined;
  /** Current progress along the route (metres) — used to prioritise labels. */
  progressOf(id: string): number;
  /** Snapshot of every active runner's icon position (reused array). */
  positionsSnapshot(): LngLat[];
}

interface RunnerView {
  runner: Runner;
  ghost: Feature<Point>;
  trail: Feature<LineString>;
}

export function createEngine(map: MlMap, data: ReplayData): EngineHandle {
  const { route } = data;
  const L = route.lengthM;
  // Pre-race: nobody has real data, so we animate the whole field at their
  // predicted pace (the prediction *is* the run). Every runner is noData, so
  // we keep them all instead of filtering them out, and treat the predicted
  // finish as the finish — for the corral, the trail, and the parked pose.
  const prerace = data.race.prerace ?? false;
  const active = prerace ? data.runners : data.runners.filter((r) => !r.noData);
  // Corral order: by real finish in a race, by predicted finish pre-race.
  const corral = corralSlots(
    route,
    prerace ? active.map((r) => ({ ...r, actualFinishMs: r.predictedFinishMs })) : active,
  );

  const views: RunnerView[] = active.map((runner) => ({
    runner,
    ghost: pointFeature(`g:${runner.id}`, runner.color, GHOST_R),
    trail: {
      type: 'Feature',
      properties: { color: runner.color, opacity: 0.5 },
      geometry: { type: 'LineString', coordinates: [] },
    },
  }));

  const ghostFC = collection(views.map((v) => v.ghost));
  const trailFC = collection(views.map((v) => v.trail));

  // Add layers as soon as the style is parsed. Don't gate on isStyleLoaded():
  // it stays false while sprites/tiles trickle in, and styledata never re-fires
  // after the last style mutation — so waiting for it can mean waiting forever.
  // Instead just try (createEngine runs after the style parses), and keep an
  // idempotent retry on styledata, which also restores the layers after a
  // setStyle (basemap/theme switch) wipes them. render() safely no-ops
  // (optional chaining on getSource) until the sources exist.
  const ensureLayers = (): void => {
    if (map.getSource('runners-ghosts')) return;
    try {
      addSourcesAndLayers(map);
    } catch {
      /* style not parsed yet; the styledata listener retries */
    }
  };
  ensureLayers();
  map.on('styledata', ensureLayers);

  const positions = new Map<string, LngLat>();
  const progressM = new Map<string, number>();
  const snapshot: LngLat[] = [];
  let selected: string | null = null;
  let entranceStart = NaN;

  function trailCoords(progress: number): number[][] {
    const endIdx = Math.min(route.count - 1, Math.round(progress / route.stepM));
    const startIdx = Math.max(0, Math.round((progress - TRAIL_M) / route.stepM));
    const stride = Math.max(1, Math.round(TRAIL_STRIDE_M / route.stepM));
    const out: number[][] = [];
    for (let i = startIdx; i < endIdx; i += stride) out.push([route.lng[i], route.lat[i]]);
    out.push([route.lng[endIdx], route.lat[endIdx]]);
    return out;
  }

  function render(raceMs: number): void {
    if (Number.isNaN(entranceStart)) entranceStart = performance.now();
    const entranceT = performance.now() - entranceStart;

    for (let k = 0; k < views.length; k++) {
      const v = views[k];
      const r = v.runner;
      // The "finish" is the real finish in a race, the predicted finish pre-race.
      const finishMs = prerace ? r.predictedFinishMs : r.actualFinishMs;
      const finished = finishMs !== null && raceMs >= finishMs;
      const ghostDone = raceMs >= r.predictedFinishMs;

      // Entrance: staggered scale/opacity in, once, at the start line.
      const e = easeOut(
        Math.min(1, Math.max(0, (entranceT - k * ENTRANCE_STAGGER_MS) / ENTRANCE_MS)),
      );
      const dim = selected && r.id !== selected ? DIM : 1;

      // Progress along the route: actual GPS/finish in a race, predicted pace
      // pre-race (where the prediction is all we have to drive the figure).
      const prog = prerace
        ? ghostProgressAt(r, raceMs, L)
        : iconProgressAt(r, raceMs, L);

      // Icon position: on course while running, parked in the corral once
      // finished. The figure marker (src/figures.ts) reads this via positionOf.
      const ic = finished ? (corral.get(r.id) as LngLat) : progressToCoord(route, prog);
      positions.set(r.id, ic);
      progressM.set(r.id, prog);

      // Ghost (constant predicted pace): a faint echo behind the real run. It's
      // redundant pre-race (it would sit exactly under the figure), so hide it
      // then; otherwise it fades out at the line so phantoms don't pile up.
      if (prerace) {
        v.ghost.properties!.opacity = 0;
      } else {
        const gp = ghostProgressAt(r, raceMs, L);
        (v.ghost.geometry as Point).coordinates = progressToCoord(route, gp);
        v.ghost.properties!.opacity = ghostDone ? 0 : 0.32 * dim * e;
        v.ghost.properties!.r = GHOST_R * (0.85 + 0.15 * e);
      }

      // Trail behind the icon; gone once parked.
      if (finished) {
        v.trail.geometry.coordinates = [];
      } else {
        v.trail.geometry.coordinates = trailCoords(prog);
        v.trail.properties!.opacity = 0.55 * dim * e;
      }
    }

    (map.getSource('runners-trail') as GeoJSONSource | undefined)?.setData(trailFC);
    (map.getSource('runners-ghosts') as GeoJSONSource | undefined)?.setData(ghostFC);
  }

  return {
    render,
    setSelected: (id) => (selected = id),
    positionOf: (id) => positions.get(id),
    progressOf: (id) => progressM.get(id) ?? 0,
    positionsSnapshot: () => {
      snapshot.length = 0;
      for (const p of positions.values()) snapshot.push(p);
      return snapshot;
    },
  };
}

function pointFeature(id: string, color: string, r: number): Feature<Point> {
  return {
    type: 'Feature',
    id,
    properties: { id, color, r, opacity: 0 },
    geometry: { type: 'Point', coordinates: [0, 0] },
  };
}

function collection<T extends Feature>(features: T[]): FeatureCollection {
  return { type: 'FeatureCollection', features: features as Feature[] };
}

function addSourcesAndLayers(map: MlMap): void {
  const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
  map.addSource('runners-trail', { type: 'geojson', data: empty });
  map.addSource('runners-ghosts', { type: 'geojson', data: empty });

  map.addLayer({
    id: 'runners-trail',
    type: 'line',
    source: 'runners-trail',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-opacity': ['get', 'opacity'],
      'line-width': 3,
    },
  });

  // Ghost: a faint echo of the runner's colour at their predicted pace.
  map.addLayer({
    id: 'runners-ghost',
    type: 'circle',
    source: 'runners-ghosts',
    paint: {
      'circle-color': ['get', 'color'],
      'circle-radius': ['get', 'r'],
      'circle-opacity': ['get', 'opacity'],
      'circle-stroke-color': ['get', 'color'],
      'circle-stroke-width': 1,
      'circle-stroke-opacity': ['get', 'opacity'],
    },
  });
}
