import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Plus, X } from 'lucide-react';
import { TOOL_CATEGORIES } from '../../shared/types.js';
import { toolTitle } from '../../shared/tools.js';
import { ApiError, type ManualTool } from '../api/client';
import { useAddRepo, useAddTool } from '../api/hooks';
import { cssDuration } from '../lib/motion';
import { useOnline } from '../lib/online';
import { toast } from '../lib/toast';
import { hold, phrases, react, release } from '../mascot/store';

const HOLD_KEY = 'tool-add';
const GITHUB_REPO = /^(?:https?:\/\/)?(?:www\.)?github\.com\/[\w.-]+\/[\w.-]+?(?:\.git)?(?:[/?#].*)?$/i;

interface Props {
  autoFocus?: boolean;
  /** Вызывается после успешного добавления, перед переходом на карточку. */
  onDone?: () => void;
  /** Идёт ли добавление: на это время диалог не закрывается по Esc. */
  onBusyChange?: (busy: boolean) => void;
}

/** Форма добавления: адрес → загрузка страницы; при сбое — ручная карточка. Лежит и в диалоге, и в пустом каталоге. */
export function AddToolForm({ autoFocus, onDone, onBusyChange }: Props) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<{ text: string; to?: string; info?: boolean } | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [focusTitle, setFocusTitle] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const [github, setGithub] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const addTool = useAddTool();
  const addRepo = useAddRepo();
  const navigate = useNavigate();
  const online = useOnline();

  const busy = addTool.isPending || addRepo.isPending;
  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);
  const showManual = manualOpen || !online;
  const trimmed = url.trim();

  // После ошибки загрузки ручная форма раскрывается сама — фокус на «Название».
  useEffect(() => {
    if (focusTitle && showManual && !busy) {
      titleRef.current?.focus();
      setFocusTitle(false);
    }
  }, [focusTitle, showManual, busy]);

  const addAsTool = async (manual?: ManualTool) => {
    setError(null);
    setGithub(false);
    setForbidden(false);
    hold('thinking', manual ? undefined : phrases.toolReading, HOLD_KEY);
    try {
      const tool = await addTool.mutateAsync({ url: trimmed, manual });
      const name = toolTitle(tool);
      react('happy', phrases.toolAdded(name), 4500);
      toast('success', `Добавлен инструмент «${name}»`);
      onDone?.();
      navigate(`/tools/${tool.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'duplicate') {
        const id = typeof err.extra.toolId === 'string' ? err.extra.toolId : undefined;
        setError({ text: err.message, to: id && `/tools/${id}`, info: true });
        react('laugh', phrases.toolDuplicate, 3500);
      } else {
        setError({ text: err instanceof Error ? err.message : 'Не удалось добавить инструмент' });
        const code = err instanceof ApiError ? err.code : '';
        // Страницу не прочитать (сбой или закрытый адрес): карточку можно заполнить вручную.
        if (!manual && (code.startsWith('fetch_') || code === 'url_forbidden')) {
          setManualOpen(true);
          setFocusTitle(true);
        }
        react('sad', code === 'url_forbidden' ? phrases.toolForbidden : phrases.toolFetchFailed, 4500);
        if (code === 'url_forbidden') setForbidden(true);
      }
    } finally {
      release(HOLD_KEY);
    }
  };

  const addAsRepo = async () => {
    setError(null);
    hold('thinking', phrases.reading, HOLD_KEY);
    try {
      const repo = await addRepo.mutateAsync(trimmed);
      react('happy', phrases.added(repo.name), 4500);
      toast('success', `Добавлен ${repo.fullName}`);
      onDone?.();
      navigate(`/repo/${repo.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'duplicate') {
        const id = typeof err.extra.repoId === 'string' ? err.extra.repoId : undefined;
        setError({ text: err.message, to: id && `/repo/${id}`, info: true });
        react('laugh', phrases.duplicate, 3500);
      } else {
        setError({ text: err instanceof Error ? err.message : 'Не удалось добавить репозиторий' });
        react('sad', phrases.addFailed, 4000);
      }
    } finally {
      release(HOLD_KEY);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!trimmed || busy || !online) return;
    // Ссылка на репозиторий GitHub — скорее всего это не инструмент: сначала спрашиваем.
    if (GITHUB_REPO.test(trimmed)) setGithub(true);
    else void addAsTool();
  };

  const submitManual = (e: FormEvent) => {
    e.preventDefault();
    if (!trimmed || !title.trim() || busy) return;
    void addAsTool({
      title: title.trim(),
      description: description.trim() || undefined,
      category: category.trim() || undefined,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
    });
  };

  return (
    <div className="add-tool">
      <form className="add-form" onSubmit={submit}>
        <input
          className="input"
          type="text"
          inputMode="url"
          autoFocus={autoFocus}
          placeholder="https://example.com"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError(null);
            setForbidden(false);
            setGithub(false);
          }}
          disabled={busy}
          spellCheck={false}
          autoComplete="off"
          aria-label="Адрес сайта, сервиса или библиотеки"
        />
        <button type="submit" className="btn btn-primary" disabled={busy || !trimmed || !online} title={online ? undefined : 'Нет сети'}>
          {busy ? <span className="spinner" /> : <Plus size={16} />}
          {busy ? 'Читаю…' : 'Добавить'}
        </button>
      </form>

      {github && (
        <div className="add-tool-hint" role="status">
          <span>Похоже на репозиторий GitHub. Добавить его в библиотеку репозиториев — там будут README, звёзды и статусы изучения.</span>
          <div className="row">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void addAsRepo()} disabled={busy}>
              Добавить в библиотеку
            </button>
            <button type="button" className="btn btn-sm" onClick={() => void addAsTool()} disabled={busy}>
              Всё равно как инструмент
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className={error.info ? 'add-tool-hint' : 'add-tool-error'} role="alert">
          <span>{error.text}</span>
          {error.to && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                onDone?.();
                navigate(error.to!);
              }}
            >
              Открыть
            </button>
          )}
        </div>
      )}
      {forbidden && <div className="add-tool-note">Карточку можно заполнить вручную: страницу GitLib загружать не будет.</div>}
      {!online && !error && <div className="add-tool-note">Нет сети — страницу не загрузить, но карточку можно заполнить вручную.</div>}

      {online && (
        <button type="button" className="add-tool-toggle" aria-expanded={showManual} aria-controls="add-tool-manual" onClick={() => setManualOpen((v) => !v)}>
          <ChevronDown size={14} style={{ transform: showManual ? 'rotate(180deg)' : undefined }} />
          Заполнить вручную, без загрузки страницы
        </button>
      )}
      {showManual && (
        <form id="add-tool-manual" className="add-tool-manual" onSubmit={submitManual}>
          <label className="field">
            <span className="label">Название *</span>
            <input ref={titleRef} className="input" value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} disabled={busy} required />
          </label>
          <label className="field">
            <span className="label">Описание</span>
            <textarea className="input add-tool-text" value={description} maxLength={2000} rows={3} onChange={(e) => setDescription(e.target.value)} disabled={busy} />
          </label>
          <div className="add-tool-pair">
            <label className="field">
              <span className="label">Категория</span>
              <input className="input" list="tool-categories" value={category} maxLength={100} onChange={(e) => setCategory(e.target.value)} disabled={busy} />
              <datalist id="tool-categories">
                {TOOL_CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span className="label">Теги через запятую</span>
              <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} disabled={busy} />
            </label>
          </div>
          {!trimmed && <span className="field-hint">Адрес сайта нужен и для ручной карточки — введите его выше.</span>}
          <div className="row">
            <button type="submit" className="btn btn-primary" disabled={busy || !trimmed || !title.trim()}>
              {busy && <span className="spinner" />}
              Сохранить карточку
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function AddToolDialog({ onClose }: { onClose: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Кнопка, открывшая диалог: читаем при первом рендере, до autoFocus поля адреса.
  const opener = useRef(document.activeElement as HTMLElement | null);
  // onClose у родителя — новая функция на каждый рендер, поэтому эффекты от неё не зависят.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const onBusyChange = useCallback((b: boolean) => {
    busyRef.current = b;
    setBusy(b);
  }, []);

  const close = useCallback(() => {
    if (closeTimer.current || busyRef.current) return;
    setLeaving(true);
    closeTimer.current = setTimeout(() => onCloseRef.current(), cssDuration('--dur-base'));
  }, []);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (closeTimer.current) clearTimeout(closeTimer.current);
      // В StrictMode (dev) очистка идёт и между повторными запусками эффекта: узел ещё в документе — фокус не трогаем.
      queueMicrotask(() => {
        if (!boxRef.current?.isConnected) opener.current?.focus?.();
      });
    };
  }, [close]);

  // Фокус остаётся внутри диалога.
  const trap = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const items = [...(boxRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className={`confirm add-tool-overlay${leaving ? ' is-leaving' : ''}`} role="dialog" aria-modal="true" aria-labelledby="add-tool-title" onKeyDown={trap}>
      <div ref={boxRef} className="confirm-box add-tool-box">
        <div className="add-tool-head">
          <h3 id="add-tool-title">Добавить инструмент</h3>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={close} disabled={busy} aria-label="Закрыть">
            <X size={16} />
          </button>
        </div>
        <p>Вставьте адрес сайта, сервиса или библиотеки. GitLib прочитает страницу и составит карточку-черновик.</p>
        <AddToolForm autoFocus onDone={() => onCloseRef.current()} onBusyChange={onBusyChange} />
      </div>
    </div>
  );
}
