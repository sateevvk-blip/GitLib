import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyImport, buildExport, parseExportFile, previewImport } from '../src/server/transfer/transfer.js';
import { ValidationError } from '../src/server/errors.js';
import { EXPORT_FORMAT, EXPORT_VERSION, type ExportFile } from '../src/shared/types.js';
import { openDatabase } from '../src/server/db/database.js';
import { LibraryStore } from '../src/server/library/store.js';
import { ToolsStore } from '../src/server/tools/store.js';
import { emptyAnalysis } from '../src/shared/merge.js';
import { makeRepo, makeTool, tempDataDir } from './helpers.js';

function makeStore() {
  const dataDir = tempDataDir();
  const db = openDatabase(path.join(dataDir, 'gitlib.sqlite'));
  const store = new LibraryStore(db);
  const toolsStore = new ToolsStore(db);
  return { store, toolsStore, dataDir, deps: { store, toolsStore, dataDir, appVersion: '1.0.0' } };
}

function seeded() {
  const { store, toolsStore, dataDir } = makeStore();
  const a = makeRepo('octo/alpha', {
    user: { notes: 'Локальные заметки', topics: ['local'], status: 'using', favorite: true, addedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  });
  const b = makeRepo('octo/beta');
  store.insert(a);
  store.insert(b);
  const col = store.insertCollection({ id: 'col-1', name: 'Инструменты', description: '', repoIds: [a.id], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
  return { store, toolsStore, dataDir, a, b, col };
}

describe('экспорт', () => {
  it('формирует файл с версией формата, всеми записями, README, аватарами и коллекциями', () => {
    const { store, toolsStore, dataDir, a } = seeded();
    fs.mkdirSync(path.join(dataDir, 'avatars'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'avatars', 'octo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    store.update({ ...a, avatarPath: 'avatars/octo.png' });

    const file = buildExport({ store, toolsStore, dataDir, appVersion: '1.0.0' });
    expect(file.format).toBe(EXPORT_FORMAT);
    expect(file.version).toBe(EXPORT_VERSION);
    expect(file.repos).toHaveLength(2);
    expect(file.collections).toHaveLength(1);
    const exported = file.repos.find((r) => r.id === a.id)!;
    expect(exported.github.readme).toBe('# Test\n\nHello');
    expect(exported.user.notes).toBe('Локальные заметки');
    expect(exported.avatarDataUrl).toMatch(/^data:image\/png;base64,/);
    // Файл проходит собственную валидацию (round-trip)
    expect(() => parseExportFile(JSON.parse(JSON.stringify(file)))).not.toThrow();
  });
});

describe('транзакции хранилища', () => {
  it('сбой вложенной записи откатывает только её: внешняя транзакция продолжается и фиксируется', () => {
    const { store, col } = seeded();
    const extra = makeRepo('octo/gamma');
    store.transaction(() => {
      store.insert(extra);
      // тот же id — INSERT падает внутри вложенной транзакции insertCollection
      expect(() => store.insertCollection({ ...col, name: 'Дубль' })).toThrow();
    });
    expect(store.getByKey('octo/gamma')).not.toBeNull();
    expect(store.listCollections().map((c) => c.name)).toEqual(['Инструменты']);
    // откат внешней транзакции убирает всё, что в ней сделано
    expect(() => store.transaction(() => { store.delete(extra.id); throw new Error('стоп'); })).toThrow('стоп');
    expect(store.getByKey('octo/gamma')).not.toBeNull();
  });
});

describe('валидация импорта', () => {
  it('отклоняет чужой формат, неверную версию и битую структуру', () => {
    expect(() => parseExportFile({ foo: 1 })).toThrow(ValidationError);
    expect(() => parseExportFile({ format: EXPORT_FORMAT, version: 99, repos: [] })).toThrow(/версия/);
    expect(() => parseExportFile({ format: EXPORT_FORMAT, version: 1, repos: [{ id: 'x' }] })).toThrow(ValidationError);
    expect(() => parseExportFile('string')).toThrow(ValidationError);
  });

  it('ключ репозитория считается из owner/name, а не берётся из файла', () => {
    const src = seeded();
    const file = JSON.parse(JSON.stringify(buildExport({ store: src.store, toolsStore: src.toolsStore, dataDir: src.dataDir, appVersion: '1.0.0' }))) as ExportFile;
    file.repos.find((r) => r.id === src.a.id)!.key = 'someone/else';
    const dst = makeStore();
    applyImport(dst.deps, parseExportFile(file), 'merge');
    expect(dst.store.getByKey('octo/alpha')?.id).toBe(src.a.id);
    expect(dst.store.getByKey('someone/else')).toBeNull();
    file.repos[0]!.owner = 'bad owner';
    expect(() => parseExportFile(file)).toThrow(ValidationError);
  });

  it('отклоняет файл с дубликатами внутри', () => {
    const { store, toolsStore, dataDir } = seeded();
    const file = buildExport({ store, toolsStore, dataDir, appVersion: '1.0.0' });
    file.repos.push({ ...file.repos[0]!, id: 'other', fullName: 'OCTO/ALPHA', key: 'octo/alpha' });
    expect(() => parseExportFile(JSON.parse(JSON.stringify(file)))).toThrow(/дублируется/);
  });
});

describe('импорт', () => {
  function exportFrom(seed: ReturnType<typeof seeded>): ExportFile {
    return JSON.parse(JSON.stringify(buildExport({ store: seed.store, toolsStore: seed.toolsStore, dataDir: seed.dataDir, appVersion: '1.0.0' }))) as ExportFile;
  }

  it('предпросмотр считает новые записи и дубликаты без учёта регистра', () => {
    const source = seeded();
    const file = exportFrom(source);
    file.repos[0]!.fullName = 'OCTO/ALPHA';
    file.repos[0]!.key = 'OCTO/ALPHA';
    file.repos.push(makeRepo('someone/new'));

    const target = seeded();
    const preview = previewImport(target.store, target.toolsStore, file);
    expect(preview.repos).toMatchObject({ total: 3, new: 1, duplicates: 2 });
    expect(preview.repos.duplicateNames).toContain('OCTO/ALPHA');
    expect(preview.collections).toMatchObject({ total: 1, new: 0, existing: 1 });
  });

  it('в пустую библиотеку импортируется всё, включая коллекции и аватары', () => {
    const source = seeded();
    fs.mkdirSync(path.join(source.dataDir, 'avatars'), { recursive: true });
    fs.writeFileSync(path.join(source.dataDir, 'avatars', 'octo.png'), Buffer.from([1, 2, 3]));
    source.store.update({ ...source.a, avatarPath: 'avatars/octo.png' });
    const file = exportFrom(source);

    const { store, toolsStore, dataDir } = makeStore();
    const result = applyImport({ store, toolsStore, dataDir, appVersion: '1.0.0' }, file, 'merge');
    expect(result).toMatchObject({ added: 2, merged: 0, skipped: 0, collectionsCreated: 1 });
    const alpha = store.getByKey('octo/alpha')!;
    expect(alpha.user.notes).toBe('Локальные заметки');
    expect(alpha.avatarPath).toBe('avatars/octo.png');
    expect(fs.existsSync(path.join(dataDir, 'avatars', 'octo.png'))).toBe(true);
    expect(store.listCollections()[0]!.repoIds).toEqual([alpha.id]);
  });

  it('стратегия skip: локальные записи не меняются', () => {
    const source = seeded();
    const file = exportFrom(source);
    file.repos[0]!.user.notes = 'Чужие заметки';
    const target = seeded();
    const before = target.store.getByKey('octo/alpha')!;
    const result = applyImport({ store: target.store, toolsStore: target.toolsStore, dataDir: target.dataDir, appVersion: '1.0.0' }, file, 'skip');
    expect(result).toMatchObject({ added: 0, skipped: 2 });
    expect(target.store.getByKey('octo/alpha')).toEqual(before);
  });

  it('skip и merge не перезаписывают локальный файл аватара картинкой из импорта', () => {
    const source = seeded();
    fs.mkdirSync(path.join(source.dataDir, 'avatars'), { recursive: true });
    fs.writeFileSync(path.join(source.dataDir, 'avatars', 'octo.png'), Buffer.from([1, 2, 3]));
    source.store.update({ ...source.a, avatarPath: 'avatars/octo.png' });
    const file = exportFrom(source);

    for (const strategy of ['skip', 'merge'] as const) {
      const target = seeded();
      const localAvatar = path.join(target.dataDir, 'avatars', 'octo.png');
      fs.mkdirSync(path.dirname(localAvatar), { recursive: true });
      fs.writeFileSync(localAvatar, Buffer.from([9, 9]));
      target.store.update({ ...target.a, avatarPath: 'avatars/octo.png' });
      applyImport({ store: target.store, toolsStore: target.toolsStore, dataDir: target.dataDir, appVersion: '1.0.0' }, file, strategy);
      expect([...fs.readFileSync(localAvatar)], strategy).toEqual([9, 9]);
    }
  });

  it('сбой импорта не заменяет аватар и не оставляет временных файлов', () => {
    const source = seeded();
    fs.mkdirSync(path.join(source.dataDir, 'avatars'), { recursive: true });
    fs.writeFileSync(path.join(source.dataDir, 'avatars', 'octo.png'), Buffer.from([1, 2, 3]));
    source.store.update({ ...source.a, avatarPath: 'avatars/octo.png' });
    const file = exportFrom(source);

    const target = seeded();
    const dir = path.join(target.dataDir, 'avatars');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'octo.png'), Buffer.from([9, 9]));
    const real = target.store.update.bind(target.store);
    // Падаем на записи с аватаром — уже после того, как импорт подготовил её файл.
    target.store.update = (r) => {
      if (r.key === 'octo/alpha') throw new Error('сбой');
      return real(r);
    };
    expect(() => applyImport({ store: target.store, toolsStore: target.toolsStore, dataDir: target.dataDir, appVersion: '1.0.0' }, file, 'replace')).toThrow('сбой');
    expect([...fs.readFileSync(path.join(dir, 'octo.png'))]).toEqual([9, 9]);
    expect(fs.readdirSync(dir)).toEqual(['octo.png']);
  });

  it('стратегия merge: заметки объединяются, темы — объединение, избранное сохраняется', () => {
    const source = seeded();
    const file = exportFrom(source);
    const imp = file.repos.find((r) => r.key === 'octo/alpha')!;
    imp.user.notes = 'Заметки из другого компьютера';
    imp.user.topics = ['imported'];
    imp.user.favorite = false;
    imp.user.status = 'inbox';
    imp.github.stars = 999;
    imp.github.fetchedAt = '2030-01-01T00:00:00.000Z';

    const target = seeded();
    const result = applyImport({ store: target.store, toolsStore: target.toolsStore, dataDir: target.dataDir, appVersion: '1.0.0' }, file, 'merge');
    expect(result).toMatchObject({ added: 0, merged: 2 });
    const merged = target.store.getByKey('octo/alpha')!;
    expect(merged.user.notes).toContain('Локальные заметки');
    expect(merged.user.notes).toContain('Заметки из другого компьютера');
    expect(merged.user.topics).toEqual(['local', 'imported']);
    expect(merged.user.favorite).toBe(true);
    expect(merged.user.status).toBe('using');
    expect(merged.github.stars).toBe(999);
  });

  it('стратегия replace: импорт перезаписывает запись, сохраняя локальный id', () => {
    const source = seeded();
    const file = exportFrom(source);
    const imp = file.repos.find((r) => r.key === 'octo/alpha')!;
    imp.user.notes = 'Только импорт';
    imp.user.favorite = false;

    const target = seeded();
    const localId = target.store.getByKey('octo/alpha')!.id;
    const result = applyImport({ store: target.store, toolsStore: target.toolsStore, dataDir: target.dataDir, appVersion: '1.0.0' }, file, 'replace');
    expect(result).toMatchObject({ replaced: 2 });
    const replaced = target.store.getByKey('octo/alpha')!;
    expect(replaced.id).toBe(localId);
    expect(replaced.user.notes).toBe('Только импорт');
    expect(replaced.user.favorite).toBe(false);
  });

  it('коллекции с одинаковым названием объединяются по составу', () => {
    const source = seeded();
    source.store.updateCollection({ ...source.col, repoIds: [source.a.id, source.b.id] });
    const file = exportFrom(source);

    const target = seeded();
    applyImport({ store: target.store, toolsStore: target.toolsStore, dataDir: target.dataDir, appVersion: '1.0.0' }, file, 'merge');
    const cols = target.store.listCollections();
    expect(cols).toHaveLength(1);
    expect(cols[0]!.repoIds.sort()).toEqual([target.a.id, target.b.id].sort());
  });
});

describe('инструменты в экспорте и импорте', () => {
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  const asFile = (s: ReturnType<typeof makeStore>): ExportFile => JSON.parse(JSON.stringify(buildExport(s.deps))) as ExportFile;

  /** Инструмент с тремя картинками на диске. */
  function seedTool(s: ReturnType<typeof makeStore>, url: string, id: string, bytes = PNG, exts: Record<string, string> = {}) {
    const dir = path.join(s.dataDir, 'tool-images');
    fs.mkdirSync(dir, { recursive: true });
    const ext = (k: string) => exts[k] ?? 'png';
    for (const k of ['icon', 'cover', 'user']) fs.writeFileSync(path.join(dir, `${id}-${k}.${ext(k)}`), bytes);
    const base = makeTool(url);
    return s.toolsStore.insert({
      ...base,
      id,
      source: { ...base.source, text: 'Текст страницы', iconPath: `tool-images/${id}-icon.${ext('icon')}`, imagePath: `tool-images/${id}-cover.${ext('cover')}` },
      user: { ...base.user, notes: 'Мои заметки', tags: ['a'], favorite: true, imagePath: `tool-images/${id}-user.${ext('user')}`, overrides: { summary: 'Моя сводка' } },
    });
  }

  it('round-trip: данные, текст страницы, правки и три картинки; запись получает новый локальный id', () => {
    const src = makeStore();
    const orig = seedTool(src, 'https://example.com/a', 'tool-src');
    const file = asFile(src);
    expect(file.version).toBe(EXPORT_VERSION);
    expect(file.tools[0]!.iconDataUrl).toMatch(/^data:image\/png;base64,/);

    const dst = makeStore();
    const res = applyImport(dst.deps, file, 'merge');
    expect(res.tools).toEqual({ added: 1, merged: 0, replaced: 0, skipped: 0 });
    const got = dst.toolsStore.getByKey(orig.key)!;
    expect(got.id).not.toBe('tool-src');
    expect(got.source.text).toBe('Текст страницы');
    expect(got.user.notes).toBe('Мои заметки');
    expect(got.user.overrides.summary).toBe('Моя сводка');
    expect(got.source.iconPath).toBe(`tool-images/${got.id}-icon.png`);
    expect(got.source.imagePath).toBe(`tool-images/${got.id}-cover.png`);
    expect(got.user.imagePath).toBe(`tool-images/${got.id}-user.png`);
    for (const p of [got.source.iconPath!, got.source.imagePath!, got.user.imagePath!]) {
      expect([...fs.readFileSync(path.join(dst.dataDir, p))]).toEqual([...PNG]);
    }
  });

  it('round-trip: .ico и .svg сохраняют тип и расширение', () => {
    const src = makeStore();
    seedTool(src, 'https://example.com/ico', 'tool-ico', PNG, { icon: 'ico', cover: 'svg' });
    const file = asFile(src);
    expect(file.tools[0]!.iconDataUrl).toMatch(/^data:image\/x-icon;base64,/);
    expect(file.tools[0]!.coverDataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
    const dst = makeStore();
    applyImport(dst.deps, file, 'merge');
    const got = dst.toolsStore.getByKey('example.com/ico')!;
    expect(got.source.iconPath).toBe(`tool-images/${got.id}-icon.ico`);
    expect(got.source.imagePath).toBe(`tool-images/${got.id}-cover.svg`);
    expect(fs.existsSync(path.join(dst.dataDir, got.source.imagePath!))).toBe(true);
  });

  it('finalUrl не участвует в поиске дубликата: запись с другим url остаётся отдельной', () => {
    const src = makeStore();
    seedTool(src, 'https://other.example/x', 'tool-src');
    const file = asFile(src);
    file.tools[0]!.source.finalUrl = 'https://example.com/login';
    const dst = makeStore();
    seedTool(dst, 'https://example.com/login', 'tool-dst');
    expect(previewImport(dst.store, dst.toolsStore, file).tools).toMatchObject({ new: 1, duplicates: 0 });
    for (const strategy of ['merge', 'replace'] as const) applyImport(dst.deps, file, strategy);
    expect(dst.toolsStore.count()).toBe(2);
    expect(dst.toolsStore.getById('tool-dst')!.user.notes).toBe('Мои заметки');
  });

  it('сбой внутри транзакции: файлы и база как были, временных файлов нет', () => {
    const src = makeStore();
    seedTool(src, 'https://example.com/a', 'tool-src', Buffer.from([7, 7, 7]));
    seedTool(src, 'https://example.com/b', 'tool-src2');
    const file = asFile(src);
    file.tools[0]!.userImageDataUrl = null;

    const dst = makeStore();
    seedTool(dst, 'https://example.com/a', 'tool-dst');
    seedTool(dst, 'https://example.com/b', 'tool-dst2');
    const before = dst.toolsStore.getById('tool-dst');
    const real = dst.toolsStore.update.bind(dst.toolsStore);
    let calls = 0;
    dst.toolsStore.update = (t) => {
      if (++calls === 2) throw new Error('сбой');
      return real(t);
    };
    expect(() => applyImport(dst.deps, file, 'replace')).toThrow('сбой');
    expect(dst.toolsStore.getById('tool-dst')).toEqual(before);
    const dir = path.join(dst.dataDir, 'tool-images');
    expect([...fs.readFileSync(path.join(dir, 'tool-dst-icon.png'))]).toEqual([...PNG]);
    expect(fs.existsSync(path.join(dir, 'tool-dst-user.png'))).toBe(true);
    expect(fs.readdirSync(dir).filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });

  it.each(['merge', 'skip', 'replace'] as const)('статус pending из файла не сохраняется (%s): сводка → done, без сводки → none', (strategy) => {
    const src = makeStore();
    seedTool(src, 'https://example.com/p', 'tool-p');
    const file = asFile(src);
    file.tools[0]!.analysis = { ...file.tools[0]!.analysis, status: 'pending', summary: 'Есть', error: 'старая' };
    const withSummary = makeRepo('octo/ps', { analysis: { ...emptyAnalysis(), status: 'pending', summary: 'Есть' } });
    const without = makeRepo('octo/pn', { analysis: { ...emptyAnalysis(), status: 'pending' } });
    file.repos = [withSummary, without].map((r) => ({ ...r, avatarDataUrl: null })) as unknown as ExportFile['repos'];
    for (const withLocal of [false, true]) {
      const dst = makeStore();
      if (withLocal) {
        dst.store.insert(makeRepo('octo/ps'));
        dst.store.insert(makeRepo('octo/pn'));
        seedTool(dst, 'https://example.com/p', 'tool-local');
      }
      applyImport(dst.deps, file, strategy);
      const want = withLocal && strategy === 'skip' ? 'none' : 'done';
      expect(dst.store.getByKey('octo/ps')!.analysis).toMatchObject({ status: want, error: null });
      expect(dst.store.getByKey('octo/pn')!.analysis).toMatchObject({ status: 'none', error: null });
      expect(dst.toolsStore.getByKey('example.com/p')!.analysis).toMatchObject({ status: want, error: null });
    }
  });

  it('файл версии 1 (без tools) читается и импортируется', () => {
    const src = seeded();
    const v1 = { ...JSON.parse(JSON.stringify(buildExport({ store: src.store, toolsStore: src.toolsStore, dataDir: src.dataDir, appVersion: '1' }))), version: 1 };
    delete v1.tools;
    const parsed = parseExportFile(v1);
    expect(parsed.tools).toEqual([]);
    const dst = makeStore();
    const res = applyImport(dst.deps, parsed, 'merge');
    expect(res).toMatchObject({ added: 2, tools: { added: 0 } });
  });

  it('пути из файла не используются: id и imagePath с «../» не дают выйти из tool-images и не трогают чужие файлы', () => {
    const src = makeStore();
    seedTool(src, 'https://example.com/evil', 'tool-evil');
    const file = asFile(src);
    const t = file.tools[0]!;
    t.id = '../../x';
    t.source.iconPath = '../../x-icon.png';
    t.source.imagePath = '../../../etc/passwd';
    t.user.imagePath = '../../x';

    const dst = makeStore();
    const victim = seedTool(dst, 'https://victim.test/', 'victim');
    applyImport(dst.deps, file, 'replace');
    const got = dst.toolsStore.getByKey('example.com/evil')!;
    expect(got.id).toMatch(/^[0-9a-f-]{36}$/);
    for (const p of [got.source.iconPath, got.source.imagePath, got.user.imagePath]) {
      expect(p === null || p.startsWith(`tool-images/${got.id}-`)).toBe(true);
    }
    expect(fs.existsSync(path.join(dst.dataDir, victim.source.iconPath!))).toBe(true);
    expect(dst.toolsStore.getById('victim')).not.toBeNull();
  });

  it('data URL с неразрешённым MIME не записывается', () => {
    const src = makeStore();
    seedTool(src, 'https://example.com/svg', 'tool-svg');
    const file = asFile(src);
    file.tools[0]!.iconDataUrl = 'data:image/bmp;base64,Qk0=';
    file.tools[0]!.coverDataUrl = 'data:text/html;base64,PGI+';
    const dst = makeStore();
    applyImport(dst.deps, file, 'merge');
    const got = dst.toolsStore.getByKey('example.com/svg')!;
    expect(got.source.iconPath).toBeNull();
    expect(got.source.imagePath).toBeNull();
  });

  it('дубликат ищется по key из normalizeToolUrl (регистр, www, UTM); предпросмотр считает их', () => {
    const src = makeStore();
    seedTool(src, 'https://example.com/a', 'tool-src');
    const file = asFile(src);
    file.tools[0]!.url = 'https://WWW.Example.com/a/?utm_source=x';
    const dst = makeStore();
    seedTool(dst, 'https://example.com/a', 'tool-dst');
    expect(previewImport(dst.store, dst.toolsStore, file).tools).toMatchObject({ total: 1, new: 0, duplicates: 1 });
    applyImport(dst.deps, file, 'merge');
    expect(dst.toolsStore.count()).toBe(1);
  });

  it('файл с повторяющимся адресом, неверным адресом или огромной картинкой отклоняется', () => {
    const src = makeStore();
    seedTool(src, 'https://example.com/a', 'tool-src');
    const file = asFile(src);
    const t0 = file.tools[0]!;
    expect(() => parseExportFile({ ...file, tools: [t0, { ...t0, id: 'other', url: 'https://example.com/a?utm_medium=1' }] })).toThrow(/дублируется/);
    expect(() => parseExportFile({ ...file, tools: [{ ...t0, url: 'ftp://x' }] })).toThrow(ValidationError);
    expect(() => parseExportFile({ ...file, tools: [{ ...t0, iconDataUrl: 'x'.repeat(5_000_000) }] })).toThrow(ValidationError);
  });

  it('skip не меняет локальный инструмент; merge сохраняет локальную картинку и объединяет заметки', () => {
    const src = makeStore();
    seedTool(src, 'https://example.com/a', 'tool-src', Buffer.from([7, 7, 7]));
    const file = asFile(src);
    file.tools[0]!.user.notes = 'Из файла';

    const dst = makeStore();
    seedTool(dst, 'https://example.com/a', 'tool-dst');
    const before = dst.toolsStore.getById('tool-dst');
    expect(applyImport(dst.deps, file, 'skip').tools.skipped).toBe(1);
    expect(dst.toolsStore.getById('tool-dst')).toEqual(before);

    expect(applyImport(dst.deps, file, 'merge').tools.merged).toBe(1);
    const got = dst.toolsStore.getById('tool-dst')!;
    expect(got.user.notes).toContain('Мои заметки');
    expect(got.user.notes).toContain('Из файла');
    expect(got.user.imagePath).toBe('tool-images/tool-dst-user.png');
    expect([...fs.readFileSync(path.join(dst.dataDir, got.user.imagePath!))]).toEqual([...PNG]);
  });

  it('replace заменяет запись целиком, сохраняя локальный id, и убирает файлы, которых нет в файле', () => {
    const src = makeStore();
    seedTool(src, 'https://example.com/a', 'tool-src');
    const file = asFile(src);
    file.tools[0]!.user.notes = 'Только импорт';
    file.tools[0]!.userImageDataUrl = null;

    const dst = makeStore();
    seedTool(dst, 'https://example.com/a', 'tool-dst');
    expect(applyImport(dst.deps, file, 'replace').tools.replaced).toBe(1);
    const got = dst.toolsStore.getByKey('example.com/a')!;
    expect(got.id).toBe('tool-dst');
    expect(got.user.notes).toBe('Только импорт');
    expect(got.user.imagePath).toBeNull();
    expect(fs.existsSync(path.join(dst.dataDir, 'tool-images', 'tool-dst-user.png'))).toBe(false);
    expect(got.source.iconPath).toBe('tool-images/tool-dst-icon.png');
  });
});
