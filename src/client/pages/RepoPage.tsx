import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Bug,
  ExternalLink,
  GitFork,
  Globe,
  Heart,
  ListChecks,
  NotebookPen,
  RefreshCw,
  Scale,
  Sparkles,
  Star,
  Tags,
  Trash2,
} from 'lucide-react';
import type { Repo, RepoStatus } from '../../shared/types.js';
import { STATUS_LABELS } from '../../shared/types.js';
import { useAnalyzeRepo, useCollectionMutations, useCollections, useDeleteRepo, usePatchRepo, useRefreshRepo, useRepo, useSettings } from '../api/hooks';
import { Avatar } from '../components/Avatar';
import { StatusSelect } from '../components/StatusBadge';
import { Markdown } from '../components/Markdown';
import { TopicsEditor } from '../components/TopicsEditor';
import { NotesEditor } from '../components/NotesEditor';
import { Confirm } from '../components/Confirm';
import { EmptyState } from '../components/EmptyState';
import { compactNumber, formatDate, formatDateTime, fullNumber, languageColor, relativeDate } from '../lib/format';
import { toast, errorMessage } from '../lib/toast';
import { useOnline } from '../lib/online';
import { hold, phrases, react, release, setAmbient } from '../mascot/store';

export function RepoPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const online = useOnline();
  const repoQuery = useRepo(id);
  const settings = useSettings();
  const collections = useCollections();
  const patch = usePatchRepo();
  const refresh = useRefreshRepo();
  const analyze = useAnalyzeRepo();
  const remove = useDeleteRepo();
  const { setMembership, create } = useCollectionMutations();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newCollection, setNewCollection] = useState('');
  const prevAnalysis = useRef<string | null>(null);

  const repo = repoQuery.data;

  useEffect(() => {
    setAmbient('idle', null);
  }, []);

  // Реакция маскота на завершение фонового анализа
  useEffect(() => {
    if (!repo) return;
    const status = repo.analysis.status;
    if (prevAnalysis.current === 'pending' && status === 'done') {
      release();
      react('party', phrases.analysisDone, 3500);
    } else if (prevAnalysis.current === 'pending' && status === 'failed') {
      release();
      react('dizzy', phrases.analysisFailed, 4500);
    } else if (status === 'pending') {
      hold('thinking', phrases.analyzing[0]);
    }
    prevAnalysis.current = status;
    return () => {
      if (status === 'pending') release();
    };
  }, [repo]);

  if (repoQuery.isPending) {
    return (
      <main className="page">
        <div className="skeleton" style={{ height: 120, marginBottom: 20 }} />
        <div className="skeleton" style={{ height: 300 }} />
      </main>
    );
  }
  if (repoQuery.isError || !repo) {
    return (
      <main className="page">
        <EmptyState mood="surprised" title="Репозиторий не найден" text={repoQuery.error ? errorMessage(repoQuery.error) : 'Возможно, он был удалён из библиотеки.'}>
          <Link to="/" className="btn">
            В библиотеку
          </Link>
        </EmptyState>
      </main>
    );
  }

  const g = repo.github;
  const llmConfigured = settings.data?.llmConfigured ?? false;
  const busy = patch.isPending || refresh.isPending;

  const setStatus = (status: RepoStatus) =>
    patch.mutate({ id: repo.id, patch: { status } }, { onSuccess: () => react('wink', phrases.statusChanged(STATUS_LABELS[status]), 2500), onError: (e) => toast('error', errorMessage(e)) });
  const setFavorite = () => {
    const next = !repo.user.favorite;
    patch.mutate({ id: repo.id, patch: { favorite: next } }, { onSuccess: () => react(next ? 'love' : 'shy', next ? phrases.favoriteOn : phrases.favoriteOff, 2500), onError: (e) => toast('error', errorMessage(e)) });
  };
  const setTopics = (topics: string[]) => patch.mutate({ id: repo.id, patch: { topics } }, { onError: (e) => toast('error', errorMessage(e)) });
  const saveNotes = (notes: string) =>
    patch.mutateAsync({ id: repo.id, patch: { notes } }).then(() => react('shy', phrases.noteSaved, 2200));

  const doRefresh = () => {
    hold('thinking', 'Сверяюсь с GitHub…');
    refresh.mutate(repo.id, {
      onSuccess: () => {
        release();
        react('happy', phrases.refreshed, 3000);
        toast('success', 'Данные обновлены с GitHub');
      },
      onError: (e) => {
        release();
        react('sad', phrases.refreshFailed, 3000);
        toast('error', errorMessage(e));
      },
    });
  };

  const doAnalyze = () => {
    analyze.mutate(repo.id, {
      onSuccess: () => hold('thinking', phrases.analyzing[1]),
      onError: (e) => toast('error', errorMessage(e)),
    });
  };

  const doDelete = () => {
    remove.mutate(repo.id, {
      onSuccess: () => {
        toast('info', `${repo.fullName} удалён из библиотеки`);
        react('sad', phrases.deleted, 3500);
        navigate('/');
      },
      onError: (e) => {
        setConfirmDelete(false);
        toast('error', errorMessage(e));
      },
    });
  };

  const memberOf = new Set(collections.data?.filter((c) => c.repoIds.includes(repo.id)).map((c) => c.id) ?? []);

  const langTotal = Object.values(g.languages).reduce((a, b) => a + b, 0);
  const langs = Object.entries(g.languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <main className="page">
      <Link to="/" className="back-link">
        <ArrowLeft size={14} /> Библиотека
      </Link>

      <header className="repo-head">
        <Avatar avatarPath={repo.avatarPath} name={repo.owner} size="lg" />
        <div className="repo-head-main">
          <div className="repo-owner">
            <span>{repo.owner}</span>
            <span>·</span>
            <span>{g.ownerType === 'Organization' ? 'организация' : 'пользователь'}</span>
            {g.archived && (
              <span className="tag tag-warn">
                <AlertTriangle size={10} /> архив
              </span>
            )}
            {g.isFork && <span className="tag">форк</span>}
          </div>
          <h1 className="repo-name">{repo.name}</h1>
          {g.description && <p className="repo-desc">{g.description}</p>}
        </div>
        <div className="repo-actions">
          <button type="button" className={`btn ${repo.user.favorite ? 'is-on' : ''}`} onClick={setFavorite} disabled={patch.isPending} aria-pressed={repo.user.favorite}>
            <Heart size={16} fill={repo.user.favorite ? 'currentColor' : 'none'} />
            {repo.user.favorite ? 'В избранном' : 'В избранное'}
          </button>
          <a className="btn" href={g.htmlUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={16} /> GitHub
          </a>
          <button type="button" className="btn" onClick={doRefresh} disabled={busy || !online} title={online ? 'Заново получить данные с GitHub' : 'Нет сети'}>
            {refresh.isPending ? <span className="spinner" /> : <RefreshCw size={16} />}
            Обновить
          </button>
          <button type="button" className="btn btn-ghost btn-icon btn-danger" onClick={() => setConfirmDelete(true)} title="Удалить из библиотеки">
            <Trash2 size={16} />
          </button>
        </div>
      </header>

      <div className="repo-layout">
        <div className="repo-main">
          <AnalysisPanel repo={repo} llmConfigured={llmConfigured} online={online} pending={analyze.isPending} onAnalyze={doAnalyze} />

          <section className="panel">
            <div className="panel-head">
              <h2>
                <Tags /> Темы
              </h2>
            </div>
            <TopicsEditor repo={repo} onChange={setTopics} disabled={patch.isPending} />
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>
                <NotebookPen /> Мои заметки
              </h2>
              <span className="label">автосохранение</span>
            </div>
            <NotesEditor value={repo.user.notes} onSave={saveNotes} />
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>
                <BookOpen /> README
              </h2>
              <span className="label">снимок от {formatDateTime(g.fetchedAt)}</span>
            </div>
            {g.readme ? <Markdown markdown={g.readme} repoUrl={g.htmlUrl} branch={g.defaultBranch} /> : <p className="readme-empty">README в репозитории нет или его не удалось получить.</p>}
          </section>
        </div>

        <aside className="repo-aside">
          <section className="panel">
            <div className="panel-head">
              <h2>Статус</h2>
            </div>
            <StatusSelect value={repo.user.status} onChange={setStatus} disabled={patch.isPending} />
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>GitHub</h2>
              <span className="label" title={formatDateTime(g.fetchedAt)}>
                {relativeDate(g.fetchedAt)}
              </span>
            </div>
            <div className="facts">
              <div className="fact">
                <div className="label">Звёзды</div>
                <div className="fact-v" title={fullNumber(g.stars)}>
                  <Star /> {compactNumber(g.stars)}
                </div>
              </div>
              <div className="fact">
                <div className="label">Форки</div>
                <div className="fact-v">
                  <GitFork /> {compactNumber(g.forks)}
                </div>
              </div>
              <div className="fact">
                <div className="label">Issues</div>
                <div className="fact-v">
                  <Bug /> {compactNumber(g.openIssues)}
                </div>
              </div>
              <div className="fact">
                <div className="label">Лицензия</div>
                <div className="fact-v">
                  <Scale /> {g.license ?? '—'}
                </div>
              </div>
              <div className="fact">
                <div className="label">Последний push</div>
                <div className="fact-v" title={formatDate(g.pushedAt)}>
                  {relativeDate(g.pushedAt)}
                </div>
              </div>
              <div className="fact">
                <div className="label">Создан</div>
                <div className="fact-v">{formatDate(g.createdAt)}</div>
              </div>
              {langs.length > 0 && (
                <div className="fact fact-wide">
                  <div className="label">Языки</div>
                  <div className="lang-bar" aria-hidden="true">
                    {langs.map(([name, bytes]) => (
                      <i key={name} style={{ width: `${(bytes / langTotal) * 100}%`, background: languageColor(name) }} title={name} />
                    ))}
                  </div>
                  <div className="lang-legend">
                    {langs.map(([name, bytes]) => (
                      <span key={name}>
                        <i className="lang-dot" style={{ background: languageColor(name) }} />
                        {name} {Math.round((bytes / langTotal) * 100)}%
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="fact fact-wide">
                <div className="label">Ссылки</div>
                <div className="links-list" style={{ marginTop: 6 }}>
                  <a href={g.htmlUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink /> {g.htmlUrl.replace('https://', '')}
                  </a>
                  {g.homepage && (
                    <a href={g.homepage.startsWith('http') ? g.homepage : `https://${g.homepage}`} target="_blank" rel="noopener noreferrer">
                      <Globe /> {g.homepage.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Коллекции</h2>
              <Link to="/collections" className="label">
                управлять
              </Link>
            </div>
            {collections.data && collections.data.length > 0 ? (
              <div className="collection-list">
                {collections.data.map((c) => (
                  <label key={c.id}>
                    <input
                      type="checkbox"
                      checked={memberOf.has(c.id)}
                      disabled={setMembership.isPending}
                      onChange={(e) =>
                        setMembership.mutate(
                          { collectionId: c.id, repoId: repo.id, member: e.target.checked },
                          { onError: (err) => toast('error', errorMessage(err)) },
                        )
                      }
                    />
                    <span>{c.name}</span>
                    <span className="pill-count" style={{ marginLeft: 'auto' }}>
                      {c.repoIds.length}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="muted" style={{ margin: '0 0 10px', fontSize: 13 }}>
                Коллекций пока нет. Создайте первую — проект сразу попадёт в неё.
              </p>
            )}
            <form
              className="topics-add"
              style={{ marginTop: 10 }}
              onSubmit={(e) => {
                e.preventDefault();
                const name = newCollection.trim();
                if (!name) return;
                create.mutate(
                  { name },
                  {
                    onSuccess: (c) => {
                      setNewCollection('');
                      react('happy', phrases.collectionCreated(c.name), 3000);
                      setMembership.mutate({ collectionId: c.id, repoId: repo.id, member: true });
                    },
                    onError: (err) => toast('error', errorMessage(err)),
                  },
                );
              }}
            >
              <input className="input" placeholder="Новая коллекция…" value={newCollection} onChange={(e) => setNewCollection(e.target.value)} />
              <button type="submit" className="btn btn-sm" disabled={!newCollection.trim() || create.isPending}>
                Создать
              </button>
            </form>
          </section>

          <div className="muted" style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, padding: '0 6px' }}>
            Добавлен {formatDate(repo.user.addedAt)} · правки {relativeDate(repo.user.updatedAt)}
          </div>
        </aside>
      </div>

      {confirmDelete && (
        <Confirm
          title={`Удалить ${repo.fullName}?`}
          text="Запись, заметки и темы будут удалены из библиотеки. Восстановить можно только из экспорта."
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

interface AnalysisProps {
  repo: Repo;
  llmConfigured: boolean;
  online: boolean;
  pending: boolean;
  onAnalyze: () => void;
}

function AnalysisPanel({ repo, llmConfigured, online, pending, onAnalyze }: AnalysisProps) {
  const a = repo.analysis;
  const canRun = llmConfigured && online && !pending && a.status !== 'pending';
  const runButton = (label: string) => (
    <button type="button" className="btn btn-sm" onClick={onAnalyze} disabled={!canRun} title={!llmConfigured ? 'LLM не настроена' : !online ? 'Нет сети' : undefined}>
      {pending || a.status === 'pending' ? <span className="spinner" /> : <Sparkles size={14} />}
      {label}
    </button>
  );

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>
          <Sparkles /> AI-сводка
        </h2>
        {a.status === 'done' && runButton('Повторить анализ')}
      </div>

      {a.status === 'done' && (
        <>
          <div className="summary">
            {(a.summary ?? '')
              .split(/\n{2,}/)
              .filter(Boolean)
              .map((p, i) => (
                <p key={i}>{p}</p>
              ))}
          </div>
          {a.useCases.length > 0 && (
            <>
              <div className="panel-head" style={{ marginTop: 18 }}>
                <h2>
                  <ListChecks /> Когда пригодится
                </h2>
              </div>
              <ol className="usecases">
                {a.useCases.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ol>
            </>
          )}
          <div className="ai-meta">
            модель {a.model ?? '?'} · {formatDateTime(a.generatedAt)}
          </div>
        </>
      )}

      {a.status === 'pending' && (
        <div className="notice">
          <span className="spinner" />
          <span>Модель читает репозиторий и составляет сводку. Страница обновится сама.</span>
        </div>
      )}

      {a.status === 'failed' && (
        <div className="error-box">
          <AlertTriangle size={18} />
          <span>Анализ не удался: {a.error ?? 'неизвестная ошибка'}</span>
          {runButton('Повторить')}
        </div>
      )}

      {a.status === 'none' && (
        <div className="notice">
          <span>
            {llmConfigured ? 'AI-анализ для этого проекта ещё не выполнялся.' : (
              <>
                AI-анализ отсутствует: LLM не настроена. Библиотека работает на данных GitHub. <Link to="/settings">Настроить →</Link>
              </>
            )}
          </span>
          {llmConfigured && runButton('Запустить анализ')}
        </div>
      )}
    </section>
  );
}
