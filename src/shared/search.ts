import type { Facets, LibraryQuery, RepoStatus, RepoSummary, SortKey, Repo } from './types.js';
import { REPO_STATUSES } from './types.js';

type Searchable = Pick<Repo, 'fullName' | 'owner' | 'name' | 'user' | 'analysis'> & {
  github: Pick<Repo['github'], 'description' | 'language' | 'topics'>;
};

/** Регистронезависимая нормализация строки, корректная для кириллицы и буквы ё. */
export function fold(s: string | null | undefined): string {
  return (s ?? '').normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}

export function tokenize(q: string): string[] {
  return fold(q)
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Все темы записи: GitHub topics + предложения AI + личные темы. */
export function allTopics(repo: Searchable): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of [...repo.user.topics, ...repo.github.topics, ...repo.analysis.suggestedTopics]) {
    const k = fold(t);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function haystack(repo: Searchable): string {
  return fold(
    [
      repo.fullName,
      repo.github.description,
      repo.github.language,
      allTopics(repo).join(' '),
      repo.analysis.summary,
      repo.analysis.useCases.join(' '),
      repo.user.notes,
    ]
      .filter(Boolean)
      .join('\n'),
  );
}

export function matchesQuery(repo: Searchable, q: string | undefined): boolean {
  const tokens = tokenize(q ?? '');
  if (tokens.length === 0) return true;
  const text = haystack(repo);
  return tokens.every((t) => text.includes(t));
}

function foldSet(values: string[] | undefined): Set<string> {
  return new Set((values ?? []).map(fold).filter(Boolean));
}

export function matchesFilters<T extends Searchable & { id: string }>(
  repo: T,
  query: LibraryQuery,
  collectionRepoIds?: Set<string>,
): boolean {
  if (!matchesQuery(repo, query.q)) return false;
  const topics = foldSet(query.topics);
  if (topics.size > 0) {
    const own = new Set(allTopics(repo).map(fold));
    for (const t of topics) if (!own.has(t)) return false;
  }
  const languages = foldSet(query.languages);
  if (languages.size > 0) {
    const lang = repo.github.language ? fold(repo.github.language) : '';
    if (!languages.has(lang)) return false;
  }
  if (query.statuses && query.statuses.length > 0 && !query.statuses.includes(repo.user.status)) return false;
  if (query.favorite && !repo.user.favorite) return false;
  if (query.noAnalysis && repo.analysis.status === 'done') return false;
  if (query.collectionId !== undefined && query.collectionId !== '') {
    if (!collectionRepoIds || !collectionRepoIds.has(repo.id)) return false;
  }
  return true;
}

const collator = new Intl.Collator(['ru', 'en'], { sensitivity: 'base', numeric: true });

export function sortRepos<T extends RepoSummary | Repo>(repos: T[], sort: SortKey = 'added'): T[] {
  const arr = [...repos];
  switch (sort) {
    case 'name':
      arr.sort((a, b) => collator.compare(a.fullName, b.fullName));
      break;
    case 'stars':
      arr.sort((a, b) => b.github.stars - a.github.stars || collator.compare(a.fullName, b.fullName));
      break;
    case 'pushed':
      arr.sort((a, b) => (b.github.pushedAt ?? '').localeCompare(a.github.pushedAt ?? ''));
      break;
    case 'updated':
      arr.sort((a, b) => b.user.updatedAt.localeCompare(a.user.updatedAt));
      break;
    case 'added':
    default:
      arr.sort((a, b) => b.user.addedAt.localeCompare(a.user.addedAt));
  }
  return arr;
}

export function searchRepos<T extends RepoSummary | Repo>(
  repos: T[],
  query: LibraryQuery,
  collectionRepoIds?: Set<string>,
): T[] {
  return sortRepos(
    repos.filter((r) => matchesFilters(r, query, collectionRepoIds)),
    query.sort,
  );
}

export function computeFacets(repos: Array<RepoSummary | Repo>): Facets {
  const topics = new Map<string, number>();
  const languages = new Map<string, number>();
  const statuses = Object.fromEntries(REPO_STATUSES.map((s) => [s, 0])) as Record<RepoStatus, number>;
  let favorites = 0;
  let noAnalysis = 0;
  for (const r of repos) {
    for (const t of allTopics(r)) topics.set(t, (topics.get(t) ?? 0) + 1);
    if (r.github.language) languages.set(r.github.language, (languages.get(r.github.language) ?? 0) + 1);
    statuses[r.user.status] += 1;
    if (r.user.favorite) favorites += 1;
    if (r.analysis.status !== 'done') noAnalysis += 1;
  }
  const toSorted = (m: Map<string, number>) =>
    [...m.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || collator.compare(a.value, b.value));
  return { topics: toSorted(topics), languages: toSorted(languages), statuses, favorites, noAnalysis, total: repos.length };
}
