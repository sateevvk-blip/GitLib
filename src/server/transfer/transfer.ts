import fs from 'node:fs';
import path from 'node:path';
import type {
  Collection,
  DuplicateStrategy,
  ExportFile,
  ExportedRepo,
  ImportPreview,
  ImportResult,
  Repo,
} from '../../shared/types.js';
import { EXPORT_FORMAT, EXPORT_VERSION } from '../../shared/types.js';
import { mergeCollection, mergeImportedRepo } from '../../shared/merge.js';
import type { LibraryStore } from '../library/store.js';
import { ValidationError } from '../errors.js';
import { ExportFileSchema } from './schema.js';

export interface TransferDeps {
  store: LibraryStore;
  dataDir: string;
  appVersion: string;
}

const MIME_BY_EXT: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

function readAvatarDataUrl(dataDir: string, avatarPath: string | null): string | null {
  if (!avatarPath) return null;
  try {
    const abs = path.join(dataDir, avatarPath);
    const buf = fs.readFileSync(abs);
    const ext = path.extname(abs).slice(1).toLowerCase();
    const mime = MIME_BY_EXT[ext] ?? 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

function writeAvatarFromDataUrl(dataDir: string, dataUrl: string | null | undefined, ownerLogin: string): string | null {
  if (!dataUrl) return null;
  const m = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
  if (!m) return null;
  const mime = m[1]!.toLowerCase();
  const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/gif' ? 'gif' : mime === 'image/webp' ? 'webp' : 'png';
  const safe = ownerLogin.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const rel = `avatars/${safe}.${ext}`;
  try {
    const buf = Buffer.from(m[2]!, 'base64');
    if (buf.length === 0 || buf.length > 2_000_000) return null;
    fs.mkdirSync(path.join(dataDir, 'avatars'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, rel), buf);
    return rel;
  } catch {
    return null;
  }
}

export function buildExport(deps: TransferDeps): ExportFile {
  const repos: ExportedRepo[] = deps.store.listAll().map((r) => ({
    ...r,
    avatarDataUrl: readAvatarDataUrl(deps.dataDir, r.avatarPath),
  }));
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    app: `GitLib ${deps.appVersion}`,
    repos,
    collections: deps.store.listCollections(),
  };
}

export function parseExportFile(input: unknown): ExportFile {
  if (typeof input !== 'object' || input === null) throw new ValidationError('Файл импорта должен содержать JSON-объект');
  const obj = input as Record<string, unknown>;
  if (obj.format !== EXPORT_FORMAT) {
    throw new ValidationError(`Это не файл библиотеки GitLib (ожидается format = "${EXPORT_FORMAT}")`);
  }
  if (obj.version !== EXPORT_VERSION) {
    throw new ValidationError(`Неподдерживаемая версия формата: ${String(obj.version)} (поддерживается ${EXPORT_VERSION})`);
  }
  const parsed = ExportFileSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue ? issue.path.join('.') : '';
    throw new ValidationError(`Файл импорта не прошёл проверку${where ? ` (${where})` : ''}: ${issue?.message ?? 'неизвестная ошибка'}`);
  }
  const data = parsed.data;
  const seen = new Set<string>();
  for (const r of data.repos) {
    const k = r.key.toLowerCase();
    if (seen.has(k)) throw new ValidationError(`В файле импорта дублируется репозиторий ${r.fullName}`);
    seen.add(k);
  }
  return data as ExportFile;
}

export function previewImport(store: LibraryStore, file: ExportFile): ImportPreview {
  const existingKeys = new Set(store.listSummaries().map((r) => r.key));
  const duplicateNames: string[] = [];
  let fresh = 0;
  for (const r of file.repos) {
    if (existingKeys.has(r.key.toLowerCase())) duplicateNames.push(r.fullName);
    else fresh += 1;
  }
  let existingCollections = 0;
  for (const c of file.collections) if (store.findCollectionByName(c.name)) existingCollections += 1;
  return {
    version: file.version,
    exportedAt: file.exportedAt,
    repos: { total: file.repos.length, new: fresh, duplicates: duplicateNames.length, duplicateNames },
    collections: { total: file.collections.length, new: file.collections.length - existingCollections, existing: existingCollections },
  };
}

export function applyImport(deps: TransferDeps, file: ExportFile, strategy: DuplicateStrategy): ImportResult {
  const { store } = deps;
  const result: ImportResult = { added: 0, merged: 0, replaced: 0, skipped: 0, collectionsCreated: 0, collectionsUpdated: 0 };
  /** id из файла → id в локальной базе */
  const idMap = new Map<string, string>();

  store.transaction(() => {
    for (const imported of file.repos) {
      const key = imported.key.toLowerCase();
      const local = store.getByKey(key);
      const { avatarDataUrl, ...repoFields } = imported;
      const avatarFromFile = writeAvatarFromDataUrl(deps.dataDir, avatarDataUrl, imported.github.ownerLogin);
      const candidate: Repo = { ...repoFields, key, avatarPath: avatarFromFile ?? null };

      if (!local) {
        const existingId = store.getById(candidate.id);
        const id = existingId ? store.newId() : candidate.id;
        store.insert({ ...candidate, id });
        idMap.set(imported.id, id);
        result.added += 1;
        continue;
      }
      idMap.set(imported.id, local.id);
      if (strategy === 'skip') {
        result.skipped += 1;
        continue;
      }
      const merged = mergeImportedRepo(local, candidate, strategy);
      store.update(merged);
      if (strategy === 'replace') result.replaced += 1;
      else result.merged += 1;
    }

    for (const c of file.collections) {
      const local = store.findCollectionByName(c.name);
      if (!local) {
        const repoIds = c.repoIds.map((id) => idMap.get(id)).filter((x): x is string => Boolean(x));
        const created: Collection = {
          id: store.getCollection(c.id) ? store.newId() : c.id,
          name: c.name.trim(),
          description: c.description,
          repoIds: [...new Set(repoIds)],
          createdAt: c.createdAt,
          updatedAt: new Date().toISOString(),
        };
        store.insertCollection(created);
        result.collectionsCreated += 1;
      } else {
        const merged = mergeCollection(local, c, idMap, strategy === 'skip' ? 'merge' : strategy);
        store.updateCollection(merged);
        result.collectionsUpdated += 1;
      }
    }
  });
  return result;
}
