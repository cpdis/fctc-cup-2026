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

let current: Theme = readInitial();
document.documentElement.dataset.theme = current;

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
  document.documentElement.dataset.theme = t;
  for (const fn of listeners) fn(t);
}

export function toggleTheme(): void {
  setTheme(current === 'dark' ? 'light' : 'dark');
}

export function onThemeChange(fn: (t: Theme) => void): void {
  listeners.add(fn);
}
