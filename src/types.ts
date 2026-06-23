// Shared data shapes for the baked replay file and runtime state.
// The whole app reduces to one idea: a runner's position is a pure function
// progress(t) in metres along the route. The route LUT turns metres into a
// coordinate; every marker (ghost, GPS icon, fallback icon) rides the same LUT.

export type LngLat = [number, number];

/** Uniform arc-length lookup table for the canonical route. */
export interface RouteLUT {
  /** Spacing between samples in metres (uniform). */
  stepM: number;
  /** Number of samples (lng.length === lat.length === count). */
  count: number;
  /** Total route length in metres. */
  lengthM: number;
  lng: number[];
  lat: number[];
}

export interface RaceMeta {
  routeLengthM: number;
  /** Clock runs to the last of any actual or predicted finish. */
  durationMs: number;
  startLngLat: LngLat;
  /** [west, south, east, north] for fitting the camera. */
  bounds: [number, number, number, number];
  /** Sample spacing of every runner's progressM array, in ms. */
  dtMs: number;
  /**
   * Pre-race: nobody has GPS or a finish time yet, so there's no result to
   * show. The runtime falls back to a predicted-pace preview — every runner
   * runs the loop at their own predicted pace and the leaderboard is a start
   * list. Flips to false automatically the moment any real data is baked in.
   */
  prerace?: boolean;
}

/** Baked actual-position samples for a GPS runner, on a uniform time grid. */
export interface RunnerActual {
  dtMs: number;
  count: number;
  /** progressM[i] = metres along route at race-elapsed time i*dtMs. Monotonic. */
  progressM: number[];
}

export interface Runner {
  id: string;
  name: string;
  color: string;
  /** Predicted finish, ms of race-elapsed time. Drives the ghost. */
  predictedFinishMs: number;
  /** Actual finish, ms. null only when noData. */
  actualFinishMs: number | null;
  /** actualFinishMs - predictedFinishMs. Negative = beat prediction. */
  deltaMs: number | null;
  /** True when this runner has real GPS samples (actual.progressM present). */
  hasGps: boolean;
  /** True when neither GPS nor a finish time was available. */
  noData?: boolean;
  actual?: RunnerActual;
}

export interface ReplayData {
  race: RaceMeta;
  route: RouteLUT;
  runners: Runner[];
}
