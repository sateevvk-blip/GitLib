import type {
  ChatMessage,
  ChatReply,
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
  Tool,
  ToolFacets,
  ToolPatch,
  ToolQuery,
  ToolRecommendation,
  ToolSummary,
  UserPatch,
} from '../../shared/types.js';

import type { SkillsReport } from '../../shared/skills.js';

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

// Вкладка закрывается: запросы, начатые в этот момент (заметка, набранная в последнюю секунду), должны дойти.
// Модуль загружается раньше компонентов, поэтому флаг выставлен до их обработчиков pagehide.
let leaving = false;
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { leaving = true; });
  window.addEventListener('pageshow', () => { leaving = false; });
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      // shortcut: браузер даёт keepalive-запросам 64 КБ на всех, поэтому заметка длиннее ~20 тыс. символов при закрытии вкладки может не сохраниться; пересмотреть, если такие заметки станут обычными.
      keepalive: leaving && typeof init.body === 'string' && init.body.length < 20_000,
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

export function toolQueryToParams(q: ToolQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (q.q) p.set('q', q.q);
  for (const c of q.categories ?? []) p.append('categories', c);
  for (const t of q.tags ?? []) p.append('tags', t);
  if (q.favorite) p.set('favorite', '1');
  if (q.drafts) p.set('drafts', '1');
  if (q.noAnalysis) p.set('noAnalysis', '1');
  if (q.sort && q.sort !== 'added') p.set('sort', q.sort);
  return p;
}

export interface ManualTool {
  title: string;
  description?: string;
  category?: string;
  tags?: string[];
}

export const api = {

  listRepos: (q: LibraryQuery) => request<{ items: RepoSummary[]; total: number }>(`/api/repos?${queryToParams(q)}`),
  facets: () => request<Facets>('/api/facets'),
  getRepo: (id: string) => request<Repo>(`/api/repos/${encodeURIComponent(id)}`),
  getRepoSkills: (id: string) => request<SkillsReport>(`/api/repos/${encodeURIComponent(id)}/skills`),
  addRepo: (input: string) => request<Repo>('/api/repos', { method: 'POST', body: JSON.stringify({ input }) }),
  patchRepo: (id: string, patch: UserPatch) =>
    request<Repo>(`/api/repos/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteRepo: (id: string) => request<void>(`/api/repos/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  refreshRepo: (id: string) => request<Repo>(`/api/repos/${encodeURIComponent(id)}/refresh`, { method: 'POST' }),
  analyzeRepo: (id: string) => request<Repo>(`/api/repos/${encodeURIComponent(id)}/analyze`, { method: 'POST' }),
  chatRepo: (id: string, messages: ChatMessage[]) =>
    request<ChatReply>(`/api/repos/${encodeURIComponent(id)}/chat`, { method: 'POST', body: JSON.stringify({ messages }) }),

  chatTool: (id: string, messages: ChatMessage[]) =>
    request<ChatReply>(`/api/tools/${encodeURIComponent(id)}/chat`, { method: 'POST', body: JSON.stringify({ messages }) }),
  recommendTools: (task: string) => request<ToolRecommendation>('/api/tools/recommend', { method: 'POST', body: JSON.stringify({ task }) }),

  listTools: (q: ToolQuery) => request<{ items: ToolSummary[]; total: number }>(`/api/tools?${toolQueryToParams(q)}`),
  toolFacets: () => request<ToolFacets>('/api/tools/facets'),
  addTool: (url: string, manual?: ManualTool) => request<Tool>('/api/tools', { method: 'POST', body: JSON.stringify(manual ? { url, manual } : { url }) }),
  patchTool: (id: string, patch: ToolPatch) =>
    request<Tool>(`/api/tools/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  getTool: (id: string) => request<Tool>(`/api/tools/${encodeURIComponent(id)}`),
  deleteTool: (id: string) => request<void>(`/api/tools/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  refreshTool: (id: string) => request<Tool>(`/api/tools/${encodeURIComponent(id)}/refresh`, { method: 'POST' }),
  analyzeTool: (id: string) => request<Tool>(`/api/tools/${encodeURIComponent(id)}/analyze`, { method: 'POST' }),
  setToolImage: (id: string, imageUrl: string | null) =>
    request<Tool>(`/api/tools/${encodeURIComponent(id)}/image`, { method: 'PUT', body: JSON.stringify({ imageUrl }) }),

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
