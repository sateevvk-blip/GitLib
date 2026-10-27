import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyImport, buildExport, parseExportFile, previewImport } from '../src/server/transfer/transfer.js';
import { ValidationError } from '../src/server/errors.js';
import { EXPORT_FORMAT, EXPORT_VERSION, type ExportFile } from '../src/shared/types.js';
import { makeRepo, makeStore } from './helpers.js';

function seeded() {
  const { store, dataDir } = makeStore();
  const a = makeRepo('octo/alpha', {
    user: { notes: 'Локальные заметки', topics: ['local'], status: 'using', favorite: true, addedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  });
  const b = makeRepo('octo/beta');
  store.insert(a);
  store.insert(b);
  const col = store.insertCollection({ id: 'col-1', name: 'Инструменты', description: '', repoIds: [a.id], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
  return { store, dataDir, a, b, col };
}

describe('экспорт', () => {
  it('формирует файл с версией формата, всеми записями, README, аватарами и коллекциями', () => {
    const { store, dataDir, a } = seeded();
    fs.mkdirSync(path.join(dataDir, 'avatars'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'avatars', 'octo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    store.update({ ...a, avatarPath: 'avatars/octo.png' });

    const file = buildExport({ store, dataDir, appVersion: '1.0.0' });
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

describe('валидация импорта', () => {
  it('отклоняет чужой формат, неверную версию и битую структуру', () => {
    expect(() => parseExportFile({ foo: 1 })).toThrow(ValidationError);
    expect(() => parseExportFile({ format: EXPORT_FORMAT, version: 99, repos: [] })).toThrow(/версия/);
    expect(() => parseExportFile({ format: EXPORT_FORMAT, version: 1, repos: [{ id: 'x' }] })).toThrow(ValidationError);
    expect(() => parseExportFile('string')).toThrow(ValidationError);
  });

  it('отклоняет файл с дубликатами внутри', () => {
    const { store, dataDir } = seeded();
    const file = buildExport({ store, dataDir, appVersion: '1.0.0' });
    file.repos.push({ ...file.repos[0]!, id: 'other', fullName: 'OCTO/ALPHA', key: 'octo/alpha' });
    expect(() => parseExportFile(JSON.parse(JSON.stringify(file)))).toThrow(/дублируется/);
  });
});

describe('импорт', () => {
  function exportFrom(seed: ReturnType<typeof seeded>): ExportFile {
    return JSON.parse(JSON.stringify(buildExport({ store: seed.store, dataDir: seed.dataDir, appVersion: '1.0.0' }))) as ExportFile;
  }

  it('предпросмотр считает новые записи и дубликаты без учёта регистра', () => {
    const source = seeded();
    const file = exportFrom(source);
    file.repos[0]!.fullName = 'OCTO/ALPHA';
    file.repos[0]!.key = 'OCTO/ALPHA';
    file.repos.push(makeRepo('someone/new'));

    const target = seeded();
    const preview = previewImport(target.store, file);
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

    const { store, dataDir } = makeStore();
    const result = applyImport({ store, dataDir, appVersion: '1.0.0' }, file, 'merge');
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
    const result = applyImport({ store: target.store, dataDir: target.dataDir, appVersion: '1.0.0' }, file, 'skip');
    expect(result).toMatchObject({ added: 0, skipped: 2 });
    expect(target.store.getByKey('octo/alpha')).toEqual(before);
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
    const result = applyImport({ store: target.store, dataDir: target.dataDir, appVersion: '1.0.0' }, file, 'merge');
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
    const result = applyImport({ store: target.store, dataDir: target.dataDir, appVersion: '1.0.0' }, file, 'replace');
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
    applyImport({ store: target.store, dataDir: target.dataDir, appVersion: '1.0.0' }, file, 'merge');
    const cols = target.store.listCollections();
    expect(cols).toHaveLength(1);
    expect(cols[0]!.repoIds.sort()).toEqual([target.a.id, target.b.id].sort());
  });
});
