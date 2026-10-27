import fs from 'node:fs';
import path from 'node:path';
import type { GithubData } from '../../shared/types.js';
import { GithubError } from '../errors.js';
import { config } from '../config.js';

const API = 'https://api.github.com';

export interface FetchedRepo {
  github: GithubData;
  canonical: { owner: string; name: string };
}

interface GithubRepoResponse {
  name: string;
  full_name: string;
  owner: { login: string; type: string; avatar_url: string | null };
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  topics?: string[];
  stargazers_count: number;
  forks_count: number;
  subscribers_count?: number;
  watchers_count?: number;
  open_issues_count: number;
  license: { spdx_id?: string | null; name?: string | null } | null;
  default_branch: string;
  archived: boolean;
  fork: boolean;
  pushed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

function headers(token: string, accept = 'application/vnd.github+json'): Record<string, string> {
  const h: Record<string, string> = {
    Accept: accept,
    'User-Agent': `GitLib/${config.appVersion}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function isNetworkError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const cause = (e as Error & { cause?: { code?: string } }).cause;
  return (
    e.name === 'TypeError' ||
    e.name === 'AbortError' ||
    e.name === 'TimeoutError' ||
    Boolean(cause?.code && ['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'EAI_AGAIN', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(cause.code))
  );
}

async function githubFetch(url: string, token: string, accept?: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { headers: headers(token, accept), signal: AbortSignal.timeout(config.githubTimeoutMs) });
  } catch (e) {
    if (isNetworkError(e)) {
      throw new GithubError('Нет связи с GitHub. Проверьте подключение к интернету.', 'offline', 503);
    }
    throw e;
  }
  if (res.ok) return res;
  const remaining = res.headers.get('x-ratelimit-remaining');
  if ((res.status === 403 || res.status === 429) && remaining === '0') {
    const reset = Number(res.headers.get('x-ratelimit-reset') ?? 0) * 1000;
    const when = reset ? new Date(reset).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
    throw new GithubError(
      `Исчерпан лимит запросов GitHub API${when ? ` (сброс в ${when})` : ''}. ${token ? '' : 'Добавьте токен в настройках, чтобы поднять лимит до 5000/час.'}`.trim(),
      'rate_limit',
      429,
    );
  }
  if (res.status === 401) throw new GithubError('GitHub отклонил токен (401). Проверьте его в настройках.', 'unauthorized', 401);
  if (res.status === 404) throw new GithubError('Репозиторий не найден на GitHub (или приватный без доступа).', 'not_found', 404);
  if (res.status === 451) throw new GithubError('Репозиторий недоступен по юридическим причинам (451).', 'unavailable', 451);
  throw new GithubError(`GitHub ответил ошибкой ${res.status}`, 'github_error', 502);
}

export async function fetchRepository(owner: string, name: string, token: string): Promise<FetchedRepo> {
  const base = `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  const res = await githubFetch(base, token);
  const data = (await res.json()) as GithubRepoResponse;

  const [readme, languages] = await Promise.all([fetchReadme(base, token), fetchLanguages(base, token)]);

  const [canonicalOwner, canonicalName] = data.full_name.split('/') as [string, string];
  const github: GithubData = {
    description: data.description,
    htmlUrl: data.html_url,
    homepage: data.homepage ? data.homepage.trim() : null,
    language: data.language,
    languages,
    topics: Array.isArray(data.topics) ? data.topics : [],
    stars: data.stargazers_count ?? 0,
    forks: data.forks_count ?? 0,
    watchers: data.subscribers_count ?? data.watchers_count ?? 0,
    openIssues: data.open_issues_count ?? 0,
    license: data.license?.spdx_id && data.license.spdx_id !== 'NOASSERTION' ? data.license.spdx_id : data.license?.name ?? null,
    defaultBranch: data.default_branch ?? 'main',
    archived: Boolean(data.archived),
    isFork: Boolean(data.fork),
    pushedAt: data.pushed_at,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    ownerLogin: data.owner?.login ?? canonicalOwner,
    ownerType: data.owner?.type ?? 'User',
    ownerAvatarUrl: data.owner?.avatar_url ?? null,
    readme,
    fetchedAt: new Date().toISOString(),
  };
  return { github, canonical: { owner: canonicalOwner, name: canonicalName } };
}

async function fetchReadme(base: string, token: string): Promise<string | null> {
  try {
    const res = await githubFetch(`${base}/readme`, token, 'application/vnd.github.raw+json');
    const text = await res.text();
    return text.length > config.readmeMaxChars ? `${text.slice(0, config.readmeMaxChars)}\n\n…(README обрезан)` : text;
  } catch (e) {
    if (e instanceof GithubError && e.code === 'not_found') return null;
    if (e instanceof GithubError && e.code === 'rate_limit') return null;
    throw e;
  }
}

async function fetchLanguages(base: string, token: string): Promise<Record<string, number>> {
  try {
    const res = await githubFetch(`${base}/languages`, token);
    const data = (await res.json()) as Record<string, number>;
    return typeof data === 'object' && data ? data : {};
  } catch {
    return {};
  }
}

/** Скачивает аватар владельца в папку аватаров. Возвращает относительный путь или null. */
export async function downloadAvatar(avatarUrl: string | null, ownerLogin: string): Promise<string | null> {
  if (!avatarUrl) return null;
  try {
    const url = new URL(avatarUrl);
    url.searchParams.set('s', '128');
    const res = await fetch(url, {
      headers: { 'User-Agent': `GitLib/${config.appVersion}` },
      signal: AbortSignal.timeout(config.githubTimeoutMs),
    });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? '';
    const ext = type.includes('jpeg') ? 'jpg' : type.includes('gif') ? 'gif' : type.includes('webp') ? 'webp' : 'png';
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 2_000_000) return null;
    const safe = ownerLogin.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const file = `${safe}.${ext}`;
    fs.mkdirSync(config.avatarsDir, { recursive: true });
    fs.writeFileSync(path.join(config.avatarsDir, file), buf);
    return `avatars/${file}`;
  } catch {
    return null;
  }
}

export interface GithubProbe {
  ok: boolean;
  message: string;
  remaining: number | null;
  authenticated: boolean;
}

export async function probeGithub(token: string): Promise<GithubProbe> {
  try {
    const res = await fetch(`${API}/rate_limit`, { headers: headers(token), signal: AbortSignal.timeout(8000) });
    if (res.status === 401) return { ok: false, message: 'Токен отклонён (401)', remaining: null, authenticated: false };
    if (!res.ok) return { ok: false, message: `GitHub ответил ${res.status}`, remaining: null, authenticated: false };
    const data = (await res.json()) as { resources?: { core?: { remaining?: number; limit?: number } } };
    const core = data.resources?.core;
    const remaining = core?.remaining ?? null;
    const limit = core?.limit ?? null;
    const authenticated = Boolean(token) && (limit ?? 0) > 60;
    return {
      ok: true,
      message: `GitHub доступен · осталось ${remaining ?? '?'} из ${limit ?? '?'} запросов${authenticated ? ' (с токеном)' : ' (без токена)'}`,
      remaining,
      authenticated,
    };
  } catch {
    return { ok: false, message: 'GitHub недоступен (нет сети?)', remaining: null, authenticated: false };
  }
}
