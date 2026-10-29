import { useSyncExternalStore } from 'react';
import type { ChatMessage } from '../../shared/types.js';
import { CHAT_HISTORY_LIMIT } from '../../shared/types.js';

/** Репозиторий, о котором сейчас можно спросить маскота (задаётся страницей репозитория). */
export interface ChatTarget {
  id: string;
  fullName: string;
  htmlUrl: string;
  branch: string;
  hasReadme: boolean;
}

interface ChatState {
  target: ChatTarget | null;
  open: boolean;
  /** Репозиторий, по которому сейчас ждём ответ модели (переживает закрытие панели). */
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
  const sameRepo = Boolean(target && state.target && target.id === state.target.id);
  set({ ...state, target, open: sameRepo ? state.open : false });
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
export const STARTER_QUESTIONS: readonly string[] = [
  'Как установить и запустить?',
  'Какие основные возможности?',
  'Какие ограничения и подводные камни?',
  'Как это устроено внутри?',
  'С чего начать и как применить у себя?',
];
