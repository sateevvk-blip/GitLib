import { useSyncExternalStore } from 'react';
import type { Mood } from './moods';

export type { Mood } from './moods';

export interface MascotLink {
  label: string;
  to: string;
}

interface MascotState {
  mood: Mood;
  message: string | null;
  /** Ссылка под репликой (например, «Выбрать» → настройки). */
  link: MascotLink | null;
  /** Настроение «залипает», пока не вызовут release() — для долгих операций. */
  sticky: boolean;
}

const IDLE: MascotState = { mood: 'idle', message: null, link: null, sticky: false };
let state: MascotState = IDLE;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
/** Долгие состояния по ключам: страница держит анализ, чат — ожидание ответа; снятие одного не сбрасывает другое. */
const holds = new Map<string, { mood: Mood; message: string | null }>();

function idleOrHold(): MascotState {
  const last = [...holds.values()].pop();
  return last ? { mood: last.mood, message: last.message, link: null, sticky: true } : IDLE;
}

function set(next: MascotState): void {
  state = next;
  for (const l of listeners) l();
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function text(message: string | readonly string[] | undefined): string | null {
  if (message === undefined) return null;
  return Array.isArray(message) ? pick(message as readonly string[]) : (message as string);
}

/** Короткая реакция: настроение и реплика на несколько секунд. */
export function react(mood: Mood, message?: string | readonly string[], ms = 4000, link?: MascotLink): void {
  if (timer) clearTimeout(timer);
  set({ mood, message: text(message), link: link ?? null, sticky: false });
  timer = setTimeout(() => {
    timer = null;
    set(idleOrHold());
  }, ms);
}

/** Долгое состояние (загрузка, анализ) — держится до release() с тем же ключом. */
export function hold(mood: Mood, message?: string | readonly string[], key = 'main'): void {
  if (timer) clearTimeout(timer);
  timer = null;
  holds.delete(key);
  holds.set(key, { mood, message: text(message) });
  set(idleOrHold());
}

/** Снимает удержание; если другие ключи ещё держат маскота — остаётся последнее из них. */
export function release(key = 'main'): void {
  holds.delete(key);
  if (!state.sticky) return;
  set(idleOrHold());
}

/** Фоновое настроение (пустая библиотека → спит), не перебивает активные реакции. */
export function setAmbient(mood: Mood, message: string | null): void {
  if (state.sticky || timer) return;
  if (state.mood === mood && state.message === message) return;
  set({ mood, message, link: null, sticky: false });
}

/** Текущее состояние вне React (для таймеров бездействия). */
export function peek(): Readonly<MascotState> {
  return state;
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

/** Круглые числа, на которых маскот устраивает праздник. */
export const MILESTONES: readonly number[] = [1, 10, 25, 50, 100, 250, 500, 1000];

export function isMilestone(total: number): boolean {
  return MILESTONES.includes(total);
}

export function timeGreeting(hour = new Date().getHours()): string {
  if (hour < 5) return 'Поздно уже. Но раз мы тут — работаем.';
  if (hour < 12) return 'Доброе утро!';
  if (hour < 18) return 'Добрый день!';
  if (hour < 23) return 'Добрый вечер!';
  return 'Ночная смена? Я с тобой.';
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
    'В настройках можно выбрать другого напарника. Но я лучше.',
  ],
  chooseMe: 'В настройках можно выбрать напарника по вкусу — нас шестеро.',
  reading: ['Читаю README…', 'Листаю репозиторий…', 'Снимаю мерки с проекта…'],
  analyzing: ['Думаю над сводкой…', 'Разбираюсь, зачем это нужно…'],
  added: (name: string) => [`Сохранил ${name}!`, `${name} теперь на полке.`, `Готово: ${name} в библиотеке.`],
  milestone: (total: number) => {
    if (total === 1) return ['Первый пошёл! С почином.'];
    return [`${total}! Это уже серьёзная библиотека.`, `Круглое число: ${total}. Праздник на полке.`];
  },
  duplicate: ['Так это уже есть у нас!', 'Знакомое название — он уже в библиотеке.', 'Дважды в одну библиотеку не входят.'],
  addFailed: ['Не вышло. Посмотри, что пишет.', 'Хм, не получилось добавить.'],
  analysisDone: ['Сводка готова!', 'Разобрался. Читай.'],
  analysisFailed: ['AI не ответил. Можно попробовать ещё раз.', 'Сводка не сложилась — повтори позже.'],
  searching: ['Ищу…', 'Смотрю по полкам…'],
  nothingFound: ['Пусто. Попробуй другое слово.', 'Ничего похожего не нашёл.'],
  favoriteOn: ['В избранное!', 'Отметил звёздочкой.'],
  favoriteOff: ['Убрал из избранного.', 'Ладно, звёздочку снял.'],
  statusChanged: (label: string) => [`Теперь это «${label}».`, `Переложил в «${label}».`],
  noteSaved: ['Записал.', 'Заметка на месте.', 'Никому не покажу.'],
  refreshed: ['Обновил данные с GitHub.', 'Свежие цифры подъехали.'],
  refreshFailed: ['Не получилось обновить.', 'GitHub не отвечает. Попробуем позже.'],
  deleted: ['Удалил. Если что — экспорт выручит.', 'Снял с полки.'],
  exported: ['Экспорт готов — это твоя резервная копия.', 'Бэкап сделан. Спокойно спать.'],
  imported: ['Импортировал! Ничего твоего не потерял.'],
  offline: 'Нет сети. Читать и править можно, а GitHub и AI подождут.',
  online: ['Сеть вернулась!', 'Снова онлайн. Продолжаем.'],
  darkTheme: ['Приглушил свет.', 'Ночной режим читального зала.', 'Темно? Я в очках.'],
  lightTheme: ['Включил дневной свет.', 'Ой, ярко!'],
  collectionCreated: (name: string) => [`Новая полка: «${name}».`],
  settingsSaved: ['Настройки сохранил.', 'Записал. Проверь подключение, если что.'],
  probeOk: ['Подключение есть!', 'Отвечает. Всё хорошо.'],
  probeFailed: ['Не отвечает. Проверь адрес и ключ.', 'Тишина на линии.'],
  wake: ['А? Я не сплю!', 'Проснулся. Что я пропустил?'],
  chatInvite: 'Есть вопросы по этому репозиторию? Нажми на меня — поболтаем.',
  chatWelcome: (name: string, hasReadme: boolean) =>
    hasReadme ? `Я прочитал README ${name}. Спрашивай — отвечу по делу.` : `README у ${name} нет — отвечу по описанию, темам и языкам. Спрашивай.`,
  chatThinking: ['Думаю над ответом…', 'Листаю README…', 'Ищу в описании…'],
  chatReplied: ['Вот что нашёл.', 'Ответил. Ещё вопросы?', 'Держи.'],
  chatFailed: ['Не смог ответить. Попробуй ещё раз.', 'Модель молчит. Повтори позже.'],
  chatClosed: ['Если что — я тут.', 'Зови, если будут вопросы.'],
  chatNoLlm: 'Чтобы отвечать на вопросы, мне нужна модель. Настрой LLM в настройках.',
  notFound: ['Такой страницы нет. Точно.', 'Я тут всё обыскал — пусто.'],
} as const;
