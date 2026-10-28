/**
 * Состояние заставки для остального интерфейса: пока она идёт, маскот не здоровается —
 * его реплика ушла бы под оверлей. `afterIntro()` вызывает колбэк сразу, если заставки нет.
 */

import { INTRO_DURATION } from './timeline';

const SEEN_KEY = 'gitlib.intro';

let active = false;
const waiters: (() => void)[] = [];

export function introActive(): boolean {
  return active;
}

export function beginIntro(): void {
  active = true;
}

export function finishIntro(): void {
  if (!active) return;
  active = false;
  for (const cb of waiters.splice(0)) cb();
}

/** Если оверлей так и не отчитался о конце (отброшенный рендер, стоп-кадр), ждать дольше заставки не нужно. */
export const AFTER_INTRO_FALLBACK_MS = INTRO_DURATION + 3000;

/** Выполнить после конца заставки (или сразу). Возвращает отмену. */
export function afterIntro(cb: () => void): () => void {
  if (!active) {
    cb();
    return () => {};
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  const remove = () => {
    const i = waiters.indexOf(waiter);
    if (i >= 0) waiters.splice(i, 1);
    if (timer !== null) clearTimeout(timer);
  };
  const waiter = () => {
    remove();
    cb();
  };
  waiters.push(waiter);
  timer = setTimeout(waiter, AFTER_INTRO_FALLBACK_MS);
  return remove;
}

/** `?intro=<мс>` в адресе — стоп-кадр заставки на этой миллисекунде (для настройки сцены). */
export function frozenIntroTime(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('intro');
  if (raw === null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Заставка идёт один раз за сессию вкладки и не показывается при `prefers-reduced-motion`. */
export function shouldPlayIntro(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  if (frozenIntroTime() !== null) return true;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  try {
    return sessionStorage.getItem(SEEN_KEY) !== '1';
  } catch {
    return true;
  }
}

export function markIntroSeen(): void {
  try {
    sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* sessionStorage может быть недоступен */
  }
}
