import { useEffect, useState } from 'react';
import { LayoutGrid, Rows3, X } from 'lucide-react';
import type { RepoSummary, SortKey } from '../../shared/types.js';
import { STATUS_LABELS } from '../../shared/types.js';
import { useCollections, useFacets, usePatchRepo, useRepos } from '../api/hooks';
import { useLibraryQuery } from '../lib/libraryQuery';
import { plural } from '../lib/format';
import { toast, errorMessage } from '../lib/toast';
import { phrases, react, setAmbient } from '../mascot/store';
import { AddRepoForm } from '../components/AddRepoForm';
import { FilterRail } from '../components/FilterRail';
import { RepoCard } from '../components/RepoCard';
import { EmptyState } from '../components/EmptyState';

const SORT_LABELS: Record<SortKey, string> = {
  added: 'по дате добавления',
  updated: 'по моим правкам',
  stars: 'по звёздам',
  name: 'по имени',
  pushed: 'по активности на GitHub',
};

function useViewMode() {
  const [mode, setMode] = useState<'grid' | 'list'>(() => {
    try {
      return localStorage.getItem('gitlib.view') === 'list' ? 'list' : 'grid';
    } catch {
      return 'grid';
    }
  });
  const set = (m: 'grid' | 'list') => {
    setMode(m);
    try {
      localStorage.setItem('gitlib.view', m);
    } catch {
      /* ignore */
    }
  };
  return [mode, set] as const;
}

export function LibraryPage() {
  const { query, update, toggleIn, clear, filtered } = useLibraryQuery();
  const repos = useRepos(query);
  const facets = useFacets();
  const collections = useCollections();
  const patch = usePatchRepo();
  const [view, setView] = useViewMode();

  const total = facets.data?.total ?? 0;
  const items = repos.data?.items ?? [];
  const libraryEmpty = facets.isSuccess && total === 0;
  const nothingFound = repos.isSuccess && items.length === 0 && !libraryEmpty;

  useEffect(() => {
    if (libraryEmpty) setAmbient('sleep', phrases.empty);
    else if (nothingFound) react('sad', phrases.nothingFound, 3000);
    else setAmbient('idle', null);
  }, [libraryEmpty, nothingFound]);

  const toggleFavorite = (repo: RepoSummary) => {
    const next = !repo.user.favorite;
    patch.mutate(
      { id: repo.id, patch: { favorite: next } },
      {
        onSuccess: () => react(next ? 'love' : 'shy', next ? phrases.favoriteOn : phrases.favoriteOff, 2500),
        onError: (e) => toast('error', errorMessage(e)),
      },
    );
  };

  const activeCollection = collections.data?.find((c) => c.id === query.collectionId);
  const sheetDate = new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

  if (libraryEmpty) {
    return (
      <main className="page">
        <EmptyState
          hero
          mood="sleep"
          title="Библиотека пока пуста"
          text="Вставьте ссылку на GitHub-репозиторий. GitLib загрузит описание и README, составит сводку на русском и положит проект на полку."
        >
          <AddRepoForm autoFocus />
        </EmptyState>
      </main>
    );
  }

  return (
    <div className="shell">
      <FilterRail facets={facets.data} collections={collections.data} />
      <main>
        <div className="lib-head">
          <div>
            <div className="sheet-label">
              <b>Лист 01</b>
              <span>·</span>
              <span>{activeCollection ? 'коллекция' : filtered ? 'выборка' : 'каталог'}</span>
              <span>·</span>
              <span>{sheetDate}</span>
            </div>
            <h1 className="display lib-title">{activeCollection ? activeCollection.name : filtered ? 'Подборка' : 'Библиотека'}</h1>
            <div className="lib-sub">
              {repos.isSuccess && (
                <span>
                  {filtered ? `${plural(items.length, ['проект', 'проекта', 'проектов'])} из ${total}` : plural(total, ['проект', 'проекта', 'проектов'])}
                </span>
              )}
              {facets.data && facets.data.statuses.using > 0 && !filtered && <span>· {facets.data.statuses.using} в работе</span>}
              {activeCollection?.description && <span>· {activeCollection.description}</span>}
            </div>
          </div>
          <div className="lib-tools">
            <label className="visually-hidden" htmlFor="sort">
              Сортировка
            </label>
            <select id="sort" className="select" style={{ width: 'auto', minHeight: 36 }} value={query.sort ?? 'added'} onChange={(e) => update({ sort: e.target.value as SortKey })}>
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABELS[k]}
                </option>
              ))}
            </select>
            <div className="view-toggle" role="group" aria-label="Вид">
              <button type="button" className={view === 'grid' ? 'is-active' : ''} onClick={() => setView('grid')} title="Карточки">
                <LayoutGrid />
              </button>
              <button type="button" className={view === 'list' ? 'is-active' : ''} onClick={() => setView('list')} title="Список">
                <Rows3 />
              </button>
            </div>
          </div>
        </div>

        <AddRepoForm compact />

        {filtered && (
          <div className="active-filters">
            {query.q && (
              <button type="button" className="chip is-active" onClick={() => update({ q: '' })}>
                <span>«{query.q}»</span>
                <X size={12} className="chip-x" />
              </button>
            )}
            {query.statuses?.map((s) => (
              <button key={s} type="button" className="chip is-active" onClick={() => toggleIn('statuses', s)}>
                <span>{STATUS_LABELS[s]}</span>
                <X size={12} className="chip-x" />
              </button>
            ))}
            {query.favorite && (
              <button type="button" className="chip is-active" onClick={() => update({ favorite: false })}>
                <span>избранное</span>
                <X size={12} className="chip-x" />
              </button>
            )}
            {query.noAnalysis && (
              <button type="button" className="chip is-active" onClick={() => update({ noAnalysis: false })}>
                <span>без AI-анализа</span>
                <X size={12} className="chip-x" />
              </button>
            )}
            {query.languages?.map((l) => (
              <button key={l} type="button" className="chip is-active" onClick={() => toggleIn('languages', l)}>
                <span>{l}</span>
                <X size={12} className="chip-x" />
              </button>
            ))}
            {query.topics?.map((t) => (
              <button key={t} type="button" className="chip is-active" onClick={() => toggleIn('topics', t)}>
                <span>#{t}</span>
                <X size={12} className="chip-x" />
              </button>
            ))}
            {activeCollection && (
              <button type="button" className="chip is-active" onClick={() => update({ collectionId: '' })}>
                <span>коллекция: {activeCollection.name}</span>
                <X size={12} className="chip-x" />
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={clear}>
              Сбросить всё
            </button>
          </div>
        )}

        {repos.isError && (
          <div className="error-box" role="alert">
            <span>Не удалось загрузить библиотеку: {errorMessage(repos.error)}</span>
            <button type="button" className="btn btn-sm" onClick={() => void repos.refetch()}>
              Повторить
            </button>
          </div>
        )}

        {repos.isPending && (
          <div className={`grid ${view === 'list' ? 'is-list' : ''}`} aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton" />
            ))}
          </div>
        )}

        {nothingFound && (
          <EmptyState mood="sad" title="Ничего не нашлось" text="Попробуйте другое слово или снимите часть фильтров.">
            <button type="button" className="btn" onClick={clear}>
              Сбросить фильтры
            </button>
          </EmptyState>
        )}

        {items.length > 0 && (
          <div className={`grid ${view === 'list' ? 'is-list' : ''}`}>
            {items.map((r, i) => (
              <RepoCard key={r.id} repo={r} index={i} activeTopics={query.topics ?? []} onToggleFavorite={toggleFavorite} onTopicClick={(t) => toggleIn('topics', t)} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
