import { useSyncExternalStore } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
const KEY = 'gitlib.theme';
const listeners = new Set<() => void>();
let pref: ThemePreference = 'system';

function read(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
}

function systemDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolvedTheme(): 'light' | 'dark' {
  return pref === 'dark' || (pref === 'system' && systemDark()) ? 'dark' : 'light';
}

function apply(): void {
  document.documentElement.dataset.theme = resolvedTheme();
  for (const l of listeners) l();
}

export function initTheme(): void {
  pref = read();
  apply();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (pref === 'system') apply();
  });
}

export function setTheme(next: ThemePreference): void {
  pref = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* localStorage может быть недоступен */
  }
  apply();
}

export function useTheme(): { preference: ThemePreference; resolved: 'light' | 'dark'; setTheme: typeof setTheme } {
  const preference = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => pref,
  );
  return { preference, resolved: resolvedTheme(), setTheme };
}
