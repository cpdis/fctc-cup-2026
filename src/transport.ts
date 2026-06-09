// Playback transport: play/pause, scrub, speed, clock readout, and finish-tick
// annotations. Motion contract (plan: Motion & Interaction Design):
//  - speed change is instant; the active indicator slides (sliding pill)
//  - scrub-drag is direct (range input gives native pointer capture)
//  - clicking a finish tick TWEENS the clock to that moment (not a teleport)
//  - spacebar toggles play/pause, weightless
//  - the loop pauses when the tab is hidden

import type { Clock } from './clock';
import type { Runner } from './types';
import { formatClock } from './geo';
import { finalWinnerId } from './standings';

const SPEEDS = [1, 5, 15, 30];
const DEFAULT_SPEED = 15;
const JUMP_MS = 250;

const PLAY_ICON =
  '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13a1 1 0 0 0 1.54.84l10-6.5a1 1 0 0 0 0-1.68l-10-6.5A1 1 0 0 0 8 5.5Z"/></svg>';
const PAUSE_ICON =
  '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M7 4h3v16H7zM14 4h3v16h-3z"/></svg>';

export interface TransportHandle {
  /** Called once per frame by the main loop with the current race time. */
  update(raceMs: number): void;
}

const easeOutCubic = (p: number): number => 1 - (1 - p) ** 3;

export function createTransport(
  container: HTMLElement,
  clock: Clock,
  opts: { runners: Runner[]; durationMs: number },
): TransportHandle {
  const { durationMs, runners } = opts;
  const winnerId = finalWinnerId(runners);

  container.innerHTML = `
    <button class="tp-play" type="button" aria-label="Play">${PLAY_ICON}</button>
    <div class="tp-clock"><span class="tp-now">0:00</span><span class="tp-dur">${formatClock(durationMs)}</span></div>
    <div class="tp-rail">
      <div class="tp-fill"></div>
      <div class="tp-ticks"></div>
      <div class="tp-playhead"></div>
      <input class="tp-range" type="range" min="0" max="${durationMs}" step="100" value="0" aria-label="Scrub through the race" />
    </div>
    <div class="tp-speed" role="group" aria-label="Playback speed">
      <div class="tp-speed-pill" style="width:${100 / SPEEDS.length}%"></div>
      ${SPEEDS.map((x) => `<button type="button" data-x="${x}">${x}×</button>`).join('')}
    </div>`;

  const playBtn = container.querySelector('.tp-play') as HTMLButtonElement;
  const nowEl = container.querySelector('.tp-now') as HTMLElement;
  const fill = container.querySelector('.tp-fill') as HTMLElement;
  const playhead = container.querySelector('.tp-playhead') as HTMLElement;
  const range = container.querySelector('.tp-range') as HTMLInputElement;
  const ticksWrap = container.querySelector('.tp-ticks') as HTMLElement;
  const pill = container.querySelector('.tp-speed-pill') as HTMLElement;
  const speedBtns = Array.from(
    container.querySelectorAll('.tp-speed button'),
  ) as HTMLButtonElement[];

  // --- finish ticks -------------------------------------------------------
  for (const r of runners) {
    if (r.actualFinishMs === null) continue;
    const tick = document.createElement('button');
    tick.className = 'tp-tick' + (r.id === winnerId ? ' win' : '');
    tick.style.left = `${(r.actualFinishMs / durationMs) * 100}%`;
    tick.type = 'button';
    tick.title = `${r.name} finishes ${formatClock(r.actualFinishMs)}`;
    tick.setAttribute('aria-label', tick.title);
    tick.addEventListener('click', () => jumpTo(r.actualFinishMs as number));
    ticksWrap.appendChild(tick);
  }

  // --- speed --------------------------------------------------------------
  function setSpeed(x: number): void {
    clock.setSpeed(x);
    const idx = SPEEDS.indexOf(x);
    pill.style.transform = `translateX(${idx * 100}%)`;
    speedBtns.forEach((b) => b.classList.toggle('active', Number(b.dataset.x) === x));
  }
  speedBtns.forEach((b) =>
    b.addEventListener('click', () => setSpeed(Number(b.dataset.x))),
  );

  // --- play / pause -------------------------------------------------------
  function syncPlayIcon(): void {
    const playing = clock.playing;
    playBtn.innerHTML = playing ? PAUSE_ICON : PLAY_ICON;
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }
  playBtn.addEventListener('click', () => {
    clock.toggle();
    syncPlayIcon();
  });

  // --- scrub (direct; native pointer capture on range) --------------------
  let scrubbing = false;
  range.addEventListener('pointerdown', () => (scrubbing = true));
  const endScrub = () => (scrubbing = false);
  range.addEventListener('pointerup', endScrub);
  range.addEventListener('pointercancel', endScrub);
  range.addEventListener('input', () => clock.seek(Number(range.value)));

  // --- discrete jump (finish tick): tween the clock, don't teleport -------
  function jumpTo(target: number): void {
    const from = clock.raceMs();
    const wasPlaying = clock.playing;
    clock.pause();
    syncPlayIcon();
    const startWall = performance.now();
    const step = (n: number): void => {
      const p = Math.min(1, (n - startWall) / JUMP_MS);
      clock.seek(from + (target - from) * easeOutCubic(p));
      if (p < 1) requestAnimationFrame(step);
      else if (wasPlaying) {
        clock.play();
        syncPlayIcon();
      }
    };
    requestAnimationFrame(step);
  }

  // --- spacebar (weightless) + tab-hidden pause ---------------------------
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space') return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'BUTTON') return; // let the control handle it
    e.preventDefault();
    clock.toggle();
    syncPlayIcon();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && clock.playing) {
      clock.pause();
      syncPlayIcon();
    }
  });

  // initial state
  setSpeed(DEFAULT_SPEED);
  syncPlayIcon();

  let lastSec = -1;
  return {
    update(raceMs: number): void {
      const pct = (raceMs / durationMs) * 100;
      fill.style.width = `${pct}%`;
      playhead.style.left = `${pct}%`;
      if (!scrubbing) range.value = String(raceMs);
      const sec = Math.floor(raceMs / 1000);
      if (sec !== lastSec) {
        lastSec = sec;
        nowEl.textContent = formatClock(raceMs);
      }
      // Keep the icon honest when the clock stops itself at the end.
      if (!clock.playing && playBtn.getAttribute('aria-label') === 'Pause') {
        syncPlayIcon();
      }
    },
  };
}
