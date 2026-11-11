import { describe, expect, it } from 'vitest';
import { fold } from '../src/shared/search.js';
import { applyToolQueryPatch, CLEAR_TOOL_QUERY, isToolFiltered, parseToolQuery, withoutValue } from '../src/client/lib/toolsQuery.js';
import { toolQueryToParams } from '../src/client/api/client.js';

describe('toolsQuery: состояние фильтров каталога в URL', () => {
  it('пустой адрес — пустой запрос, сортировка «сначала новые»', () => {
    const q = parseToolQuery(new URLSearchParams());
    expect(q).toMatchObject({ q: '', categories: [], tags: [], favorite: false, drafts: false, noAnalysis: false, sort: 'added' });
    expect(isToolFiltered(q)).toBe(false);
  });

  it('читает все параметры, кириллицу и пробелы в списках', () => {
    const q = parseToolQuery(new URLSearchParams('q=дизайн&categories=Дизайн&categories=3D и графика&tags=ui&tags=%20веб&favorite=1&drafts=1&noAnalysis=1&sort=name'));
    expect(q.q).toBe('дизайн');
    expect(q.categories).toEqual(['Дизайн', '3D и графика']);
    expect(q.tags).toEqual(['ui', 'веб']);
    expect(q).toMatchObject({ favorite: true, drafts: true, noAnalysis: true, sort: 'name' });
    expect(isToolFiltered(q)).toBe(true);
  });

  it('неизвестная сортировка и чужие значения флагов игнорируются', () => {
    const q = parseToolQuery(new URLSearchParams('sort=stars&favorite=true'));
    expect(q.sort).toBe('added');
    expect(q.favorite).toBe(false);
  });

  it('патч меняет только свои параметры и убирает пустые', () => {
    const prev = new URLSearchParams('q=a&tags=x&task=подобрать&sort=name');
    const next = applyToolQueryPatch(prev, { q: '  ', tags: [], favorite: true, sort: 'added' });
    expect(next.get('q')).toBeNull();
    expect(next.get('tags')).toBeNull();
    expect(next.get('sort')).toBeNull();
    expect(next.get('favorite')).toBe('1');
    expect(next.get('task')).toBe('подобрать'); // запрос подбора — не часть фильтров
  });

  it('запрос к API повторяет разобранный адрес', () => {
    const q = parseToolQuery(new URLSearchParams('q=x&categories=Дизайн&tags=ui&tags=web&drafts=1&sort=updated'));
    const params = toolQueryToParams(q);
    expect(params.getAll('categories')).toEqual(['Дизайн']);
    expect(params.getAll('tags')).toEqual(['ui', 'web']);
    expect(params.get('drafts')).toBe('1');
    expect(params.get('sort')).toBe('updated');
    expect(params.has('favorite')).toBe(false);
  });
});

describe('toolsQuery: сброс и сравнение тегов', () => {
  it('сброс фильтров не стирает task', () => {
    const prev = new URLSearchParams('q=a&categories=Дизайн&tags=x&favorite=1&drafts=1&noAnalysis=1&sort=name&task=подобрать');
    const next = applyToolQueryPatch(prev, CLEAR_TOOL_QUERY);
    expect([...next.keys()]).toEqual(['task']);
  });

  it('е и ё считаются одним тегом', () => {
    expect(fold('Ёлка')).toBe(fold('елка'));
  });
});

describe('toolsQuery: значения с запятой', () => {
  it('категория и тег с запятой остаются одним значением и возвращаются в URL без разбиения', () => {
    const next = applyToolQueryPatch(new URLSearchParams(), { categories: ['Дизайн, прототипы'], tags: ['a,b', 'c'] });
    expect(next.getAll('categories')).toEqual(['Дизайн, прототипы']);
    const q = parseToolQuery(next);
    expect(q.categories).toEqual(['Дизайн, прототипы']);
    expect(q.tags).toEqual(['a,b', 'c']);
    // снятие одного значения не затрагивает остальные
    expect(parseToolQuery(applyToolQueryPatch(next, { tags: ['c'] })).tags).toEqual(['c']);
  });
});

describe('toolsQuery: удаление значения', () => {
  it('убирает по fold и не возвращает уже убранное', () => {
    expect(withoutValue(['Ёлка', 'b'], 'елка')).toEqual(['b']);
    expect(withoutValue(['b'], 'елка')).toEqual(['b']);
  });
});
