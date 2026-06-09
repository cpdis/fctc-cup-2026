// The render engine. Once per frame it turns the clock's scalar time into
// on-map motion: a ghost (constant predicted pace) and a solid icon (real GPS
// or constant-pace fallback) per runner, plus a short trail behind each icon.
// All markers live in one GeoJSON source per layer and update with a single
// setData per frame (KTD6). Circle layers are used deliberately — they have no
// symbol fade-on-move, so motion stays flicker-free with no extra config.

import type { Map as MlMap, GeoJSONSource } from 'maplibre-gl';
import type { Feature, FeatureCollection, Point, LineString } from 'geojson';
import { progressToCoord } from './geo';
import type { ReplayData, Runner, LngLat } from './types';

const ICON_R = 7;
const GHOST_R = 5;
const TRAIL_M = 220; // length of the icon's trail, in metres along the route
const TRAIL_STRIDE_M = 8; // sample the trail every ~8 m
const DIM = 0.3;
const ENTRANCE_MS = 320;
const ENTRANCE_STAGGER_MS = 55;

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

export interface EngineHandle {
  render(raceMs: number): void;
  setSelected(id: string | null): void;
  /** Current icon position for a runner, for the on-map label (U6). */
  positionOf(id: string): LngLat | undefined;
}

interface RunnerView {
  runner: Runner;
  icon: Feature<Point>;
  ghost: Feature<Point> | null;
  trail: Feature<LineString>;
}

export function createEngine(map: MlMap, data: ReplayData, winnerId?: string | null): EngineHandle {
  const { route } = data;
  const L = route.lengthM;
  const active = data.runners.filter((r) => !r.noData);
  const winner = active.find((r) => r.id === winnerId) ?? null;

  const views: RunnerView[] = active.map((runner) => ({
    runner,
    icon: pointFeature(runner.id, runner.color, ICON_R),
    ghost: pointFeature(runner.id, runner.color, GHOST_R),
    trail: {
      type: 'Feature',
      properties: { color: runner.color, opacity: 0.5 },
      geometry: { type: 'LineString', coordinates: [] },
    },
  }));

  const iconFC = collection(views.map((v) => v.icon));
  const ghostFC = collection(views.map((v) => v.ghost as Feature<Point>));
  const trailFC = collection(views.map((v) => v.trail));

  // A single soft halo that appears on the winner's marker once they finish.
  const glow: Feature<Point> = {
    type: 'Feature',
    properties: { color: winner?.color ?? '#fff', r: 0, opacity: 0 },
    geometry: { type: 'Point', coordinates: [0, 0] },
  };
  const glowFC = collection([glow]);

  // Add layers as soon as the style is parsed. render() safely no-ops (optional
  // chaining on getSource) until the sources exist, so a slow style just delays
  // the markers rather than throwing.
  if (map.isStyleLoaded()) {
    addSourcesAndLayers(map);
  } else {
    const onStyle = (): void => {
      if (!map.isStyleLoaded()) return;
      map.off('styledata', onStyle);
      if (!map.getSource('runners-icon')) addSourcesAndLayers(map);
    };
    map.on('styledata', onStyle);
  }

  const positions = new Map<string, LngLat>();
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

      // Entrance: staggered scale/opacity in, once, at the start line.
      const e = easeOut(
        Math.min(1, Math.max(0, (entranceT - k * ENTRANCE_STAGGER_MS) / ENTRANCE_MS)),
      );
      const dim = selected && r.id !== selected ? DIM : 1;
      const sel = selected === r.id;

      // Icon
      const ip = iconProgressAt(r, raceMs, L);
      const ic = progressToCoord(route, ip);
      (v.icon.geometry as Point).coordinates = ic;
      positions.set(r.id, ic);
      v.icon.properties!.opacity = dim * e;
      v.icon.properties!.r = (sel ? ICON_R + 1.5 : ICON_R) * (0.85 + 0.15 * e);

      // Ghost (constant predicted pace)
      const gp = ghostProgressAt(r, raceMs, L);
      (v.ghost!.geometry as Point).coordinates = progressToCoord(route, gp);
      v.ghost!.properties!.opacity = 0.32 * dim * e;
      v.ghost!.properties!.r = GHOST_R * (0.85 + 0.15 * e);

      // Trail behind the icon
      v.trail.geometry.coordinates = trailCoords(ip);
      v.trail.properties!.opacity = 0.55 * dim * e;
    }

    // Winner halo: a gentle pulse on the winner's marker once they've finished.
    if (winner && winner.actualFinishMs !== null && raceMs >= winner.actualFinishMs) {
      const pos = positions.get(winner.id);
      if (pos) {
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 380);
        (glow.geometry as Point).coordinates = pos;
        glow.properties!.r = 16 + 5 * pulse;
        glow.properties!.opacity = 0.18 + 0.12 * pulse;
      }
    } else {
      glow.properties!.opacity = 0;
    }

    (map.getSource('runners-glow') as GeoJSONSource | undefined)?.setData(glowFC);
    (map.getSource('runners-trail') as GeoJSONSource | undefined)?.setData(trailFC);
    (map.getSource('runners-ghost') as GeoJSONSource | undefined)?.setData(ghostFC);
    (map.getSource('runners-icon') as GeoJSONSource | undefined)?.setData(iconFC);
  }

  return {
    render,
    setSelected: (id) => (selected = id),
    positionOf: (id) => positions.get(id),
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
  map.addSource('runners-glow', { type: 'geojson', data: empty });
  map.addSource('runners-trail', { type: 'geojson', data: empty });
  map.addSource('runners-ghost', { type: 'geojson', data: empty });
  map.addSource('runners-icon', { type: 'geojson', data: empty });

  // Winner halo sits beneath everything else.
  map.addLayer({
    id: 'runners-glow',
    type: 'circle',
    source: 'runners-glow',
    paint: {
      'circle-color': ['get', 'color'],
      'circle-radius': ['get', 'r'],
      'circle-opacity': ['get', 'opacity'],
      'circle-blur': 1,
    },
  });

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
    source: 'runners-ghost',
    paint: {
      'circle-color': ['get', 'color'],
      'circle-radius': ['get', 'r'],
      'circle-opacity': ['get', 'opacity'],
      'circle-stroke-color': ['get', 'color'],
      'circle-stroke-width': 1,
      'circle-stroke-opacity': ['get', 'opacity'],
    },
  });

  // Solid icon: the real run, with a dark casing so it reads on any background.
  map.addLayer({
    id: 'runners-icon',
    type: 'circle',
    source: 'runners-icon',
    paint: {
      'circle-color': ['get', 'color'],
      'circle-radius': ['get', 'r'],
      'circle-opacity': ['get', 'opacity'],
      'circle-stroke-color': '#0a0e14',
      'circle-stroke-width': 2,
      'circle-stroke-opacity': ['get', 'opacity'],
    },
  });
}
