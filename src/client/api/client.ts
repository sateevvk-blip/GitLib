import type {
  Collection,
  ConnectivityStatus,
  DuplicateStrategy,
  Facets,
  ImportPreview,
  ImportResult,
  LibraryQuery,
  PublicSettings,
  Repo,
  RepoSummary,
  SettingsPatch,
  UserPatch,
} from '../../shared/types.js';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string = 'error',
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isOfflineError(e: unknown): boolean {
  return e instanceof ApiError && (e.code === 'offline' || e.status === 0);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError('Сервер GitLib недоступен. Запущен ли он?', 0, 'server_unreachable');
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const body = (data ?? {}) as { error?: string; code?: string } & Record<string, unknown>;
    const { error, code, ...extra } = body;
    throw new ApiError(error ?? `Ошибка ${res.status}`, res.status, code ?? 'error', extra);
  }
  return data as T;
}

export function queryToParams(q: LibraryQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (q.q) p.set('q', q.q);
  if (q.topics?.length) p.set('topics', q.topics.join(','));
  if (q.languages?.length) p.set('languages', q.languages.join(','));
  if (q.statuses?.length) p.set('statuses', q.statuses.join(','));
  if (q.favorite) p.set('favorite', '1');
  if (q.noAnalysis) p.set('noAnalysis', '1');
  if (q.collectionId) p.set('collection', q.collectionId);
  if (q.sort && q.sort !== 'added') p.set('sort', q.sort);
  return p;
}

export const api = {
  health: () => request<{ ok: boolean; version: string; dataDir: string; repos: number; pendingAnalyses: number }>('/api/health'),
  connectivity: () => request<ConnectivityStatus>('/api/status/connectivity'),

  listRepos: (q: LibraryQuery) => request<{ items: RepoSummary[]; total: number }>(`/api/repos?${queryToParams(q)}`),
  facets: () => request<Facets>('/api/facets'),
  getRepo: (id: string) => request<Repo>(`/api/repos/${encodeURIComponent(id)}`),
  addRepo: (input: string) => request<Repo>('/api/repos', { method: 'POST', body: JSON.stringify({ input }) }),
  patchRepo: (id: string, patch: UserPatch) =>
    request<Repo>(`/api/repos/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteRepo: (id: string) => request<void>(`/api/repos/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  refreshRepo: (id: string) => request<Repo>(`/api/repos/${encodeURIComponent(id)}/refresh`, { method: 'POST' }),
  analyzeRepo: (id: string) => request<Repo>(`/api/repos/${encodeURIComponent(id)}/analyze`, { method: 'POST' }),

  listCollections: () => request<Collection[]>('/api/collections'),
  createCollection: (name: string, description = '') =>
    request<Collection>('/api/collections', { method: 'POST', body: JSON.stringify({ name, description }) }),
  updateCollection: (id: string, patch: { name?: string; description?: string; repoIds?: string[] }) =>
    request<Collection>(`/api/collections/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteCollection: (id: string) => request<void>(`/api/collections/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  addToCollection: (collectionId: string, repoId: string) =>
    request<Collection>(`/api/collections/${encodeURIComponent(collectionId)}/repos`, { method: 'POST', body: JSON.stringify({ repoId }) }),
  removeFromCollection: (collectionId: string, repoId: string) =>
    request<Collection>(`/api/collections/${encodeURIComponent(collectionId)}/repos/${encodeURIComponent(repoId)}`, { method: 'DELETE' }),

  getSettings: () => request<PublicSettings>('/api/settings'),
  updateSettings: (patch: SettingsPatch) => request<PublicSettings>('/api/settings', { method: 'PUT', body: JSON.stringify(patch) }),
  testGithub: () => request<ConnectivityStatus['github']>('/api/settings/test/github', { method: 'POST' }),
  testLlm: () => request<ConnectivityStatus['llm']>('/api/settings/test/llm', { method: 'POST' }),

  importPreview: (data: unknown) => request<ImportPreview>('/api/import/preview', { method: 'POST', body: JSON.stringify(data) }),
  importApply: (data: unknown, strategy: DuplicateStrategy) =>
    request<ImportResult>(`/api/import?strategy=${strategy}`, { method: 'POST', body: JSON.stringify(data) }),
};
