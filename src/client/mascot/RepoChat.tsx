import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Eraser, FileText, SendHorizontal, X } from 'lucide-react';
import type { ChatMessage } from '../../shared/types.js';
import { CHAT_MESSAGE_MAX_CHARS } from '../../shared/types.js';
import { useChatMutation, useSettings } from '../api/hooks';
import { Markdown } from '../components/Markdown';
import { errorMessage } from '../lib/toast';
import { useOnline } from '../lib/online';
import { CHARACTERS } from './characters';
import { useCharacter } from './choice';
import { chatKey, chatLabel, chatShortName, closeChat, getChatState, getHistory, saveHistory, scrollAnchor, setChatPending, starterQuestions, useChat, type ChatTarget } from './chat';
import { hold, phrases, react, release } from './store';

interface Props {
  target: ChatTarget;
}

/** Ключ удержания маскота на время ожидания ответа — не мешает удержанию страницы на время анализа. */
const HOLD_KEY = 'chat';

/**
 * Чат о репозитории или инструменте — открывается кликом по маскоту на странице записи.
 * История живёт в браузере на сессию вкладки, запись в библиотеке не меняется.
 * Ответ сохраняется в историю даже если панель закрыли, пока модель думала.
 */
export function RepoChat({ target }: Props) {
  const settings = useSettings();
  const online = useOnline();
  const character = CHARACTERS[useCharacter()];
  const { pendingId } = useChat();
  const key = chatKey(target);
  const [history, setHistory] = useState<ChatMessage[]>(() => getHistory(key));
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const seenLength = useRef(history.length);
  const anchor = useRef<'question' | 'bottom'>('bottom');

  const chat = useChatMutation({
    onMutate: ({ target: t }) => {
      setChatPending(chatKey(t));
      hold('thinking', t.kind === 'tool' ? phrases.toolChatThinking : phrases.chatThinking, HOLD_KEY);
    },
    onSuccess: (r, { target: t, messages }) => {
      const k = chatKey(t);
      const next = saveHistory(k, [...messages, { role: 'assistant', content: r.reply, ...(r.sources.length ? { sources: r.sources } : {}) }]);
      setNotice(r.notice);
      if (k === key) setHistory(next);
      react('happy', phrases.chatReplied, 2500);
      inputRef.current?.focus();
    },
    onError: (e, { target: t }) => {
      if (chatKey(t) === key) setError(errorMessage(e));
      react('dizzy', phrases.chatFailed, 3500);
    },
    onSettled: (_r, _e, { target: t }) => {
      // Пока шёл этот ответ, могли спросить про другую запись — её ожидание не трогаем.
      if (getChatState().pendingId === chatKey(t)) {
        setChatPending(null);
        release(HOLD_KEY);
      }
      if (chatKey(t) === key) setHistory(getHistory(key));
    },
  });

  const llmConfigured = settings.data?.llmConfigured ?? false;
  const pending = chat.isPending || pendingId === key;
  const canAsk = llmConfigured && online && !pending;
  const shortName = chatShortName(target);
  const isTool = target.kind === 'tool';
  // Вопрос без ответа (панель закрыли до ответа, и он не пришёл) — предлагаем повторить.
  const unanswered = !pending && !error && history[history.length - 1]?.role === 'user';

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Панель закрыли, а ответ пришёл позже — при новом открытии показываем актуальную историю.
  useEffect(() => {
    if (!pending) setHistory(getHistory(key));
  }, [pending, key]);

  // Новый ответ показываем с вопроса, а не с конца — длинный ответ читается сверху вниз.
  // Якорь выбирается при изменении длины истории и держится, пока эффект срабатывает
  // на смену pending/error, иначе ответ тут же уезжал бы в конец.
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    if (history.length !== seenLength.current) {
      anchor.current = scrollAnchor(seenLength.current, history);
      seenLength.current = history.length;
    }
    if (anchor.current === 'question') {
      const questions = el.querySelectorAll<HTMLElement>('.chat-msg.is-user');
      const question = questions[questions.length - 1];
      if (question) {
        el.scrollTop = question.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - 6;
        return;
      }
    }
    el.scrollTop = el.scrollHeight;
  }, [history, pending, error]);

  const ask = (messages: ChatMessage[]) => {
    setError(null);
    setNotice(null);
    chat.mutate({ target, messages });
  };

  const send = (text: string) => {
    const content = text.trim().slice(0, CHAT_MESSAGE_MAX_CHARS);
    if (!content || !canAsk) return;
    const next = saveHistory(key, [...history, { role: 'user', content }]);
    setHistory(next);
    setDraft('');
    ask(next);
  };

  const retry = () => {
    if (history[history.length - 1]?.role === 'user') ask(history);
  };

  const clear = () => {
    setHistory(saveHistory(key, []));
    setError(null);
    setNotice(null);
    inputRef.current?.focus();
  };

  const onInputKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(draft);
    }
  };

  const onPanelKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeChat();
    }
  };

  return (
    <section className="chat-panel" role="dialog" aria-label={`Чат о ${chatLabel(target)}`} onKeyDown={onPanelKeyDown}>
      <header className="chat-head">
        <div className="chat-title">
          <strong>{character.name}</strong>
          <span className="chat-repo" title={chatLabel(target)}>
            {chatLabel(target)}
          </span>
        </div>
        <div className="chat-tools">
          {history.length > 0 && (
            <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={clear} title="Очистить разговор" disabled={pending}>
              <Eraser size={15} />
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={closeChat} title="Закрыть (Esc)">
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="chat-log" ref={logRef}>
        {!llmConfigured ? (
          <div className="notice chat-notice">
            <span>
              {phrases.chatNoLlm} <Link to="/settings">Настроить →</Link>
            </span>
          </div>
        ) : (
          <div className="chat-msg">
            <div className="chat-bubble">{target.kind === 'tool' ? phrases.toolChatWelcome(shortName, target.hasText, online) : phrases.chatWelcome(shortName, target.hasReadme, online)}</div>
          </div>
        )}
        {llmConfigured && history.length === 0 && (
          <div className="chat-chips">
            {starterQuestions(target).map((q) => (
              <button type="button" key={q} className="chip chat-chip" onClick={() => send(q)} disabled={!canAsk}>
                {q}
              </button>
            ))}
          </div>
        )}
        {history.map((m, i) => (
          <div key={i} className={`chat-msg${m.role === 'user' ? ' is-user' : ''}`}>
            <div className="chat-bubble">
              {m.role !== 'assistant' ? (
                m.content
              ) : target.kind === 'repo' ? (
                <Markdown markdown={m.content} repoUrl={target.htmlUrl} branch={target.branch} noImages />
              ) : (
                <Markdown markdown={m.content} noImages />
              )}
            </div>
            {m.role === 'assistant' && m.sources && m.sources.length > 0 && (
              <div className="chat-sources" title={isTool ? 'Ответ основан на сохранённом тексте страницы' : 'Файлы репозитория, которые прочитал напарник'}>
                <FileText size={12} />
                {target.kind === 'repo' ? (
                  m.sources.map((path) => (
                    <a key={path} href={`${target.htmlUrl}/blob/${target.branch}/${path}`} target="_blank" rel="noreferrer">
                      {path}
                    </a>
                  ))
                ) : (
                  // Адрес — из нашей базы, а не из ответа сервера.
                  <a href={target.url} target="_blank" rel="noopener noreferrer">
                    {target.domain}
                  </a>
                )}
              </div>
            )}
          </div>
        ))}
        {notice && !pending && <div className="chat-notice-line">{notice}</div>}
        {pending && (
          <div className="chat-msg">
            <div className="chat-bubble chat-pending">
              <span className="spinner" /> {character.name} думает…
            </div>
          </div>
        )}
        {(error || unanswered) && (
          <div className="error-box chat-error">
            <AlertTriangle size={16} />
            <span>{error ?? 'Ответ не получен.'}</span>
            <button type="button" className="btn btn-sm" onClick={retry} disabled={!canAsk}>
              Повторить
            </button>
          </div>
        )}
      </div>

      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <textarea
          ref={inputRef}
          className="input chat-input"
          rows={1}
          placeholder={!llmConfigured ? 'LLM не настроена' : !online ? 'Нет сети' : `Спросить про ${shortName}…`}
          value={draft}
          maxLength={CHAT_MESSAGE_MAX_CHARS}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onInputKeyDown}
          disabled={!llmConfigured || !online}
        />
        <button type="submit" className="btn btn-primary btn-icon" disabled={!canAsk || !draft.trim()} title="Отправить (Enter)">
          <SendHorizontal size={16} />
        </button>
      </form>
    </section>
  );
}
