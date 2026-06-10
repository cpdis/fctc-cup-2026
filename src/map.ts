// MapLibre setup: a muted basemap of the lake with the camera fitted to the
// route, and the canonical loop drawn as a styled line. Everything that moves
// (markers, ghosts, trails) is added later by the render engine (U5) as sibling
// layers on top of these.
//
// Basemap source (KTD3): the production basemap is a self-hosted Protomaps
// PMTiles extract of the lake area (see scripts/extract-basemap.md). Set
// VITE_USE_PMTILES=true once public/basemap.pmtiles exists. Without it, dev and
// prod fall back to OpenFreeMap's hosted styles so the app runs with zero setup.
//
// Theming: every basemap flavour comes in a light and a dark variant; a theme
// change is a map.setStyle(), which wipes our added sources/layers — so the
// route line (here) and the runner layers (engine) both re-add themselves via
// idempotent styledata listeners.

import maplibregl, {
  Map as MlMap,
  type LngLatBoundsLike,
  type StyleSpecification,
} from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { layers as protomapsLayers, namedFlavor } from '@protomaps/basemaps';
import { getTheme, onThemeChange, type Theme } from './theme';
import type { RaceMeta, RouteLUT } from './types';

const PMTILES_PATH = '/basemap.pmtiles';
const ROUTE_SOURCE = 'route';

// Per-theme map colours: hosted style URL, flat fallback, and the route line.
// The casing sits under the line and matches the page background so the loop
// reads as cut into the map on both themes.
const MAP_THEME: Record<
  Theme,
  { openfreemap: string; flat: string; casing: string; line: string }
> = {
  dark: {
    openfreemap: 'https://tiles.openfreemap.org/styles/dark',
    flat: '#0a0e14',
    casing: '#05070b',
    line: '#7d8da3',
  },
  light: {
    openfreemap: 'https://tiles.openfreemap.org/styles/positron',
    flat: '#f5f3ee',
    casing: '#ffffff',
    line: '#5b6b80',
  },
};

let pmtilesRegistered = false;
function registerPmtiles(): void {
  if (pmtilesRegistered) return;
  maplibregl.addProtocol('pmtiles', new Protocol().tile);
  pmtilesRegistered = true;
}

function pmtilesStyle(theme: Theme): StyleSpecification {
  return {
    version: 8,
    glyphs:
      'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sprite: `https://protomaps.github.io/basemaps-assets/sprites/v4/${theme}`,
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${PMTILES_PATH}`,
        attribution:
          '<a href="https://openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://protomaps.com">Protomaps</a>',
      },
    },
    // @protomaps/basemaps generates a full muted layer stack from a flavour.
    layers: protomapsLayers('protomaps', namedFlavor(theme), { lang: 'en' }),
  } as StyleSpecification;
}

// A self-contained fallback style (no tiles/sprite/glyphs) — used when
// VITE_FLAT_BASEMAP=true, e.g. for offline dev or deterministic screenshots.
function flatStyle(theme: Theme): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': MAP_THEME[theme].flat } },
    ],
  };
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
  /** Chrome-clearing padding used for the initial fit (and the auto camera). */
  fitPadding: { top: number; right: number; bottom: number; left: number };
}

export function createMap(
  container: HTMLElement,
  race: RaceMeta,
  route: RouteLUT,
): MapHandle {
  const usePmtiles = import.meta.env.VITE_USE_PMTILES === 'true';
  const useFlat = import.meta.env.VITE_FLAT_BASEMAP === 'true';
  if (usePmtiles) registerPmtiles();

  const styleFor = (theme: Theme): string | StyleSpecification =>
    useFlat ? flatStyle(theme) : usePmtiles ? pmtilesStyle(theme) : MAP_THEME[theme].openfreemap;

  const bounds: LngLatBoundsLike = [
    [race.bounds[0], race.bounds[1]],
    [race.bounds[2], race.bounds[3]],
  ];

  // The initial fit must clear the UI chrome, not just the viewport edges:
  // desktop has a 296px side panel on the right and the gap chart + transport
  // along the bottom; mobile has the peeked bottom sheet. Without this the
  // start line (top of the loop) lands under or above the visible area.
  const desktop = matchMedia('(min-width: 901px)').matches;
  const fitPadding = desktop
    ? { top: 72, right: 344, bottom: 240, left: 40 }
    : { top: 72, right: 24, bottom: 232, left: 24 };

  const map = new maplibregl.Map({
    container,
    style: styleFor(getTheme()),
    bounds,
    fitBoundsOptions: { padding: fitPadding },
    // Generous roaming box: pan/zoom freely around the lake without being able
    // to lose the route entirely. (A tight box zooms wide viewports IN past the
    // fitted view to satisfy the width constraint, which clips the loop and
    // kills zoom-out/pan — the route must stay a fraction of the box.)
    maxBounds: padBounds(race.bounds, 1.25),
    dragRotate: false,
    pitchWithRotate: false,
    rollEnabled: false,
    fadeDuration: 0, // no tile-label crossfade work while the camera glides
    attributionControl: { compact: true },
  });
  // Keep the frame honest: no tilt, no rotate. Pinch-zoom within bounds is fine.
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();

  // Draw the route as soon as the style can take layers, and re-add it whenever
  // a style swap (theme toggle) wipes it. Colours come from the current theme.
  const ensureRouteLine = (): void => {
    if (map.getSource(ROUTE_SOURCE)) return;
    try {
      addRouteLine(map, route, getTheme());
    } catch {
      /* style not parsed yet; the styledata listener retries */
    }
  };
  map.on('styledata', ensureRouteLine);

  onThemeChange((t) => map.setStyle(styleFor(t)));

  // Resolve as soon as the style spec is parsed enough to add layers. Fall back
  // to a timeout so a slow or partial basemap (flaky CDN, sprite/glyph stall)
  // never hangs the whole replay — the markers and chrome still come up.
  const whenReady = new Promise<void>((resolve) => {
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      map.off('styledata', onStyle);
      ensureRouteLine();
      resolve();
    };
    const onStyle = (): void => {
      if (map.isStyleLoaded()) finish();
    };
    if (map.isStyleLoaded()) finish();
    else {
      map.on('styledata', onStyle);
      map.once('load', finish);
      setTimeout(finish, 6000); // hard fallback
    }
  });

  return { map, whenReady, fitPadding };
}

/** Draw the canonical loop: a faint wide casing under a brighter thin line. */
function addRouteLine(map: MlMap, route: RouteLUT, theme: Theme): void {
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

  // After a theme swap the engine's layers may already be back; slot the route
  // underneath them so runners always draw on top.
  const beforeId = map.getLayer('runners-glow') ? 'runners-glow' : undefined;

  map.addLayer(
    {
      id: 'route-casing',
      type: 'line',
      source: ROUTE_SOURCE,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': MAP_THEME[theme].casing,
        'line-width': 10,
        'line-opacity': 0.85,
      },
    },
    beforeId,
  );
  map.addLayer(
    {
      id: 'route-line',
      type: 'line',
      source: ROUTE_SOURCE,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': MAP_THEME[theme].line,
        'line-width': 3,
        'line-opacity': 0.95,
      },
    },
    beforeId,
  );
}
