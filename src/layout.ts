// Responsive shell. Desktop: the panel is a static side panel (CSS owns it).
// Mobile: it's a bottom sheet with two snap points (peek / expanded), dragged
// with pointer capture, velocity-based dismissal, and friction past the edges
// (plan: Motion & Interaction Design). A scrim fades in with sheet progress.

// Peek shows the handle + the runner chip rail, stacked ABOVE the transport
// (which is fixed over the sheet's bottom edge) — so the peek height is the
// visible content plus however tall the transport currently is (it varies
// with the safe-area inset).
const PEEK_CONTENT_PX = 92;
const FLICK = 0.4; // px/ms past which a flick decides direction
const TAP_PX = 6; // movement under this is a tap, not a drag
const EDGE_FRICTION = 0.3;

type SheetState = 'peek' | 'expanded';

export interface LayoutHandle {
  expand(): void;
  peek(): void;
}

export function createLayout(panel: HTMLElement, handle: HTMLElement): LayoutHandle {
  const mq = matchMedia('(max-width: 900px)');
  const scrim = document.createElement('div');
  scrim.className = 'sheet-scrim';
  panel.parentElement?.insertBefore(scrim, panel);

  let state: SheetState = 'peek';
  let currentY = 0;

  const isMobile = (): boolean => mq.matches;
  const peekPx = (): number =>
    PEEK_CONTENT_PX + (document.getElementById('transport')?.offsetHeight ?? 68);
  const peekY = (): number => Math.max(0, panel.offsetHeight - peekPx());

  function apply(y: number, animate: boolean): void {
    currentY = y;
    panel.style.transition = animate ? 'transform var(--dur-sheet) var(--ease-sheet)' : 'none';
    panel.style.transform = `translateY(${y}px)`;
    const max = peekY() || 1;
    const progress = 1 - Math.min(1, Math.max(0, y / max)); // 0 peek .. 1 expanded
    scrim.style.opacity = String(progress * 0.5);
    scrim.style.pointerEvents = progress > 0.05 ? 'auto' : 'none';
  }

  function snap(next: SheetState): void {
    state = next;
    panel.dataset.state = next;
    if (!isMobile()) {
      panel.style.transform = '';
      panel.style.transition = '';
      scrim.style.opacity = '0';
      scrim.style.pointerEvents = 'none';
      return;
    }
    apply(next === 'peek' ? peekY() : 0, true);
  }

  // --- drag ---------------------------------------------------------------
  let dragging = false;
  let startPointer = 0;
  let startY = 0;
  let lastY = 0;
  let lastT = 0;
  let vel = 0;

  function onDown(e: PointerEvent): void {
    if (!isMobile()) return;
    dragging = true;
    startPointer = e.clientY;
    startY = state === 'peek' ? peekY() : 0;
    lastY = startY;
    lastT = performance.now();
    vel = 0;
    handle.setPointerCapture?.(e.pointerId);
    apply(startY, false);
  }

  function onMove(e: PointerEvent): void {
    if (!dragging) return;
    const max = peekY();
    let y = startY + (e.clientY - startPointer);
    if (y < 0) y *= EDGE_FRICTION; // friction past the top
    else if (y > max) y = max + (y - max) * EDGE_FRICTION;
    const now = performance.now();
    vel = (y - lastY) / (now - lastT || 1);
    lastY = y;
    lastT = now;
    apply(y, false);
  }

  function onUp(e: PointerEvent): void {
    if (!dragging) return;
    dragging = false;
    handle.releasePointerCapture?.(e.pointerId);
    const moved = Math.abs(currentY - startY);
    if (moved < TAP_PX) {
      snap(state === 'peek' ? 'expanded' : 'peek'); // tap toggles
      return;
    }
    let target: SheetState;
    if (vel > FLICK) target = 'peek';
    else if (vel < -FLICK) target = 'expanded';
    else target = currentY < peekY() / 2 ? 'expanded' : 'peek';
    snap(target);
  }

  handle.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  scrim.addEventListener('click', () => snap('peek'));
  mq.addEventListener('change', () => snap(state));

  snap('peek');

  return {
    expand: () => snap('expanded'),
    peek: () => snap('peek'),
  };
}
