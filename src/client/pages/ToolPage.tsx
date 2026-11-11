import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Heart, ImageOff, NotebookPen, Pencil, RefreshCw, Tags, Trash2 } from 'lucide-react';
import { TOOL_CATEGORIES, type Tool, type ToolOverrides, type ToolPatch } from '../../shared/types.js';
import { fold } from '../../shared/search.js';
import { isDescriptionOverridden, toolCategory, toolDescription, toolSourceDescription, toolTitle } from '../../shared/tools.js';
import { ApiError } from '../api/client';
import { useAnalyzeTool, useDeleteTool, usePatchTool, useRefreshTool, useSetToolImage, useSettings, useTool, useToolFacets } from '../api/hooks';
import { Avatar } from '../components/Avatar';
import { Confirm } from '../components/Confirm';
import { EditableField } from '../components/EditableField';
import { EmptyState } from '../components/EmptyState';
import { NotesEditor } from '../components/NotesEditor';
import { ToolAnalysisPanel } from '../components/ToolAnalysisPanel';
import { ToolTagsEditor } from '../components/ToolTagsEditor';
import type { FieldValue } from '../lib/editable';
import { formatDate, formatDateTime, fullNumber, relativeDate } from '../lib/format';
import { useOnline } from '../lib/online';
import { errorMessage, toast } from '../lib/toast';
import { hold, phrases, react, release, setAmbient } from '../mascot/store';
import { setChatTarget } from '../mascot/chat';

/** Общий с репозиториями ключ: приглашение «спроси меня» — один раз за сессию. */
const CHAT_INVITED_KEY = 'gitlib.chat.invited';

const KEY_ANALYSIS = 'tool-analysis';
const KEY_REFRESH = 'tool-refresh';
const KEY_IMAGE = 'tool-image';
const CUSTOM = '__custom__';

const SOURCE_STATUS: Record<Tool['source']['status'], string> = {
  ok: 'загружена',
  partial: 'загружена частично — текста мало',
  failed: 'не загружена',
  manual: 'заполнена вручную',
};

const isHttp = (u: string) => /^https?:\/\//i.test(u);

/** Название: правится на месте; пустое значение возвращает название со страницы (или домен). */
function TitleEditor({ title, onSave }: { title: string; onSave: (title: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const editBtn = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);

  useEffect(() => {
    if (!editing && restoreFocus.current) {
      restoreFocus.current = false;
      editBtn.current?.focus();
    }
  }, [editing]);

  const close = () => {
    restoreFocus.current = true;
    setEditing(false);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (draft.trim() !== title.trim()) onSave(draft);
    close();
  };

  if (editing) {
    return (
      <form className="tool-title-form" onSubmit={submit}>
        <input
          className="input tool-title-input"
          value={draft}
          maxLength={300}
          aria-label="Название"
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              close();
            }
          }}
        />
        <button type="submit" className="btn btn-sm btn-primary">
          Сохранить
        </button>
        <button type="button" className="btn btn-sm" onClick={close}>
          Отмена
        </button>
      </form>
    );
  }
  return (
    <div className="tool-title-row">
      <h1 className="repo-name tool-title" title={title}>
        {title}
      </h1>
      <button
        ref={editBtn}
        type="button"
        className="btn btn-ghost btn-icon btn-sm"
        aria-label="Переименовать"
        title="Переименовать"
        onClick={() => {
          setDraft(title);
          setEditing(true);
        }}
      >
        <Pencil size={14} />
      </button>
    </div>
  );
}

/** Категория: список (стартовые, из каталога и своя) + «Своя…». Пусто — берётся предложенная AI. */
function CategoryBlock({ tool, known, onChange }: { tool: Tool; known: string[]; onChange: (category: string | null) => void }) {
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState('');
  const own = tool.user.category;
  const [pick, setPick] = useState(own ?? '');
  const suggested = tool.analysis.suggestedCategory;
  const select = useRef<HTMLSelectElement>(null);
  const restoreFocus = useRef(false);
  // Стрелки и End только листают список; сохраняется выбор мышью, Enter или уход фокуса.
  const viaKeys = useRef(false);

  useEffect(() => setPick(own ?? ''), [own]);
  useEffect(() => {
    if (!custom && restoreFocus.current) {
      restoreFocus.current = false;
      select.current?.focus();
    }
  }, [custom]);

  const seen = new Set<string>();
  const options = [...TOOL_CATEGORIES, ...known, ...(own ? [own] : [])].filter((c) => {
    const k = fold(c);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const commit = (v: string) => {
    if (v === CUSTOM) {
      setDraft('');
      setCustom(true);
    } else if (v !== (own ?? '')) onChange(v || null);
  };
  const closeCustom = () => {
    restoreFocus.current = true;
    setCustom(false);
  };

  if (custom) {
    return (
      <form
        className="category-custom"
        onSubmit={(e) => {
          e.preventDefault();
          onChange(draft.trim() || null);
          closeCustom();
        }}
      >
        <input
          className="input"
          value={draft}
          maxLength={100}
          placeholder="Своя категория"
          aria-label="Своя категория"
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') closeCustom();
          }}
        />
        <button type="submit" className="btn btn-sm btn-primary" disabled={!draft.trim()}>
          Сохранить
        </button>
        <button type="button" className="btn btn-sm" onClick={closeCustom}>
          Отмена
        </button>
      </form>
    );
  }
  return (
    <div className="field">
      <select
        ref={select}
        className="select"
        aria-label="Категория"
        value={pick}
        onPointerDown={() => {
          viaKeys.current = false;
        }}
        onKeyDown={(e) => {
          viaKeys.current = true;
          if (e.key === 'Enter') {
            e.preventDefault();
            commit(pick);
          }
        }}
        onChange={(e) => {
          setPick(e.target.value);
          if (!viaKeys.current) commit(e.target.value);
        }}
        onBlur={() => {
          viaKeys.current = false;
          if (pick === CUSTOM) setPick(own ?? '');
          else commit(pick);
        }}
      >
        <option value="">{suggested ? `Предложена AI: ${suggested}` : 'Не выбрана'}</option>
        {options.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
        <option value={CUSTOM}>Своя…</option>
      </select>
      {!own && suggested && <span className="field-hint">Категория предложена AI — выберите свою, чтобы закрепить.</span>}
    </div>
  );
}

/** Своя картинка: адрес скачивает сервер, ошибка загрузчика показывается под полем. */
function ImageBlock({ tool, online, onSet }: { tool: Tool; online: boolean; onSet: (imageUrl: string | null) => Promise<unknown> }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const path = tool.user.imagePath ?? tool.source.imagePath;
  // Версия в адресе сбрасывает кэш при замене файла: для своей — время правки, для картинки страницы — время загрузки.
  const version = tool.user.imagePath ? tool.user.updatedAt : tool.source.fetchedAt;
  const letter = (Array.from(toolTitle(tool).trim())[0] ?? '?').toUpperCase();

  const src = path ? `/${path}?v=${encodeURIComponent(version ?? '')}` : null;
  // Сбой загрузки относится к конкретному адресу: новая картинка получает новую попытку.
  const failed = src === null || failedSrc === src;

  const run = async (imageUrl: string | null) => {
    setError(null);
    setBusy(true);
    try {
      await onSet(imageUrl);
      setUrl('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="field">
      <div className={`tool-preview${failed ? ' tool-thumb-fallback' : ''}`}>
        {!failed ? <img src={src} alt="" onError={() => setFailedSrc(src)} /> : <span aria-hidden="true">{letter}</span>}
      </div>
      <form
        className="topics-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) void run(url.trim());
        }}
      >
        <input
          className="input"
          type="url"
          inputMode="url"
          maxLength={2000}
          placeholder="Адрес картинки: https://…"
          aria-label="Адрес картинки"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={busy || !online}
        />
        <button type="submit" className="btn btn-sm" disabled={busy || !online || !url.trim()} title={online ? undefined : 'Нет сети'}>
          {busy ? <span className="spinner" /> : null}
          Загрузить
        </button>
      </form>
      {error && (
        <div className="field-error" role="alert">
          {error}
        </div>
      )}
      {tool.user.imagePath && (
        <button type="button" className="btn btn-ghost btn-sm tool-image-remove" onClick={() => void run(null)} disabled={busy}>
          <ImageOff size={14} /> Убрать свою картинку
        </button>
      )}
    </div>
  );
}

export function ToolPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const online = useOnline();
  const toolQuery = useTool(id);
  const settings = useSettings();
  const facets = useToolFacets();
  const patch = usePatchTool();
  const refresh = useRefreshTool();
  const analyze = useAnalyzeTool();
  const setImage = useSetToolImage();
  const remove = useDeleteTool();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const prevAnalysis = useRef<string | null>(null);

  const tool = toolQuery.data;
  const status = tool?.analysis.status;

  useEffect(() => {
    setAmbient('idle', null);
  }, []);

  // Маскот знает, о каком инструменте можно спросить. Зависимости — примитивы: обновление записи
  // (заметка, звёздочка, фоновый анализ) не должно закрывать открытый чат; уход со страницы — закрывает.
  const llmReady = settings.data?.llmConfigured ?? false;
  const chatId = tool?.id;
  const chatTitle = tool ? toolTitle(tool) : undefined;
  const chatUrl = tool?.url;
  const chatDomain = tool?.domain;
  const chatHasText = Boolean(tool?.source.text);
  useEffect(() => {
    if (!chatId || !chatTitle || !chatUrl || !chatDomain) return;
    setChatTarget({ kind: 'tool', id: chatId, title: chatTitle, url: chatUrl, domain: chatDomain, hasText: chatHasText });
  }, [chatId, chatTitle, chatUrl, chatDomain, chatHasText]);
  useEffect(() => () => setChatTarget(null), []);

  // Один раз за сессию подсказываем, что маскоту можно задать вопрос.
  useEffect(() => {
    if (!chatId || !llmReady) return;
    try {
      if (sessionStorage.getItem(CHAT_INVITED_KEY) === '1') return;
      sessionStorage.setItem(CHAT_INVITED_KEY, '1');
    } catch {
      return;
    }
    const t = setTimeout(() => react('wink', phrases.toolChatInvite, 6000), 900);
    return () => clearTimeout(t);
  }, [chatId, llmReady]);

  // Реакция маскота на завершение фонового анализа
  useEffect(() => {
    if (!status) return;
    if (prevAnalysis.current === 'pending' && status === 'done') {
      release(KEY_ANALYSIS);
      react('party', phrases.analysisDone, 3500);
    } else if (prevAnalysis.current === 'pending' && status === 'failed') {
      release(KEY_ANALYSIS);
      react('dizzy', phrases.analysisFailed, 4500);
    } else if (status === 'pending') {
      hold('thinking', phrases.analyzing[0], KEY_ANALYSIS);
    }
    prevAnalysis.current = status;
    return () => {
      if (status === 'pending') release(KEY_ANALYSIS);
    };
  }, [status]);

  // Уход со страницы посреди долгой операции не оставляет маскота «думающим».
  useEffect(
    () => () => {
      release(KEY_REFRESH);
      release(KEY_IMAGE);
    },
    [],
  );

  if (toolQuery.isPending) {
    return (
      <main className="page">
        <div className="skeleton" style={{ height: 120, marginBottom: 20 }} />
        <div className="skeleton" style={{ height: 300 }} />
      </main>
    );
  }
  if (!tool) {
    const notFound = toolQuery.error instanceof ApiError && toolQuery.error.status === 404;
    return (
      <main className="page">
        {notFound || !toolQuery.error ? (
          <EmptyState mood="surprised" title="Инструмент не найден" text="Возможно, он был удалён из каталога.">
            <Link to="/tools" className="btn">
              К каталогу
            </Link>
          </EmptyState>
        ) : (
          <div className="error-box" role="alert">
            <span>Не удалось открыть карточку: {errorMessage(toolQuery.error)}</span>
            <button type="button" className="btn btn-sm" onClick={() => void toolQuery.refetch()}>
              Повторить
            </button>
          </div>
        )}
      </main>
    );
  }

  const title = toolTitle(tool);
  const letter = (Array.from(title.trim())[0] ?? '?').toUpperCase();
  const llmConfigured = settings.data?.llmConfigured ?? false;
  const category = toolCategory(tool);

  const save = (p: ToolPatch) => patch.mutate({ id: tool.id, patch: p }, { onError: (e) => toast('error', errorMessage(e)) });
  const saveField = (field: keyof ToolOverrides, value: FieldValue) => save({ overrides: { [field]: value } as ToolPatch['overrides'] });
  const resetField = (field: keyof ToolOverrides) => save({ overrides: { [field]: null } as ToolPatch['overrides'] });

  const setFavorite = () => {
    const next = !tool.user.favorite;
    patch.mutate(
      { id: tool.id, patch: { favorite: next } },
      { onSuccess: () => react(next ? 'love' : 'shy', next ? phrases.favoriteOn : phrases.favoriteOff, 2500), onError: (e) => toast('error', errorMessage(e)) },
    );
  };
  const confirmDraft = () =>
    patch.mutate({ id: tool.id, patch: { confirmed: true } }, { onSuccess: () => react('happy', phrases.toolConfirmed, 3000), onError: (e) => toast('error', errorMessage(e)) });
  const saveNotes = (notes: string) => patch.mutateAsync({ id: tool.id, patch: { notes } }).then(() => react('shy', phrases.noteSaved, 2200));

  const doRefresh = () => {
    hold('thinking', phrases.toolReading, KEY_REFRESH);
    refresh.mutate(tool.id, {
      onSuccess: () => toast('success', 'Страница обновлена'),
      onError: (e) =>
        toast(
          'error',
          e instanceof ApiError && e.code === 'url_forbidden'
            ? 'GitLib не открывает этот адрес (внутренняя сеть или сам компьютер). Карточка осталась как была — её можно вести вручную.'
            : errorMessage(e),
        ),
      onSettled: () => release(KEY_REFRESH),
    });
  };

  const doAnalyze = () => analyze.mutate(tool.id, { onError: (e) => toast('error', errorMessage(e)) });

  const changeImage = async (imageUrl: string | null) => {
    hold('thinking', undefined, KEY_IMAGE);
    try {
      await setImage.mutateAsync({ id: tool.id, imageUrl });
    } finally {
      release(KEY_IMAGE);
    }
  };

  const doDelete = () =>
    remove.mutate(tool.id, {
      onSuccess: () => {
        toast('info', `«${title}» удалён из каталога`);
        react('sad', phrases.deleted, 3500);
        navigate('/tools');
      },
      onError: (e) => {
        setConfirmDelete(false);
        toast('error', errorMessage(e));
      },
    });

  const { source } = tool;
  const siteDescription = toolDescription(tool);
  // Название часто и есть домен — второй раз его не повторяем.
  const showDomain = title.trim().toLowerCase() !== tool.domain.toLowerCase();

  return (
    <main className="page tool-page">
      <Link to="/tools" className="back-link">
        <ArrowLeft size={14} /> Инструменты
      </Link>

      {toolQuery.isError && (
        <div className="error-box tool-notice" role="alert">
          <span>{toolQuery.error instanceof ApiError && toolQuery.error.status > 0 && toolQuery.error.status < 500 ? `Не удалось обновить карточку: ${errorMessage(toolQuery.error)}` : 'Сервер GitLib не отвечает — изменения на экране не потеряны.'}</span>
          <button type="button" className="btn btn-sm" onClick={() => void toolQuery.refetch()}>
            Повторить
          </button>
        </div>
      )}

      <header className="repo-head tool-head">
        <Avatar avatarPath={source.iconPath && `${source.iconPath}?v=${encodeURIComponent(source.fetchedAt ?? '')}`} name={letter} size="lg" />
        <div className="repo-head-main">
          {(showDomain || category || source.status === 'failed' || !tool.user.confirmed) && (
            <div className="repo-owner">
              {showDomain && <span className="tool-head-domain">{tool.domain}</span>}
                            {category && (
                <span className={`tool-head-category${showDomain ? ' after-domain' : ''}`} title={category}>
                  {category}
                </span>
              )}
              {source.status === 'failed' && <span className="tag tag-warn">без страницы</span>}
              {!tool.user.confirmed && <span className="tag tag-draft">черновик</span>}
            </div>
          )}
          <TitleEditor title={title} onSave={(t) => save({ title: t })} />
          <EditableField
            label="Описание"
            kind="text"
            aiName="страницы"
            value={siteDescription}
            aiValue={toolSourceDescription(tool)}
            overridden={isDescriptionOverridden(tool)}
            onSave={(v) => save({ description: v as string })}
            onReset={() => save({ description: null })}
          />
        </div>
        <div className="repo-actions">
          <button type="button" className={`btn ${tool.user.favorite ? 'is-on' : ''}`} onClick={setFavorite} aria-pressed={tool.user.favorite}>
            <Heart size={16} fill={tool.user.favorite ? 'currentColor' : 'none'} />
            {tool.user.favorite ? 'В избранном' : 'В избранное'}
          </button>
          {isHttp(tool.url) && (
            <a className="btn" href={tool.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={16} /> Открыть сайт
            </a>
          )}
          <button type="button" className="btn" onClick={doRefresh} disabled={refresh.isPending || !online} title={online ? 'Заново загрузить страницу' : 'Нет сети'}>
            {refresh.isPending ? <span className="spinner" /> : <RefreshCw size={16} />}
            Обновить страницу
          </button>
          <button type="button" className="btn btn-ghost btn-icon btn-danger" onClick={() => setConfirmDelete(true)} title="Удалить из каталога" aria-label="Удалить из каталога">
            <Trash2 size={16} />
          </button>
        </div>
      </header>

      {!tool.user.confirmed && (
        <div className="notice tool-draft" role="status">
          <span>
            <strong>Черновик.</strong> Проверьте карточку и подтвердите.
          </span>
          <button type="button" className="btn btn-sm btn-primary" onClick={confirmDraft}>
            Подтвердить
          </button>
        </div>
      )}

      <div className="repo-layout">
        <div className="repo-main">
          <ToolAnalysisPanel
            tool={tool}
            llmConfigured={llmConfigured}
            online={online}
            pending={analyze.isPending}
            onAnalyze={doAnalyze}
            onSaveField={saveField}
            onResetField={resetField}
          />

          <section className="panel">
            <div className="panel-head">
              <h2>
                <Tags /> Теги
              </h2>
            </div>
            <ToolTagsEditor tool={tool} onChange={(tags) => save({ tags })} />
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>
                <NotebookPen /> Мои заметки
              </h2>
              <span className="label">Markdown · автосохранение</span>
            </div>
            <NotesEditor value={tool.user.notes} onSave={saveNotes} placeholder="Зачем мне этот инструмент, для какой задачи, что проверить, подводные камни… Поддерживается Markdown." />
            <p className="tool-notes-hint">Картинки в заметках инструмента не показываются.</p>
          </section>
        </div>

        <aside className="repo-aside">
          <section className="panel">
            <div className="panel-head">
              <h2>Категория</h2>
            </div>
            <CategoryBlock tool={tool} known={facets.data?.categories.map((c) => c.value) ?? []} onChange={(c) => save({ category: c })} />
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Картинка</h2>
            </div>
            <ImageBlock tool={tool} online={online} onSet={changeImage} />
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Страница</h2>
              <span className="label" title={formatDateTime(source.fetchedAt)}>
                {source.fetchedAt ? relativeDate(source.fetchedAt) : 'не загружалась'}
              </span>
            </div>
            <div className="facts">
              <div className="fact fact-wide">
                <div className="label">Состояние</div>
                <div className="fact-v tool-fact">{SOURCE_STATUS[source.status]}</div>
              </div>
              {source.textChars > 0 && (
                <div className="fact">
                  <div className="label">Текст</div>
                  <div className="fact-v">{fullNumber(source.textChars)} зн.</div>
                </div>
              )}
              {source.fetchedAt && (
                <div className="fact">
                  <div className="label">Загружена</div>
                  <div className="fact-v tool-nowrap">{formatDate(source.fetchedAt)}</div>
                </div>
              )}
              {source.status === 'failed' && source.error && (
                <div className="fact fact-wide">
                  <div className="label">Ошибка</div>
                  <div className="tool-fact-error">{source.error}</div>
                </div>
              )}
              <div className="fact fact-wide">
                <div className="label">Адрес</div>
                <div className="links-list tool-links" style={{ marginTop: 6 }}>
                  <span className="tool-url" title={tool.url}>
                    {tool.url}
                  </span>
                  {source.finalUrl && source.finalUrl !== tool.url && (
                    <span className="tool-url" title={source.finalUrl}>
                      → {source.finalUrl}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </section>

          <div className="muted" style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, padding: '0 6px' }}>
            Добавлен {formatDate(tool.user.addedAt)} · правки {relativeDate(tool.user.updatedAt)}
          </div>
        </aside>
      </div>

      {confirmDelete && (
        <Confirm
          title={`Удалить «${title}»?`}
          text="Карточка, заметки, теги и ваши правки будут удалены из каталога. Восстановить можно только из экспорта."
          confirmLabel="Удалить"
          danger
          busy={remove.isPending}
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </main>
  );
}
