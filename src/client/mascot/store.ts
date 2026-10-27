import { useSyncExternalStore } from 'react';

export type Mood = 'idle' | 'thinking' | 'happy' | 'sad' | 'search' | 'sleep' | 'love' | 'surprised';

interface MascotState {
  mood: Mood;
  message: string | null;
  /** Настроение «залипает», пока не вызовут release() — для долгих операций. */
  sticky: boolean;
}

let state: MascotState = { mood: 'idle', message: null, sticky: false };
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function set(next: MascotState): void {
  state = next;
  for (const l of listeners) l();
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/** Короткая реакция: настроение и реплика на несколько секунд. */
export function react(mood: Mood, message?: string | readonly string[], ms = 4000): void {
  if (timer) clearTimeout(timer);
  const text = Array.isArray(message) ? pick(message as readonly string[]) : (message as string | undefined) ?? null;
  set({ mood, message: text, sticky: false });
  timer = setTimeout(() => set({ mood: 'idle', message: null, sticky: false }), ms);
}

/** Долгое состояние (загрузка, анализ) — держится до release(). */
export function hold(mood: Mood, message?: string): void {
  if (timer) clearTimeout(timer);
  timer = null;
  set({ mood, message: message ?? null, sticky: true });
}

export function release(): void {
  if (!state.sticky) return;
  set({ mood: 'idle', message: null, sticky: false });
}

/** Фоновое настроение (пустая библиотека → спит), не перебивает активные реакции. */
export function setAmbient(mood: Mood, message: string | null): void {
  if (state.sticky || timer) return;
  if (state.mood === mood && state.message === message) return;
  set({ mood, message, sticky: false });
}

export function useMascot(): MascotState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

export const phrases = {
  empty: 'Тут пока пусто. Вставь ссылку на репозиторий — я всё прочитаю и разложу по полкам.',
  idleTips: [
    'Нажми «/», чтобы сразу перейти к поиску.',
    'Темы можно комбинировать: фильтры складываются.',
    'Заметки — твои. Обновление с GitHub их не тронет.',
    'Экспорт в JSON — это и есть резервная копия.',
    'Я ищу и по кириллице: «парсер», «очередь», «бэкап».',
    'Статус «Отложено» — для того, что жалко удалить.',
  ],
  reading: ['Читаю README…', 'Листаю репозиторий…', 'Снимаю мерки с проекта…'],
  analyzing: ['Думаю над сводкой…', 'Разбираюсь, зачем это нужно…'],
  added: (name: string) => [`Сохранил ${name}!`, `${name} теперь на полке.`, `Готово: ${name} в библиотеке.`],
  duplicate: ['Так это уже есть у нас!', 'Знакомое название — он уже в библиотеке.'],
  addFailed: ['Не вышло. Посмотри, что пишет.', 'Хм, не получилось добавить.'],
  analysisDone: ['Сводка готова!', 'Разобрался. Читай.'],
  analysisFailed: ['AI не ответил. Можно попробовать ещё раз.', 'Сводка не сложилась — повтори позже.'],
  searching: ['Ищу…', 'Смотрю по полкам…'],
  nothingFound: ['Пусто. Попробуй другое слово.', 'Ничего похожего не нашёл.'],
  favoriteOn: ['В избранное!', 'Отметил звёздочкой.'],
  favoriteOff: ['Убрал из избранного.'],
  statusChanged: (label: string) => [`Теперь это «${label}».`, `Переложил в «${label}».`],
  noteSaved: ['Записал.', 'Заметка на месте.'],
  refreshed: ['Обновил данные с GitHub.', 'Свежие цифры подъехали.'],
  deleted: ['Удалил. Если что — экспорт выручит.', 'Снял с полки.'],
  exported: ['Экспорт готов — это твоя резервная копия.'],
  imported: ['Импортировал! Ничего твоего не потерял.'],
  offline: 'Нет сети. Читать и править можно, а GitHub и AI подождут.',
  online: ['Сеть вернулась!'],
  darkTheme: ['Приглушил свет.', 'Ночной режим читального зала.'],
  lightTheme: ['Включил дневной свет.'],
  collectionCreated: (name: string) => [`Новая полка: «${name}».`],
  settingsSaved: ['Настройки сохранил.'],
} as const;
