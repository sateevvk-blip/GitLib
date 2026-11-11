import { useSyncExternalStore } from 'react';
import type { ChatMessage } from '../../shared/types.js';
import { CHAT_HISTORY_LIMIT } from '../../shared/types.js';

/** О чём сейчас можно спросить маскота: репозиторий или инструмент (задаётся страницей записи). */
export type ChatTarget =
  | { kind: 'repo'; id: string; fullName: string; htmlUrl: string; branch: string; hasReadme: boolean }
  | { kind: 'tool'; id: string; title: string; url: string; domain: string; hasText: boolean };

/** Ключ истории и ожидания. У репозитория — голый id (так лежат истории в открытых вкладках), у инструмента — с префиксом. */
/** Подсказка «маскоту можно задать вопрос» — один раз за сессию на обе страницы записей. */
export const CHAT_INVITED_KEY = 'gitlib.chat.invited';

export const chatKey = (t: Pick<ChatTarget, 'kind' | 'id'>): string => (t.kind === 'repo' ? t.id : `tool:${t.id}`);
export const chatLabel = (t: ChatTarget): string => (t.kind === 'repo' ? t.fullName : t.title);
export const chatShortName = (t: ChatTarget): string => (t.kind === 'repo' ? (t.fullName.split('/')[1] ?? t.fullName) : t.title);
export const starterQuestions = (t: ChatTarget): readonly string[] => (t.kind === 'repo' ? STARTER_QUESTIONS : TOOL_STARTER_QUESTIONS);


interface ChatState {
  target: ChatTarget | null;
  open: boolean;
  /** Ключ записи (chatKey), по которой сейчас ждём ответ модели (переживает закрытие панели). */
  pendingId: string | null;
}

let state: ChatState = { target: null, open: false, pendingId: null };
const listeners = new Set<() => void>();

function set(next: ChatState): void {
  state = next;
  for (const l of listeners) l();
}

/** Страница репозитория сообщает, о чём можно спросить; уход со страницы (null) закрывает чат. */
export function setChatTarget(target: ChatTarget | null): void {
  if (!target && !state.target) return;
  const same = Boolean(target && state.target && chatKey(target) === chatKey(state.target));
  set({ ...state, target, open: same ? state.open : false });
}

export function openChat(): void {
  if (!state.target || state.open) return;
  set({ ...state, open: true });
}

export function closeChat(): void {
  if (!state.open) return;
  set({ ...state, open: false });
}

export function toggleChat(): void {
  if (state.open) closeChat();
  else openChat();
}

export function setChatPending(id: string | null): void {
  if (state.pendingId === id) return;
  set({ ...state, pendingId: id });
}

export const getChatState = (): ChatState => state;

export function useChat(): ChatState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

// ---------- история: в памяти на сессию вкладки ----------

const HISTORY_KEY = (id: string) => `gitlib.chat.${id}`;
/** Сколько сообщений держим в истории (вопросы и ответы). */
export const HISTORY_KEEP = CHAT_HISTORY_LIMIT * 2;
const histories = new Map<string, ChatMessage[]>();

function isMessage(v: unknown): v is ChatMessage {
  if (!v || typeof v !== 'object') return false;
  const m = v as Partial<ChatMessage>;
  if ((m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') return false;
  return m.sources === undefined || (Array.isArray(m.sources) && m.sources.every((s) => typeof s === 'string'));
}

export function getHistory(id: string): ChatMessage[] {
  const cached = histories.get(id);
  if (cached) return cached;
  let stored: ChatMessage[] = [];
  try {
    const raw = sessionStorage.getItem(HISTORY_KEY(id));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) stored = parsed.filter(isMessage);
  } catch {
    stored = [];
  }
  histories.set(id, stored);
  return stored;
}

export function saveHistory(id: string, messages: ChatMessage[]): ChatMessage[] {
  const trimmed = messages.slice(-HISTORY_KEEP);
  histories.set(id, trimmed);
  try {
    if (trimmed.length) sessionStorage.setItem(HISTORY_KEY(id), JSON.stringify(trimmed));
    else sessionStorage.removeItem(HISTORY_KEY(id));
  } catch {
    /* sessionStorage может быть недоступен */
  }
  return trimmed;
}

/** Вопросы для старта, пока история пуста. */
/**
 * Куда прокрутить журнал чата после изменения истории: пришёл новый ответ —
 * к последнему вопросу пользователя, чтобы ответ читался с начала; иначе — в конец
 * (свой вопрос, «думает…», ошибка, открытие панели).
 */
export function scrollAnchor(previousLength: number, history: readonly ChatMessage[]): 'question' | 'bottom' {
  const grew = history.length > previousLength;
  return grew && history[history.length - 1]?.role === 'assistant' ? 'question' : 'bottom';
}

export const TOOL_STARTER_QUESTIONS: readonly string[] = ['Подойдёт ли для моей задачи?', 'Как это подключить?', 'Какие есть ограничения?'];

export const STARTER_QUESTIONS: readonly string[] = [
  'Как установить и запустить?',
  'Какие основные возможности?',
  'Какие ограничения и подводные камни?',
  'Как это устроено внутри?',
  'С чего начать и как применить у себя?',
];
