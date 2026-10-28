import { useEffect, useState } from 'react';

export type DurationToken = '--dur-quick' | '--dur-base' | '--dur-slow';

const FALLBACK_MS: Record<DurationToken, number> = {
  '--dur-quick': 150,
  '--dur-base': 250,
  '--dur-slow': 350,
};

/**
 * Длительность CSS-токена из `:root` в миллисекундах — чтобы JS ждал конца анимации ухода
 * ровно столько, сколько её играет CSS. Вне браузера (тесты) — значения по умолчанию.
 */
export function cssDuration(token: DurationToken): number {
  const fallback = FALLBACK_MS[token];
  if (typeof document === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return fallback;
  return raw.endsWith('ms') ? n : n * 1000;
}

/**
 * Держит последнее непустое значение ещё `exit` после того, как оно стало null, — чтобы элемент
 * успел сыграть анимацию ухода. `value` должен быть стабильной ссылкой (строка или объект из стора).
 */
export function usePresence<T>(value: T | null, exit: DurationToken): { shown: T | null; leaving: boolean } {
  const [last, setLast] = useState<T | null>(value);
  if (value !== null && value !== last) setLast(value);

  useEffect(() => {
    if (value !== null || last === null) return;
    const t = setTimeout(() => setLast(null), cssDuration(exit));
    return () => clearTimeout(t);
  }, [value, last, exit]);

  return { shown: value ?? last, leaving: value === null && last !== null };
}
