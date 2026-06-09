import { describe, it, expect } from 'vitest';
import { Clock } from '../src/clock';

/** A clock with a hand-cranked `now` so we control wall time exactly. */
function fakeClock(durationMs = 10_000) {
  const state = { now: 0 };
  const clock = new Clock({ durationMs, now: () => state.now });
  return { clock, advance: (ms: number) => (state.now += ms) };
}

describe('Clock', () => {
  it('maps wall time to race time at speed 1 while playing', () => {
    const { clock, advance } = fakeClock();
    clock.play();
    advance(2500);
    expect(clock.raceMs()).toBe(2500);
  });

  it('does not advance while paused', () => {
    const { clock, advance } = fakeClock();
    clock.play();
    advance(1000);
    clock.pause();
    advance(5000);
    expect(clock.raceMs()).toBe(1000);
  });

  it('resumes from where it paused with no jump', () => {
    const { clock, advance } = fakeClock();
    clock.play();
    advance(1000);
    clock.pause();
    advance(5000);
    clock.play();
    advance(500);
    expect(clock.raceMs()).toBe(1500);
  });

  it('changes speed with no positional jump', () => {
    const { clock, advance } = fakeClock();
    clock.play();
    advance(1000); // race = 1000
    clock.setSpeed(4);
    expect(clock.raceMs()).toBe(1000); // no jump at the moment of change
    advance(1000); // +1000 wall * 4 = +4000 race
    expect(clock.raceMs()).toBe(5000);
  });

  it('seeks whether playing or paused', () => {
    const { clock, advance } = fakeClock();
    clock.seek(3000);
    expect(clock.raceMs()).toBe(3000); // paused
    clock.play();
    advance(200);
    clock.seek(8000);
    advance(100);
    expect(clock.raceMs()).toBe(8100); // continues from the seek point
  });

  it('clamps to [0, duration]', () => {
    const { clock, advance } = fakeClock(5000);
    clock.play();
    advance(99_999);
    expect(clock.raceMs()).toBe(5000);
    clock.seek(-1000);
    expect(clock.raceMs()).toBe(0);
  });

  it('stops at the end on tick, and play() restarts from 0', () => {
    const { clock, advance } = fakeClock(5000);
    clock.play();
    advance(6000);
    expect(clock.tick()).toBe(5000);
    expect(clock.playing).toBe(false); // stopped
    clock.play();
    expect(clock.raceMs()).toBe(0); // restarted from the top
  });

  it('loops back to 0 on tick when loop is enabled', () => {
    const { clock, advance } = fakeClock(5000);
    clock.loop = true;
    clock.play();
    advance(6000);
    expect(clock.tick()).toBe(0);
    expect(clock.playing).toBe(true); // still going
  });
});
