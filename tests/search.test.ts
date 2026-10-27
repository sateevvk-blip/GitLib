import { describe, expect, it } from 'vitest';
import { computeFacets, fold, searchRepos } from '../src/shared/search.js';
import { makeRepo } from './helpers.js';

const repos = [
  makeRepo('vercel/next.js', {
    github: { ...makeRepo().github, description: 'The React Framework', language: 'JavaScript', topics: ['react', 'ssr'] },
    analysis: {
      status: 'done',
      summary: 'Фреймворк для серверного рендеринга React-приложений.',
      useCases: ['Сайты с SEO', 'Маркетинговые лендинги'],
      suggestedTopics: ['frontend'],
      model: 'm',
      generatedAt: '2026-01-05T00:00:00.000Z',
      error: null,
    },
    user: { notes: 'Пробовал для Блога', topics: ['Веб'], status: 'using', favorite: true, addedAt: '2026-01-03T00:00:00.000Z', updatedAt: '2026-01-03T00:00:00.000Z' },
  }),
  makeRepo('BurntSushi/ripgrep', {
    github: { ...makeRepo().github, description: 'recursively searches directories for a regex pattern', language: 'Rust', topics: ['cli', 'search'] },
    user: { notes: 'Ёлка — проверка буквы ё', topics: [], status: 'try', favorite: false, addedAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' },
  }),
  makeRepo('python/cpython', {
    github: { ...makeRepo().github, description: 'The Python programming language', language: 'C', topics: [] },
    user: { notes: '', topics: [], status: 'inbox', favorite: false, addedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  }),
];

describe('fold', () => {
  it('приводит кириллицу и латиницу к нижнему регистру, ё → е', () => {
    expect(fold('ПрИвЕт Ёж HeLLo')).toBe('привет еж hello');
  });
});

describe('searchRepos', () => {
  it('ищет без учёта регистра по латинице', () => {
    expect(searchRepos(repos, { q: 'RIPGREP' }).map((r) => r.fullName)).toEqual(['BurntSushi/ripgrep']);
  });

  it('ищет без учёта регистра по кириллице в AI-сводке', () => {
    expect(searchRepos(repos, { q: 'СЕРВЕРНОГО' }).map((r) => r.fullName)).toEqual(['vercel/next.js']);
  });

  it('ищет по заметкам пользователя и личным темам с кириллицей', () => {
    expect(searchRepos(repos, { q: 'блога' }).map((r) => r.fullName)).toEqual(['vercel/next.js']);
    expect(searchRepos(repos, { q: 'веб' }).map((r) => r.fullName)).toEqual(['vercel/next.js']);
  });

  it('не различает е и ё', () => {
    expect(searchRepos(repos, { q: 'елка' }).map((r) => r.fullName)).toEqual(['BurntSushi/ripgrep']);
  });

  it('несколько слов — все должны встретиться (И)', () => {
    expect(searchRepos(repos, { q: 'react сайты' }).map((r) => r.fullName)).toEqual(['vercel/next.js']);
    expect(searchRepos(repos, { q: 'react rust' })).toHaveLength(0);
  });

  it('комбинирует фильтры: темы, языки, статусы, избранное', () => {
    expect(searchRepos(repos, { topics: ['CLI'] }).map((r) => r.fullName)).toEqual(['BurntSushi/ripgrep']);
    expect(searchRepos(repos, { languages: ['rust', 'c'] }).map((r) => r.fullName).sort()).toEqual(['BurntSushi/ripgrep', 'python/cpython']);
    expect(searchRepos(repos, { statuses: ['using'] }).map((r) => r.fullName)).toEqual(['vercel/next.js']);
    expect(searchRepos(repos, { favorite: true }).map((r) => r.fullName)).toEqual(['vercel/next.js']);
    expect(searchRepos(repos, { favorite: true, languages: ['Rust'] })).toHaveLength(0);
    expect(searchRepos(repos, { topics: ['frontend'], statuses: ['using'], q: 'next' }).map((r) => r.fullName)).toEqual(['vercel/next.js']);
  });

  it('фильтр «без AI-анализа»', () => {
    expect(searchRepos(repos, { noAnalysis: true }).map((r) => r.fullName).sort()).toEqual(['BurntSushi/ripgrep', 'python/cpython']);
  });

  it('сортирует по имени без учёта регистра и по дате добавления', () => {
    expect(searchRepos(repos, { sort: 'name' }).map((r) => r.fullName)).toEqual(['BurntSushi/ripgrep', 'python/cpython', 'vercel/next.js']);
    expect(searchRepos(repos, { sort: 'added' }).map((r) => r.fullName)).toEqual(['vercel/next.js', 'BurntSushi/ripgrep', 'python/cpython']);
  });

  it('фильтр по коллекции', () => {
    const ids = new Set([repos[2]!.id]);
    expect(searchRepos(repos, { collectionId: 'c1' }, ids).map((r) => r.fullName)).toEqual(['python/cpython']);
  });
});

describe('computeFacets', () => {
  it('считает темы из всех источников, языки и статусы', () => {
    const f = computeFacets(repos);
    expect(f.total).toBe(3);
    expect(f.favorites).toBe(1);
    expect(f.noAnalysis).toBe(2);
    expect(f.statuses).toEqual({ inbox: 1, try: 1, using: 1, parked: 0 });
    expect(f.languages.map((l) => l.value)).toEqual(['C', 'JavaScript', 'Rust']);
    const topicNames = f.topics.map((t) => t.value);
    expect(topicNames).toContain('react');
    expect(topicNames).toContain('frontend');
    expect(topicNames).toContain('Веб');
  });
});
