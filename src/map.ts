// MapLibre setup: a muted basemap of the lake with the camera locked to the
// route, and the canonical loop drawn as a styled line. Everything that moves
// (markers, ghosts, trails) is added later by the render engine (U5) as sibling
// layers on top of these.
//
// Basemap source (KTD3): the production basemap is a self-hosted Protomaps
// PMTiles extract of just the lake bbox (see scripts/extract-basemap.md). Set
// VITE_USE_PMTILES=true once public/basemap.pmtiles exists. Dev defaults to
// OpenFreeMap's hosted dark style so the app runs with zero setup.

import maplibregl, {
  Map as MlMap,
  type LngLatBoundsLike,
  type StyleSpecification,
} from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import layers from 'protomaps-themes-base';
import type { RaceMeta, RouteLUT } from './types';

const PMTILES_PATH = '/basemap.pmtiles';
const OPENFREEMAP_DARK = 'https://tiles.openfreemap.org/styles/dark';
const ROUTE_SOURCE = 'route';

let pmtilesRegistered = false;
function registerPmtiles(): void {
  if (pmtilesRegistered) return;
  maplibregl.addProtocol('pmtiles', new Protocol().tile);
  pmtilesRegistered = true;
}

function pmtilesStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs:
      'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sprite: 'https://protomaps.github.io/basemaps-assets/sprites/v4/dark',
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${PMTILES_PATH}`,
        attribution:
          '<a href="https://openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://protomaps.com">Protomaps</a>',
      },
    },
    // protomaps-themes-base generates a full muted layer stack from a theme.
    layers: layers('protomaps', 'dark'),
  } as StyleSpecification;
}

/**
 * Expand a [[w,s],[e,n]] bounds outward by `frac` so the fitted route view sits
 * comfortably inside maxBounds (otherwise MapLibre constrains the fit and clips
 * the loop).
 */
function padBounds(b: [number, number, number, number], frac: number): LngLatBoundsLike {
  const [w, s, e, n] = b;
  const dx = (e - w) * frac;
  const dy = (n - s) * frac;
  return [
    [w - dx, s - dy],
    [e + dx, n + dy],
  ];
}

export interface MapHandle {
  map: MlMap;
  /** Resolves once the style has loaded and the route line is drawn. */
  whenReady: Promise<void>;
}

export function createMap(
  container: HTMLElement,
  race: RaceMeta,
  route: RouteLUT,
): MapHandle {
  const usePmtiles = import.meta.env.VITE_USE_PMTILES === 'true';
  if (usePmtiles) registerPmtiles();

  const bounds: LngLatBoundsLike = [
    [race.bounds[0], race.bounds[1]],
    [race.bounds[2], race.bounds[3]],
  ];

  const map = new maplibregl.Map({
    container,
    style: usePmtiles ? pmtilesStyle() : OPENFREEMAP_DARK,
    bounds,
    fitBoundsOptions: { padding: 48 },
    maxBounds: padBounds(race.bounds, 0.25),
    dragRotate: false,
    pitchWithRotate: false,
    rollEnabled: false,
    attributionControl: { compact: true },
  });
  // Keep the frame honest: no tilt, no rotate. Pinch-zoom within bounds is fine.
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();

  const whenReady = new Promise<void>((resolve) => {
    map.on('load', () => {
      addRouteLine(map, route);
      resolve();
    });
  });

  return { map, whenReady };
}

/** Draw the canonical loop: a faint wide casing under a brighter thin line. */
function addRouteLine(map: MlMap, route: RouteLUT): void {
  const coords: [number, number][] = [];
  for (let i = 0; i < route.count; i++) coords.push([route.lng[i], route.lat[i]]);

  map.addSource(ROUTE_SOURCE, {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: coords },
    },
  });

  map.addLayer({
    id: 'route-casing',
    type: 'line',
    source: ROUTE_SOURCE,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#05070b',
      'line-width': 10,
      'line-opacity': 0.85,
    },
  });
  map.addLayer({
    id: 'route-line',
    type: 'line',
    source: ROUTE_SOURCE,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#7d8da3',
      'line-width': 3,
      'line-opacity': 0.95,
    },
  });
}
