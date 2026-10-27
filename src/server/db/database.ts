import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA_VERSION = 1;

export function openDatabase(dbPath: string): DatabaseSync {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA synchronous = NORMAL;');
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS repos (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      owner TEXT NOT NULL,
      name TEXT NOT NULL,
      full_name TEXT NOT NULL,
      avatar_path TEXT,
      github_json TEXT NOT NULL,
      readme TEXT,
      analysis_json TEXT NOT NULL,
      user_json TEXT NOT NULL,
      added_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_repos_added ON repos(added_at);
    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS collection_repos (
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (collection_id, repo_id)
    );
  `);
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version') as { value: string } | undefined;
  if (!row) {
    db.prepare('INSERT INTO meta(key, value) VALUES (?, ?)').run('schema_version', String(SCHEMA_VERSION));
  }
}
