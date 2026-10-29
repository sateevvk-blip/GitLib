import type { Repo } from '../../shared/types.js';
import { GithubError } from '../errors.js';
import { config } from '../config.js';
import { fetchBlob, fetchTree, type FetchedTree } from '../github/client.js';
import type { RepoFile, RepoTree, TreeEntry } from '../ai/context.js';
import { isReadable } from '../ai/context.js';
import type { LibraryStore } from './store.js';

/** Источник содержимого репозитория; подменяется в тестах. */
export interface ContentSource {
  fetchTree: (owner: string, name: string, branch: string, token: string) => Promise<FetchedTree>;
  fetchBlob: (owner: string, name: string, sha: string, token: string) => Promise<string>;
}

export const githubContentSource: ContentSource = { fetchTree, fetchBlob };

interface Deps {
  store: LibraryStore;
  source: ContentSource;
  token: () => string;
  log: { warn: (msg: string) => void };
}

function describeGithubError(e: unknown): string {
  if (e instanceof GithubError) return e.message;
  return e instanceof Error ? e.message : String(e);
}

/**
 * Содержимое репозитория для чата с кэшем в SQLite: структура (по ветке) и файлы (по sha блоба).
 * Без сети отдаёт сохранённое; недоступность GitHub не ломает ответ, а добавляет примечание.
 */
export class RepoContents {
  constructor(private readonly deps: Deps) {}

  async getTree(repo: Repo, notes: string[]): Promise<RepoTree | null> {
    const cached = this.deps.store.getTreeCache(repo.id);
    const fresh =
      cached &&
      cached.pushedAt === repo.github.pushedAt &&
      Date.now() - Date.parse(cached.tree.fetchedAt) < config.chatTreeTtlMs;
    if (fresh) return cached.tree;
    try {
      const fetched = await this.deps.source.fetchTree(repo.owner, repo.name, repo.github.defaultBranch, this.deps.token());
      const tree: RepoTree = {
        sha: fetched.sha,
        branch: repo.github.defaultBranch,
        truncated: fetched.truncated,
        entries: fetched.entries,
        fetchedAt: new Date().toISOString(),
      };
      this.deps.store.saveTreeCache(repo.id, tree, repo.github.pushedAt);
      return tree;
    } catch (e) {
      const why = describeGithubError(e);
      this.deps.log.warn(`Чат: не удалось получить структуру ${repo.fullName}: ${why}`);
      if (cached) {
        notes.push(`GitHub недоступен (${why}) — использована сохранённая структура от ${cached.tree.fetchedAt.slice(0, 10)}.`);
        return cached.tree;
      }
      notes.push(`Список файлов репозитория получить не удалось (${why}) — ответ только по README и описанию.`);
      return null;
    }
  }

  /** Читает выбранные файлы: из кэша по sha, иначе с GitHub. При сбое сети останавливается и добавляет примечание. */
  async getFiles(repo: Repo, tree: RepoTree, paths: string[], notes: string[]): Promise<RepoFile[]> {
    const byPath = new Map(tree.entries.map((e) => [e.path, e] as const));
    const out: RepoFile[] = [];
    const missing: TreeEntry[] = [];
    for (const p of paths) {
      const entry = byPath.get(p);
      if (!entry || !isReadable(entry)) continue;
      const cached = this.deps.store.getFileCache(repo.id, entry.path, entry.sha);
      if (cached !== null) out.push({ path: entry.path, content: cached });
      else missing.push(entry);
    }
    for (const entry of missing) {
      try {
        const content = await this.deps.source.fetchBlob(repo.owner, repo.name, entry.sha, this.deps.token());
        this.deps.store.saveFileCache(repo.id, entry.path, entry.sha, content);
        out.push({ path: entry.path, content });
      } catch (e) {
        const why = describeGithubError(e);
        this.deps.log.warn(`Чат: не удалось прочитать ${repo.fullName}/${entry.path}: ${why}`);
        const left = missing.length - out.filter((f) => missing.some((m) => m.path === f.path)).length;
        notes.push(`Не удалось прочитать ${left} из выбранных файлов (${why}).`);
        break;
      }
    }
    // Порядок — как просили (документация обычно идёт первой).
    const order = new Map(paths.map((p, i) => [p, i] as const));
    out.sort((a, b) => (order.get(a.path) ?? 0) - (order.get(b.path) ?? 0));
    return out;
  }
}
