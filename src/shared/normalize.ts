/**
 * Нормализация пользовательского ввода в пару owner/name.
 * Принимает: owner/repo, https://github.com/owner/repo[.git][/tree/...],
 * github.com/owner/repo, git@github.com:owner/repo.git, ssh://git@github.com/owner/repo.
 */

export interface RepoRef {
  owner: string;
  name: string;
  fullName: string;
  key: string;
}

const OWNER_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
const NAME_RE = /^[a-z\d._-]{1,100}$/i;

export class NormalizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NormalizeError';
  }
}

function validate(owner: string, name: string): RepoRef {
  const cleanName = name.replace(/\.git$/i, '');
  if (!OWNER_RE.test(owner)) {
    throw new NormalizeError(`Недопустимое имя владельца: «${owner}»`);
  }
  if (!NAME_RE.test(cleanName) || cleanName === '.' || cleanName === '..') {
    throw new NormalizeError(`Недопустимое имя репозитория: «${cleanName}»`);
  }
  const fullName = `${owner}/${cleanName}`;
  return { owner, name: cleanName, fullName, key: fullName.toLowerCase() };
}

export function normalizeRepoInput(raw: string): RepoRef {
  const input = (raw ?? '').trim();
  if (!input) throw new NormalizeError('Введите ссылку на репозиторий или owner/repo');

  // git@github.com:owner/repo.git
  const scp = input.match(/^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\/.*)?$/i);
  if (scp) return validate(scp[1]!, scp[2]!);

  // Короткая форма owner/repo (без схемы и хоста)
  const short = input.match(/^@?([^/\s@:]+)\/([^/\s?#]+)\/?$/);
  if (short && !/\.[a-z]{2,}\//i.test(input) && !/^[a-z][a-z\d+.-]*:\/\//i.test(input)) {
    return validate(short[1]!, short[2]!);
  }

  // Любая URL-подобная форма
  let candidate = input;
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(candidate)) {
    candidate = `https://${candidate.replace(/^\/+/, '')}`;
  }
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new NormalizeError('Не удалось разобрать ссылку. Ожидается github.com/owner/repo или owner/repo');
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== 'github.com') {
    throw new NormalizeError(`Поддерживаются только ссылки на github.com (получено: ${host || 'пусто'})`);
  }
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2) {
    throw new NormalizeError('В ссылке нет owner/repo');
  }
  return validate(decodeURIComponent(parts[0]!), decodeURIComponent(parts[1]!));
}

export function repoKey(owner: string, name: string): string {
  return `${owner}/${name}`.toLowerCase();
}
