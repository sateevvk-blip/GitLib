import { useSyncExternalStore } from 'react';
import { DEFAULT_CHARACTER, LEGACY_CHARACTER_IDS, isCharacterId, type CharacterId } from './characters';

const KEY = 'gitlib.mascot';
const listeners = new Set<() => void>();
let current: CharacterId | null = null;
let loaded = false;

function load(): void {
  if (loaded) return;
  loaded = true;
  try {
    const v = localStorage.getItem(KEY);
    current = isCharacterId(v) ? v : (v && LEGACY_CHARACTER_IDS[v]) || null;
  } catch {
    current = null;
  }
}

/** Выбранный персонаж; пока выбора не было — персонаж по умолчанию. */
export function getCharacter(): CharacterId {
  load();
  return current ?? DEFAULT_CHARACTER;
}

/** Делал ли пользователь выбор сам (чтобы один раз предложить выбрать). */
export function hasChosenCharacter(): boolean {
  load();
  return current !== null;
}

export function setCharacter(id: CharacterId): void {
  load();
  current = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* localStorage может быть недоступен */
  }
  for (const l of listeners) l();
}

export function useCharacter(): CharacterId {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getCharacter,
  );
}
