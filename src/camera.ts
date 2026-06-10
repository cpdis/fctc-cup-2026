// Auto camera: keeps the live pack framed. Each hot frame it fits a padded
// bounding box around every runner, then eases the real camera toward that
// target with exponential smoothing — tight on the start-line huddle, panning
// with the leaders, widening as the field strings out. Any user gesture hands
// control back (the toggle re-arms it).
//
// Smoothing uses per-frame jumpTo (not easeTo) so a moving target never fights
// a queued animation; `settling()` lets the main loop keep frames hot until
// the camera has actually arrived.

import type { Map as MlMap, PaddingOptions } from 'maplibre-gl';
import type { LngLat } from './types';

const TAU_MS = 650; // smoothing time constant (~95% there in 2s)
const ZOOM_CAP = 17; // hard ceiling (the basemap is z15 tiles; ~2 overzooms is fine)
const BBOX_PAD_FRAC = 0.3; // breathing room around the pack's bbox
// Never frame tighter than ~800 m of ground: a start-line huddle is a point,
// and zoom alone is a bad clamp (the same zoom shows wildly different ground
// spans across viewport sizes). Degrees at Perth's latitude (cos ≈ 0.85).
const MIN_SPAN_LNG = 0.0085;
const MIN_SPAN_LAT = 0.0072;
const SETTLED_ZOOM = 0.002;
const SETTLED_DEG = 0.000005;

export interface AutoCamera {
  /** Ease toward the pack. Call once per hot frame with icon positions. */
  onFrame(positions: LngLat[]): void;
  /** True while the camera is still gliding toward its target. */
  settling(): boolean;
  enabled(): boolean;
  setEnabled(on: boolean): void;
  /** Fires on every enabled/disabled flip (gesture or toggle). */
  onChange(fn: (on: boolean) => void): void;
}

export function createAutoCamera(
  map: MlMap,
  opts: { padding: PaddingOptions },
): AutoCamera {
  let on = true;
  let moving = false;
  let lastFrame = 0;
  const listeners = new Set<(b: boolean) => void>();

  const flip = (next: boolean): void => {
    if (on === next) return;
    on = next;
    for (const fn of listeners) fn(on);
  };

  // Any user-driven camera change disarms the auto camera. jumpTo-driven moves
  // carry no originalEvent, so they never trip these.
  map.on('movestart', (e) => {
    if ((e as { originalEvent?: Event }).originalEvent) flip(false);
  });
  map.on('wheel', () => flip(false));
  map.on('dragstart', () => flip(false));

  function onFrame(positions: LngLat[]): void {
    if (!on || positions.length === 0) {
      moving = false;
      return;
    }

    let w = Infinity;
    let s = Infinity;
    let e = -Infinity;
    let n = -Infinity;
    for (const p of positions) {
      if (p[0] < w) w = p[0];
      if (p[0] > e) e = p[0];
      if (p[1] < s) s = p[1];
      if (p[1] > n) n = p[1];
    }
    // Pad, and never frame tighter than the minimum ground span.
    const padX = Math.max(((e - w) * BBOX_PAD_FRAC) / 2, (MIN_SPAN_LNG - (e - w)) / 2, 0);
    const padY = Math.max(((n - s) * BBOX_PAD_FRAC) / 2, (MIN_SPAN_LAT - (n - s)) / 2, 0);

    const target = map.cameraForBounds(
      [
        [w - padX, s - padY],
        [e + padX, n + padY],
      ],
      { padding: opts.padding, maxZoom: ZOOM_CAP },
    );
    if (!target || target.zoom === undefined || !target.center) {
      moving = false;
      return;
    }

    const now = performance.now();
    const dt = lastFrame ? Math.min(100, now - lastFrame) : 16.7;
    lastFrame = now;
    const k = 1 - Math.exp(-dt / TAU_MS);

    const cur = map.getCenter();
    const curZoom = map.getZoom();
    const tc = target.center as { lng: number; lat: number };
    const dLng = tc.lng - cur.lng;
    const dLat = tc.lat - cur.lat;
    const dZoom = (target.zoom as number) - curZoom;

    moving =
      Math.abs(dZoom) > SETTLED_ZOOM ||
      Math.abs(dLng) > SETTLED_DEG ||
      Math.abs(dLat) > SETTLED_DEG;
    if (!moving) return;

    map.jumpTo({
      center: [cur.lng + dLng * k, cur.lat + dLat * k],
      zoom: curZoom + dZoom * k,
    });
  }

  return {
    onFrame,
    settling: () => on && moving,
    enabled: () => on,
    setEnabled: (next) => {
      lastFrame = 0;
      flip(next);
    },
    onChange: (fn) => listeners.add(fn),
  };
}
