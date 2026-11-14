import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { openDatabase } from '../src/server/db/database.js';
import { LibraryStore } from '../src/server/library/store.js';
import { ToolsStore } from '../src/server/tools/store.js';
import { applyToolPatch } from '../src/shared/merge.js';
import { makeSource, makeTool, tempDataDir } from './helpers.js';
import type { ToolAnalysis } from '../src/shared/types.js';

function makeToolsStore() {
  const dataDir = tempDataDir();
  const db = openDatabase(path.join(dataDir, 'gitlib.sqlite'));
  return { db, dataDir, store: new ToolsStore(db) };
}

describe('схема v3', () => {
  it('открывает базу v2 без потери данных', () => {
    const dataDir = tempDataDir();
    const file = path.join(dataDir, 'gitlib.sqlite');
    const old = new DatabaseSync(file);
    old.exec(`
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE repos (id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, owner TEXT NOT NULL, name TEXT NOT NULL,
        full_name TEXT NOT NULL, avatar_path TEXT, github_json TEXT NOT NULL, readme TEXT, analysis_json TEXT NOT NULL,
        user_json TEXT NOT NULL, added_at TEXT NOT NULL);
      INSERT INTO meta VALUES ('schema_version', '2');
      INSERT INTO repos VALUES ('r1', 'a/b', 'a', 'b', 'a/b', NULL, '{}', 'README', '{}', '{"addedAt":"2026-01-01"}', '2026-01-01');
    `);
    old.close();

    const db = openDatabase(file);
    expect((db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version') as { value: string }).value).toBe('3');
    expect(new LibraryStore(db).getById('r1')?.github.readme).toBe('README');
    const store = new ToolsStore(db);
    expect(store.count()).toBe(0);
    store.insert(makeTool());
    expect(store.count()).toBe(1);
  });
});

describe('ToolsStore', () => {
  it('insert/getById/getByKey возвращают текст источника, список — нет', () => {
    const { store } = makeToolsStore();
    const t = makeTool('https://example.com/a', { source: makeSource({ text: 'Полный текст страницы' }) });
    store.insert(t);
    expect(store.getById(t.id)).toEqual(t);
    expect(store.getByKey(t.key)?.id).toBe(t.id);
    expect(store.listAll()[0].source.text).toBe('Полный текст страницы');
    const [summary] = store.listSummaries();
    expect('text' in summary.source).toBe(false);
    expect(summary.source.textChars).toBe(t.source.textChars);
    expect(summary.id).toBe(t.id);
  });

  it('ключ уникален', () => {
    const { store } = makeToolsStore();
    store.insert(makeTool('https://same.io'));
    expect(() => store.insert(makeTool('https://same.io'))).toThrow();
  });

  it('updateAnalysis не трогает user_json и source', () => {
    const { store } = makeToolsStore();
    const t = makeTool();
    store.insert(t);
    store.update(applyToolPatch(t, { notes: 'моя заметка', favorite: true }));
    const analysis: ToolAnalysis = { ...t.analysis, status: 'done', summary: 'Сводка' };
    store.updateAnalysis(t.id, analysis);
    const got = store.getById(t.id)!;
    expect(got.analysis.summary).toBe('Сводка');
    expect(got.user.notes).toBe('моя заметка');
    expect(got.user.favorite).toBe(true);
    expect(got.source.text).toBe(t.source.text);
  });

  it('updateSource заменяет source и текст, но не user и analysis', () => {
    const { store } = makeToolsStore();
    const t = makeTool();
    store.insert(t);
    store.updateAnalysis(t.id, { ...t.analysis, status: 'done', summary: 'S' });
    store.updateSource(t.id, makeSource({ title: 'Новый', text: 'Новый текст', textChars: 11 }));
    const got = store.getById(t.id)!;
    expect(got.source.title).toBe('Новый');
    expect(got.source.text).toBe('Новый текст');
    expect(got.analysis.summary).toBe('S');
    expect(got.user).toEqual(t.user);
  });

  it('update бросает на неизвестном id', () => {
    const { store } = makeToolsStore();
    expect(() => store.update(makeTool())).toThrow();
  });

  it('delete удаляет запись', () => {
    const { store } = makeToolsStore();
    const t = makeTool();
    store.insert(t);
    expect(store.delete(t.id)).toBe(true);
    expect(store.getById(t.id)).toBeNull();
    expect(store.delete('nope')).toBe(false);
  });
});
