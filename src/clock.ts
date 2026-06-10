// The playback clock. One scalar — race-elapsed milliseconds — is the single
// source of truth for the whole replay; every marker position is a pure function
// of it. State is an anchor pair (wallAnchor, raceAnchor) plus speed, so
// play/pause/seek/speed are all just re-anchoring, and seeking is "set a number
// and render one frame" (KTD5). `now` is injectable so the logic is testable
// without a real clock.

export interface ClockOptions {
  durationMs: number;
  now?: () => number;
}

export class Clock {
  durationMs: number;
  loop = false;

  private readonly now: () => number;
  private wallAnchor: number;
  private raceAnchor = 0;
  private _speed = 1;
  private _playing = false;

  constructor(opts: ClockOptions) {
    this.durationMs = opts.durationMs;
    this.now = opts.now ?? (() => performance.now());
    this.wallAnchor = this.now();
  }

  private clamp(t: number): number {
    if (t < 0) return 0;
    if (t > this.durationMs) return this.durationMs;
    return t;
  }

  /** Current race-elapsed time, clamped to [0, duration]. Pure: no side effects. */
  raceMs(): number {
    const t = this._playing
      ? this.raceAnchor + (this.now() - this.wallAnchor) * this._speed
      : this.raceAnchor;
    return this.clamp(t);
  }

  get playing(): boolean {
    return this._playing;
  }
  get speed(): number {
    return this._speed;
  }
  get atEnd(): boolean {
    return this.raceMs() >= this.durationMs;
  }

  play(): void {
    if (this._playing) return;
    let t = this.raceMs();
    if (t >= this.durationMs) t = 0; // restart from the top if parked at the end
    this.raceAnchor = t;
    this.wallAnchor = this.now();
    this._playing = true;
  }

  pause(): void {
    if (!this._playing) return;
    this.raceAnchor = this.raceMs();
    this._playing = false;
  }

  toggle(): void {
    if (this._playing) this.pause();
    else this.play();
  }

  /** Jump to a time. Works identically whether playing or paused. */
  seek(ms: number): void {
    this.raceAnchor = this.clamp(ms);
    this.wallAnchor = this.now();
  }

  /** Change playback rate with no positional jump (re-anchor, then set speed). */
  setSpeed(x: number): void {
    this.raceAnchor = this.raceMs();
    this.wallAnchor = this.now();
    this._speed = x;
  }

  /**
   * Call once per frame. Returns the current time and handles end-of-race:
   * loop back to 0 or stop at the end. Keeping the loop/stop side effect here
   * (not in raceMs) keeps raceMs pure for seeking and rendering.
   */
  tick(): number {
    let t = this.raceMs();
    if (this._playing && t >= this.durationMs) {
      if (this.loop) {
        this.seek(0);
        t = 0;
      } else {
        this.pause();
        t = this.durationMs;
      }
    }
    return t;
  }
}
