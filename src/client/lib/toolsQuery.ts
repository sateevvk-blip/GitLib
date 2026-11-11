import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ToolQuery, ToolSortKey } from '../../shared/types.js';
import { fold } from '../../shared/search.js';

export const TOOL_SORTS: ToolSortKey[] = ['added', 'name', 'updated'];

/** Списки лежат повторяющимися параметрами (?tags=a&tags=b): значение может содержать запятую. */
function list(params: URLSearchParams, key: string): string[] {
  return params.getAll(key).map((s) => s.trim()).filter(Boolean);
}

export function parseToolQuery(params: URLSearchParams): ToolQuery {
  const sortRaw = params.get('sort');
  return {
    q: params.get('q') ?? '',
    categories: list(params, 'categories'),
    tags: list(params, 'tags'),
    favorite: params.get('favorite') === '1',
    drafts: params.get('drafts') === '1',
    noAnalysis: params.get('noAnalysis') === '1',
    sort: sortRaw && TOOL_SORTS.includes(sortRaw as ToolSortKey) ? (sortRaw as ToolSortKey) : 'added',
  };
}

export function isToolFiltered(q: ToolQuery): boolean {
  return Boolean(q.q || q.categories?.length || q.tags?.length || q.favorite || q.drafts || q.noAnalysis);
}

/** Применяет частичное изменение к параметрам адреса; пустое значение убирает параметр. Параметры чужих разделов (task) не трогает. */
export function applyToolQueryPatch(prev: URLSearchParams, patch: Partial<ToolQuery>): URLSearchParams {
  const next = new URLSearchParams(prev);
  const set = (key: string, value: string | undefined) => {
    if (value) next.set(key, value);
    else next.delete(key);
  };
  if (patch.q !== undefined) set('q', patch.q.trim() ? patch.q : undefined);
  const setList = (key: string, values: string[]) => {
    next.delete(key);
    for (const v of values) next.append(key, v);
  };
  if (patch.categories !== undefined) setList('categories', patch.categories);
  if (patch.tags !== undefined) setList('tags', patch.tags);
  if (patch.favorite !== undefined) set('favorite', patch.favorite ? '1' : undefined);
  if (patch.drafts !== undefined) set('drafts', patch.drafts ? '1' : undefined);
  if (patch.noAnalysis !== undefined) set('noAnalysis', patch.noAnalysis ? '1' : undefined);
  if (patch.sort !== undefined) set('sort', patch.sort === 'added' ? undefined : patch.sort);
  return next;
}

/** Список без значения (сравнение через fold: е и ё равны). */
export function withoutValue(values: string[], value: string): string[] {
  const folded = fold(value);
  return values.filter((v) => fold(v) !== folded);
}

/** Сбрасывает только фильтры каталога; чужие параметры (task) остаются. */
export const CLEAR_TOOL_QUERY: Partial<ToolQuery> = { q: '', categories: [], tags: [], favorite: false, drafts: false, noAnalysis: false, sort: 'added' };

/** Состояние фильтров каталога инструментов живёт в URL — как у библиотеки. */
export function useToolsQuery() {
  const [params, setParams] = useSearchParams();
  const query = useMemo(() => parseToolQuery(params), [params]);

  // Читаем адрес в момент вызова, а не из замыкания: два быстрых изменения подряд не затирают друг друга.
  const current = () => new URLSearchParams(window.location.search);
  const update = useCallback(
    (patch: Partial<ToolQuery>) => setParams(applyToolQueryPatch(current(), patch), { replace: true }),
    [setParams],
  );

  const toggleIn = useCallback(
    (key: 'categories' | 'tags', value: string) => {
      const now = parseToolQuery(current())[key] ?? [];
      const folded = fold(value);
      const exists = now.some((v) => fold(v) === folded);
      update({ [key]: exists ? now.filter((v) => fold(v) !== folded) : [...now, value] });
    },
    [update],
  );

  // Крестик чипа убирает значение, а не переключает: повторный щелчок по уходящему чипу его не вернёт.
  const removeIn = useCallback(
    (key: 'categories' | 'tags', value: string) => update({ [key]: withoutValue(parseToolQuery(current())[key] ?? [], value) }),
    [update],
  );

  const clear = useCallback(() => setParams(applyToolQueryPatch(current(), CLEAR_TOOL_QUERY), { replace: true }), [setParams]);

  return { query, update, toggleIn, removeIn, clear, filtered: isToolFiltered(query) };
}
