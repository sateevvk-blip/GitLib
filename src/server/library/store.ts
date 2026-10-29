import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { Collection, GithubData, Repo, RepoSummary } from '../../shared/types.js';
import type { RepoTree } from '../ai/context.js';

interface RepoRow {
  id: string;
  key: string;
  owner: string;
  name: string;
  full_name: string;
  avatar_path: string | null;
  github_json: string;
  readme: string | null;
  analysis_json: string;
  user_json: string;
  added_at: string;
}

interface CollectionRow {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

function rowToRepo(row: RepoRow): Repo {
  const github = JSON.parse(row.github_json) as Omit<GithubData, 'readme'>;
  return {
    id: row.id,
    key: row.key,
    owner: row.owner,
    name: row.name,
    fullName: row.full_name,
    avatarPath: row.avatar_path,
    github: { ...github, readme: row.readme },
    analysis: JSON.parse(row.analysis_json),
    user: JSON.parse(row.user_json),
  };
}

function rowToSummary(row: Omit<RepoRow, 'readme'> & { has_readme: number }): RepoSummary {
  const github = JSON.parse(row.github_json) as Omit<GithubData, 'readme'>;
  return {
    id: row.id,
    key: row.key,
    owner: row.owner,
    name: row.name,
    fullName: row.full_name,
    avatarPath: row.avatar_path,
    github: { ...github, hasReadme: row.has_readme === 1 },
    analysis: JSON.parse(row.analysis_json),
    user: JSON.parse(row.user_json),
  };
}

const SUMMARY_SELECT = `SELECT id, key, owner, name, full_name, avatar_path, github_json, analysis_json, user_json, added_at,
  CASE WHEN readme IS NULL OR readme = '' THEN 0 ELSE 1 END AS has_readme FROM repos`;

/**
 * Хранилище библиотеки поверх SQLite. Не знает ни о GitHub, ни о LLM — только данные.
 */
export class LibraryStore {
  constructor(private readonly db: DatabaseSync) {}

  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  // ---------- repos ----------

  listSummaries(): RepoSummary[] {
    const rows = this.db.prepare(`${SUMMARY_SELECT} ORDER BY added_at DESC`).all() as unknown as Array<
      Omit<RepoRow, 'readme'> & { has_readme: number }
    >;
    return rows.map(rowToSummary);
  }

  listAll(): Repo[] {
    const rows = this.db.prepare('SELECT * FROM repos ORDER BY added_at DESC').all() as unknown as RepoRow[];
    return rows.map(rowToRepo);
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM repos').get() as { n: number };
    return row.n;
  }

  getById(id: string): Repo | null {
    const row = this.db.prepare('SELECT * FROM repos WHERE id = ?').get(id) as RepoRow | undefined;
    return row ? rowToRepo(row) : null;
  }

  getByKey(key: string): Repo | null {
    const row = this.db.prepare('SELECT * FROM repos WHERE key = ?').get(key.toLowerCase()) as RepoRow | undefined;
    return row ? rowToRepo(row) : null;
  }

  insert(repo: Repo): Repo {
    const { readme, ...github } = repo.github;
    this.db
      .prepare(
        `INSERT INTO repos (id, key, owner, name, full_name, avatar_path, github_json, readme, analysis_json, user_json, added_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        repo.id,
        repo.key,
        repo.owner,
        repo.name,
        repo.fullName,
        repo.avatarPath,
        JSON.stringify(github),
        readme,
        JSON.stringify(repo.analysis),
        JSON.stringify(repo.user),
        repo.user.addedAt,
      );
    return repo;
  }

  update(repo: Repo): Repo {
    const { readme, ...github } = repo.github;
    const res = this.db
      .prepare(
        `UPDATE repos SET key = ?, owner = ?, name = ?, full_name = ?, avatar_path = ?, github_json = ?, readme = ?,
         analysis_json = ?, user_json = ?, added_at = ? WHERE id = ?`,
      )
      .run(
        repo.key,
        repo.owner,
        repo.name,
        repo.fullName,
        repo.avatarPath,
        JSON.stringify(github),
        readme,
        JSON.stringify(repo.analysis),
        JSON.stringify(repo.user),
        repo.user.addedAt,
        repo.id,
      );
    if (res.changes === 0) throw new Error(`Repo ${repo.id} not found`);
    return repo;
  }

  /** Обновить только блок analysis (безопасно при параллельных правках пользователя). */
  updateAnalysis(id: string, analysis: Repo['analysis']): void {
    this.db.prepare('UPDATE repos SET analysis_json = ? WHERE id = ?').run(JSON.stringify(analysis), id);
  }

  delete(id: string): boolean {
    const res = this.db.prepare('DELETE FROM repos WHERE id = ?').run(id);
    return res.changes > 0;
  }

  newId(): string {
    return randomUUID();
  }

  // ---------- collections ----------

  listCollections(): Collection[] {
    const rows = this.db.prepare('SELECT * FROM collections ORDER BY name COLLATE NOCASE').all() as unknown as CollectionRow[];
    const links = this.db
      .prepare('SELECT collection_id, repo_id FROM collection_repos ORDER BY position, rowid')
      .all() as unknown as Array<{ collection_id: string; repo_id: string }>;
    const byCollection = new Map<string, string[]>();
    for (const l of links) {
      const arr = byCollection.get(l.collection_id) ?? [];
      arr.push(l.repo_id);
      byCollection.set(l.collection_id, arr);
    }
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      repoIds: byCollection.get(r.id) ?? [],
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  getCollection(id: string): Collection | null {
    return this.listCollections().find((c) => c.id === id) ?? null;
  }

  findCollectionByName(name: string): Collection | null {
    const n = name.trim().toLocaleLowerCase('ru-RU');
    return this.listCollections().find((c) => c.name.trim().toLocaleLowerCase('ru-RU') === n) ?? null;
  }

  insertCollection(c: Collection): Collection {
    this.db
      .prepare('INSERT INTO collections (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(c.id, c.name, c.description, c.createdAt, c.updatedAt);
    this.setCollectionRepos(c.id, c.repoIds);
    return c;
  }

  updateCollection(c: Collection): Collection {
    this.db
      .prepare('UPDATE collections SET name = ?, description = ?, updated_at = ? WHERE id = ?')
      .run(c.name, c.description, c.updatedAt, c.id);
    this.setCollectionRepos(c.id, c.repoIds);
    return c;
  }

  deleteCollection(id: string): boolean {
    const res = this.db.prepare('DELETE FROM collections WHERE id = ?').run(id);
    return res.changes > 0;
  }

  private setCollectionRepos(collectionId: string, repoIds: string[]): void {
    this.db.prepare('DELETE FROM collection_repos WHERE collection_id = ?').run(collectionId);
    const ins = this.db.prepare('INSERT OR IGNORE INTO collection_repos (collection_id, repo_id, position) VALUES (?, ?, ?)');
    const existing = new Set(
      (this.db.prepare('SELECT id FROM repos').all() as unknown as Array<{ id: string }>).map((r) => r.id),
    );
    let pos = 0;
    for (const rid of [...new Set(repoIds)]) {
      if (!existing.has(rid)) continue;
      ins.run(collectionId, rid, pos++);
    }
  }

  collectionsOfRepo(repoId: string): string[] {
    const rows = this.db
      .prepare('SELECT collection_id FROM collection_repos WHERE repo_id = ?')
      .all(repoId) as unknown as Array<{ collection_id: string }>;
    return rows.map((r) => r.collection_id);
  }

  // ---------- кэш содержимого для чата ----------

  getTreeCache(repoId: string): { tree: RepoTree; pushedAt: string | null } | null {
    const row = this.db.prepare('SELECT tree_sha, branch, truncated, pushed_at, entries_json, fetched_at FROM repo_trees WHERE repo_id = ?').get(repoId) as
      | { tree_sha: string; branch: string; truncated: number; pushed_at: string | null; entries_json: string; fetched_at: string }
      | undefined;
    if (!row) return null;
    return {
      tree: { sha: row.tree_sha, branch: row.branch, truncated: row.truncated === 1, entries: JSON.parse(row.entries_json) as RepoTree['entries'], fetchedAt: row.fetched_at },
      pushedAt: row.pushed_at,
    };
  }

  saveTreeCache(repoId: string, tree: RepoTree, pushedAt: string | null): void {
    this.db
      .prepare(
        `INSERT INTO repo_trees (repo_id, tree_sha, branch, truncated, pushed_at, entries_json, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(repo_id) DO UPDATE SET tree_sha = excluded.tree_sha, branch = excluded.branch, truncated = excluded.truncated,
           pushed_at = excluded.pushed_at, entries_json = excluded.entries_json, fetched_at = excluded.fetched_at`,
      )
      .run(repoId, tree.sha, tree.branch, tree.truncated ? 1 : 0, pushedAt, JSON.stringify(tree.entries), tree.fetchedAt);
  }

  /** Содержимое файла, если в кэше лежит именно эта версия (sha блоба). */
  getFileCache(repoId: string, path: string, sha: string): string | null {
    const row = this.db.prepare('SELECT sha, content FROM repo_files WHERE repo_id = ? AND path = ?').get(repoId, path) as { sha: string; content: string } | undefined;
    return row && row.sha === sha ? row.content : null;
  }

  saveFileCache(repoId: string, path: string, sha: string, content: string): void {
    this.db
      .prepare(
        `INSERT INTO repo_files (repo_id, path, sha, content, fetched_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(repo_id, path) DO UPDATE SET sha = excluded.sha, content = excluded.content, fetched_at = excluded.fetched_at`,
      )
      .run(repoId, path, sha, content, new Date().toISOString());
  }
}
