import { describe, it, expect, vi } from 'vitest';
import { createEngine, ghostProgressAt, iconProgressAt, corralSlots } from '../src/engine';
import type { ReplayData, Runner, RouteLUT } from '../src/types';

const L = 1000;

function lut(): RouteLUT {
  // A 1000 m straight line east, 1 m spacing.
  const count = 1001;
  const dLng = 1 / 111320;
  const lng: number[] = [];
  const lat: number[] = [];
  for (let i = 0; i < count; i++) {
    lng.push(i * dLng);
    lat.push(0);
  }
  return { stepM: 1, count, lengthM: L, lng, lat };
}

function gpsRunner(): Runner {
  // 3 samples (t=0,1,2s) at 0, 400, 1000 m. Finishes at 2000 ms.
  return {
    id: 'g',
    name: 'G',
    color: '#f00',
    predictedFinishMs: 2000,
    actualFinishMs: 2000,
    deltaMs: 0,
    hasGps: true,
    actual: { dtMs: 1000, count: 3, progressM: [0, 400, 1000] },
  };
}

function fallbackRunner(): Runner {
  return {
    id: 'f',
    name: 'F',
    color: '#0f0',
    predictedFinishMs: 1000,
    actualFinishMs: 4000,
    deltaMs: 3000,
    hasGps: false,
  };
}

describe('ghostProgressAt', () => {
  it('is linear and reaches the full loop at the predicted finish', () => {
    const r = gpsRunner();
    expect(ghostProgressAt(r, 0, L)).toBe(0);
    expect(ghostProgressAt(r, 1000, L)).toBeCloseTo(500, 6); // half time, half loop
    expect(ghostProgressAt(r, 2000, L)).toBe(L);
    expect(ghostProgressAt(r, 9999, L)).toBe(L); // clamped
  });
});

describe('iconProgressAt — GPS runner', () => {
  it('matches baked samples and lerps between them', () => {
    const r = gpsRunner();
    expect(iconProgressAt(r, 0, L)).toBe(0);
    expect(iconProgressAt(r, 1000, L)).toBe(400);
    expect(iconProgressAt(r, 500, L)).toBe(200); // lerp 0->400
    expect(iconProgressAt(r, 1500, L)).toBe(700); // lerp 400->1000
  });
  it('clamps to the loop after the finish', () => {
    expect(iconProgressAt(gpsRunner(), 5000, L)).toBe(L);
  });
});

describe('iconProgressAt — finish-only fallback', () => {
  it('runs constant pace to the real finish (same path as a ghost)', () => {
    const r = fallbackRunner();
    expect(iconProgressAt(r, 0, L)).toBe(0);
    expect(iconProgressAt(r, 2000, L)).toBe(500); // half of 4000 ms
    expect(iconProgressAt(r, 4000, L)).toBe(L);
  });
});

describe('createEngine batched updates', () => {
  function fakeMap() {
    const sources: Record<string, { setData: ReturnType<typeof vi.fn> }> = {};
    return {
      isStyleLoaded: () => true,
      on: vi.fn(),
      off: vi.fn(),
      addSource: (id: string) => (sources[id] = { setData: vi.fn() }),
      addLayer: vi.fn(),
      getSource: (id: string) => sources[id],
      _sources: sources,
    };
  }

  const data: ReplayData = {
    race: {
      routeLengthM: L,
      durationMs: 4000,
      startLngLat: [0, 0],
      bounds: [0, 0, 1, 0],
      dtMs: 1000,
    },
    route: lut(),
    runners: [gpsRunner(), fallbackRunner()],
  };

  it('issues exactly one setData per source per frame (not one per runner)', () => {
    const map = fakeMap();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const engine = createEngine(map as any, data);
    engine.render(1000);
    for (const id of ['runners-dots', 'runners-trail']) {
      expect(map._sources[id].setData).toHaveBeenCalledTimes(1);
    }
    engine.render(2000);
    for (const id of ['runners-dots', 'runners-trail']) {
      expect(map._sources[id].setData).toHaveBeenCalledTimes(2);
    }
  });

  it('tracks the icon position for the on-map label', () => {
    const map = fakeMap();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const engine = createEngine(map as any, data);
    engine.render(1000);
    const pos = engine.positionOf('g');
    expect(pos).toBeDefined();
    // GPS runner at t=1000 is at 400 m -> lng ~ 400/111320.
    expect(pos![0]).toBeCloseTo(400 / 111320, 6);
  });

  it('parks finished runners in their corral slot, off the finish point', () => {
    const map = fakeMap();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const engine = createEngine(map as any, data);
    engine.render(2500); // g finished (2000), f still running (4000)
    const slots = corralSlots(lut(), data.runners);
    expect(engine.positionOf('g')).toEqual(slots.get('g'));
    expect(engine.positionOf('f')![0]).toBeCloseTo(625 / 111320, 6); // on course
  });

  it('exposes a positions snapshot for the auto camera', () => {
    const map = fakeMap();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const engine = createEngine(map as any, data);
    engine.render(1000);
    expect(engine.positionsSnapshot()).toHaveLength(2);
  });
});

describe('corralSlots', () => {
  it('fans finishers out perpendicular to the finish heading, in finish order', () => {
    const slots = corralSlots(lut(), [gpsRunner(), fallbackRunner()]);
    const g = slots.get('g')!; // finishes first -> closest slot
    const f = slots.get('f')!;
    // Route heads due east, so the corral runs due north (or south): same lng
    // as the finish, offset only in lat, second finisher further out.
    expect(g[0]).toBeCloseTo(1000 / 111320, 6);
    expect(f[0]).toBeCloseTo(1000 / 111320, 6);
    expect(Math.abs(g[1])).toBeGreaterThan(0);
    expect(Math.abs(f[1])).toBeGreaterThan(Math.abs(g[1]));
  });

  it('ignores runners with no finish time', () => {
    const noData: Runner = { ...fallbackRunner(), id: 'n', actualFinishMs: null, deltaMs: null };
    const slots = corralSlots(lut(), [noData]);
    expect(slots.size).toBe(0);
  });
});
