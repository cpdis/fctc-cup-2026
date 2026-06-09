// Build-time GPX parsing. togeojson needs a DOM, so we inject @xmldom/xmldom's
// DOMParser (Node has none, and xmldom tolerates the technically-invalid XML
// that real-world GPX exports often contain). Returns flat coordinate + timed
// point arrays; downstream code (route LUT, map-matching) takes it from there.

import { readFileSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { gpx } from '@tmcw/togeojson';
import type { LngLat } from '../src/types';

export interface TrackPoint {
  lng: number;
  lat: number;
  /** Absolute time in ms (NaN if the GPX has no timestamps). */
  tMs: number;
}

interface Geom {
  type: string;
  coordinates: number[][] | number[][][];
}

/** Flatten LineString / MultiLineString coordinates into one [lng,lat][] list. */
function flattenCoords(geom: Geom): number[][] {
  if (geom.type === 'LineString') return geom.coordinates as number[][];
  if (geom.type === 'MultiLineString') {
    return (geom.coordinates as number[][][]).flat();
  }
  return [];
}

/** Flatten coordTimes (string[] or string[][]) parallel to flattened coords. */
function flattenTimes(coordTimes: unknown): string[] {
  if (!Array.isArray(coordTimes)) return [];
  if (coordTimes.length > 0 && Array.isArray(coordTimes[0])) {
    return (coordTimes as string[][]).flat();
  }
  return coordTimes as string[];
}

export interface ParsedTrack {
  name: string;
  coords: LngLat[];
  points: TrackPoint[];
}

/** Parse the first track in a GPX file into coordinates and timed points. */
export function parseGpxFile(path: string): ParsedTrack {
  const xml = readFileSync(path, 'utf8');
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const fc = gpx(doc as unknown as Document);

  const feature = fc.features.find((f) => {
    const t = f.geometry?.type;
    return t === 'LineString' || t === 'MultiLineString';
  });
  if (!feature) {
    throw new Error(`No track (LineString) found in GPX: ${path}`);
  }

  const geom = feature.geometry as unknown as Geom;
  const rawCoords = flattenCoords(geom);
  const times = flattenTimes((feature.properties as Record<string, unknown>)?.coordTimes);

  const coords: LngLat[] = rawCoords.map((c) => [c[0], c[1]]);
  const points: TrackPoint[] = rawCoords.map((c, i) => ({
    lng: c[0],
    lat: c[1],
    tMs: times[i] ? Date.parse(times[i]) : NaN,
  }));

  const name =
    (feature.properties as Record<string, unknown>)?.name?.toString() ?? 'track';
  return { name, coords, points };
}
