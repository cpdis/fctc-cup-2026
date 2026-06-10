// Theme store: one source of truth for light/dark. CSS reads
// <html data-theme>, the map subscribes to swap basemap styles. The initial
// value honours a saved choice, then the OS preference. index.html sets
// data-theme inline before first paint so there's no flash; this module just
// re-derives the same value for the runtime.

export type Theme = 'dark' | 'light';

const KEY = 'fctc-theme';
const listeners = new Set<(t: Theme) => void>();

function readInitial(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* storage blocked (private mode); fall through to the OS preference */
  }
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** Keep the browser chrome (iOS status bar area etc.) matching the app. */
function applyChrome(t: Theme): void {
  document.documentElement.dataset.theme = t;
  const color = t === 'dark' ? '#0a0e14' : '#f5f3ee';
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
    m.removeAttribute('media'); // stop tracking the OS; the app owns the theme
    m.setAttribute('content', color);
  }
}

let current: Theme = readInitial();
applyChrome(current);

export function getTheme(): Theme {
  return current;
}

export function setTheme(t: Theme): void {
  if (t === current) return;
  current = t;
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* fine — the choice just won't persist */
  }
  applyChrome(t);
  for (const fn of listeners) fn(t);
}

export function toggleTheme(): void {
  setTheme(current === 'dark' ? 'light' : 'dark');
}

export function onThemeChange(fn: (t: Theme) => void): void {
  listeners.add(fn);
}
