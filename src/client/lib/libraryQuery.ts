import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { LibraryQuery, RepoStatus, SortKey } from '../../shared/types.js';
import { REPO_STATUSES } from '../../shared/types.js';

const SORTS: SortKey[] = ['added', 'updated', 'stars', 'name', 'pushed'];

function csv(v: string | null): string[] {
  return (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseLibraryQuery(params: URLSearchParams): LibraryQuery {
  const sortRaw = params.get('sort');
  return {
    q: params.get('q') ?? '',
    topics: csv(params.get('topics')),
    languages: csv(params.get('languages')),
    statuses: csv(params.get('statuses')).filter((s): s is RepoStatus => (REPO_STATUSES as readonly string[]).includes(s)),
    favorite: params.get('favorite') === '1',
    noAnalysis: params.get('noAnalysis') === '1',
    collectionId: params.get('collection') ?? undefined,
    sort: sortRaw && SORTS.includes(sortRaw as SortKey) ? (sortRaw as SortKey) : 'added',
  };
}

export function isFiltered(q: LibraryQuery): boolean {
  return Boolean(q.q || q.topics?.length || q.languages?.length || q.statuses?.length || q.favorite || q.noAnalysis || q.collectionId);
}

/** Состояние фильтров живёт в URL: можно вернуться назад и поделиться ссылкой. */
export function useLibraryQuery() {
  const [params, setParams] = useSearchParams();
  const query = useMemo(() => parseLibraryQuery(params), [params]);

  const update = useCallback(
    (patch: Partial<LibraryQuery>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const set = (key: string, value: string | undefined) => {
            if (value) next.set(key, value);
            else next.delete(key);
          };
          if (patch.q !== undefined) set('q', patch.q.trim() ? patch.q : undefined);
          if (patch.topics !== undefined) set('topics', patch.topics.join(',') || undefined);
          if (patch.languages !== undefined) set('languages', patch.languages.join(',') || undefined);
          if (patch.statuses !== undefined) set('statuses', patch.statuses.join(',') || undefined);
          if (patch.favorite !== undefined) set('favorite', patch.favorite ? '1' : undefined);
          if (patch.noAnalysis !== undefined) set('noAnalysis', patch.noAnalysis ? '1' : undefined);
          if (patch.collectionId !== undefined) set('collection', patch.collectionId || undefined);
          if (patch.sort !== undefined) set('sort', patch.sort === 'added' ? undefined : patch.sort);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const toggleIn = useCallback(
    (key: 'topics' | 'languages' | 'statuses', value: string) => {
      const current = (query[key] ?? []) as string[];
      const lower = value.toLocaleLowerCase();
      const exists = current.some((v) => v.toLocaleLowerCase() === lower);
      const next = exists ? current.filter((v) => v.toLocaleLowerCase() !== lower) : [...current, value];
      update({ [key]: next } as Partial<LibraryQuery>);
    },
    [query, update],
  );

  const clear = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams]);

  return { query, update, toggleIn, clear, filtered: isFiltered(query) };
}
