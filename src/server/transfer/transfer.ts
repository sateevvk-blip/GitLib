import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  Collection,
  DuplicateStrategy,
  ExportFile,
  ExportedRepo,
  ExportedTool,
  ImportPreview,
  ImportResult,
  Repo,
  Tool,
} from '../../shared/types.js';
import { EXPORT_FORMAT, EXPORT_VERSION } from '../../shared/types.js';
import { mergeCollection, mergeImportedRepo, mergeImportedTool, settlePendingAnalysis } from '../../shared/merge.js';
import { normalizeToolUrl } from '../../shared/tool-url.js';
import { config } from '../config.js';
import { IMAGE_EXT } from '../tools/fetcher.js';
import type { LibraryStore } from '../library/store.js';
import type { ToolsStore } from '../tools/store.js';
import { ValidationError } from '../errors.js';
import { ExportFileSchema, type ValidExportFile } from './schema.js';

export interface TransferDeps {
  store: LibraryStore;
  toolsStore: ToolsStore;
  dataDir: string;
  appVersion: string;
}

type ImportedTool = ValidExportFile['tools'][number];
type ToolImageKind = 'icon' | 'cover' | 'user';

const ID_RE = /^[\w-]+$/;

/** Побочные эффекты на диске откладываются до COMMIT: при откате базы файлы остаются как были. */
interface FileOps {
  writes: Array<{ tmp: string; final: string }>;
  removes: string[];
}

/** Дубликат — только по key из url записи; finalUrl не ищется (S2). */
function findLocalTool(store: ToolsStore, t: ImportedTool): Tool | null {
  return store.getByKey(normalizeToolUrl(t.url).key);
}

/** Готовит картинку инструмента под именем от ЛОКАЛЬНОГО id (во временный файл); MIME — из списка fetcher.ts, размер — по виду картинки. */
function writeToolImage(dataDir: string, ops: FileOps, id: string, kind: ToolImageKind, dataUrl: string | null | undefined): string | null {
  if (!dataUrl || !ID_RE.test(id)) return null;
  const m = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i);
  const ext = m && IMAGE_EXT[m[1]!.toLowerCase()];
  if (!m || !ext) return null;
  const buf = Buffer.from(m[2]!, 'base64');
  if (buf.length === 0 || buf.length > (kind === 'icon' ? config.toolFaviconMaxBytes : config.toolPreviewMaxBytes)) return null;
  const rel = `tool-images/${id}-${kind}.${ext}`;
  const tmp = path.join(dataDir, 'tool-images', `.import-${randomUUID()}.tmp`);
  try {
    fs.mkdirSync(path.join(dataDir, 'tool-images'), { recursive: true });
    fs.writeFileSync(tmp, buf);
  } catch {
    return null;
  }
  ops.writes.push({ tmp, final: path.join(dataDir, rel) });
  return rel;
}

function removeFileSafe(abs: string): void {
  try {
    fs.rmSync(abs, { force: true });
  } catch {
    // файл занят — запись в БД важнее
  }
}

/** Вызывается после COMMIT. */
function commitFileOps(dataDir: string, ops: FileOps): void {
  for (const w of ops.writes) {
    try {
      fs.renameSync(w.tmp, w.final);
    } catch {
      // shortcut: при неудачном rename (файл занят в Windows) в базе остаётся путь к несуществующей картинке, данные целы; пересмотреть, если такое случится на практике
      removeFileSafe(w.tmp);
    }
  }
  const root = path.resolve(dataDir, 'tool-images');
  for (const rel of ops.removes) {
    const abs = path.resolve(dataDir, rel);
    if (abs.startsWith(root + path.sep)) removeFileSafe(abs);
  }
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon', svg: 'image/svg+xml',
};

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

/** Как writeToolImage: файл ложится на место только после COMMIT, при откате импорта аватар остаётся прежним. */
function writeAvatarFromDataUrl(dataDir: string, ops: FileOps, dataUrl: string | null | undefined, ownerLogin: string): string | null {
  if (!dataUrl) return null;
  const m = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
  if (!m) return null;
  const mime = m[1]!.toLowerCase();
  const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/gif' ? 'gif' : mime === 'image/webp' ? 'webp' : 'png';
  const safe = ownerLogin.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const rel = `avatars/${safe}.${ext}`;
  const tmp = path.join(dataDir, 'avatars', `.import-${randomUUID()}.tmp`);
  try {
    const buf = Buffer.from(m[2]!, 'base64');
    if (buf.length === 0 || buf.length > 2_000_000) return null;
    fs.mkdirSync(path.join(dataDir, 'avatars'), { recursive: true });
    fs.writeFileSync(tmp, buf);
    ops.writes.push({ tmp, final: path.join(dataDir, rel) });
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
    tools: deps.toolsStore.listAll().map((t) => ({
      ...t,
      iconDataUrl: readAvatarDataUrl(deps.dataDir, t.source.iconPath),
      coverDataUrl: readAvatarDataUrl(deps.dataDir, t.source.imagePath),
      userImageDataUrl: readAvatarDataUrl(deps.dataDir, t.user.imagePath),
    })) satisfies ExportedTool[],
  };
}

export function parseExportFile(input: unknown): ExportFile {
  if (typeof input !== 'object' || input === null) throw new ValidationError('Файл импорта должен содержать JSON-объект');
  const obj = input as Record<string, unknown>;
  if (obj.format !== EXPORT_FORMAT) {
    throw new ValidationError(`Это не файл библиотеки GitLib (ожидается format = "${EXPORT_FORMAT}")`);
  }
  if (obj.version !== 1 && obj.version !== EXPORT_VERSION) {
    throw new ValidationError(`Неподдерживаемая версия формата: ${String(obj.version)} (поддерживается 1–${EXPORT_VERSION})`);
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
    // key из файла не читается (как у инструментов): считается из owner/name той же формулой, что при добавлении.
    r.key = `${r.owner}/${r.name}`.toLowerCase();
    const k = r.key;
    if (seen.has(k)) throw new ValidationError(`В файле импорта дублируется репозиторий ${r.fullName}`);
    seen.add(k);
  }
  const seenTools = new Set<string>();
  for (const t of data.tools) {
    let key: string;
    try {
      key = normalizeToolUrl(t.url).key;
    } catch (e) {
      throw new ValidationError(`Файл импорта не прошёл проверку (tools): некорректный адрес «${t.url.slice(0, 100)}»${e instanceof Error ? ` — ${e.message}` : ''}`);
    }
    if (seenTools.has(key)) throw new ValidationError(`В файле импорта дублируется инструмент ${t.url.slice(0, 100)}`);
    seenTools.add(key);
  }
  return data as unknown as ExportFile;
}

export function previewImport(store: LibraryStore, toolsStore: ToolsStore, file: ExportFile): ImportPreview {
  const existingKeys = new Set(store.listSummaries().map((r) => r.key));
  const duplicateNames: string[] = [];
  let fresh = 0;
  for (const r of file.repos) {
    if (existingKeys.has(r.key.toLowerCase())) duplicateNames.push(r.fullName);
    else fresh += 1;
  }
  let existingCollections = 0;
  for (const c of file.collections) if (store.findCollectionByName(c.name)) existingCollections += 1;
  const toolDuplicates = (file.tools as unknown as ImportedTool[]).filter((t) => findLocalTool(toolsStore, t));
  return {
    tools: {
      total: file.tools.length,
      new: file.tools.length - toolDuplicates.length,
      duplicates: toolDuplicates.length,
      duplicateNames: toolDuplicates.map((t) => t.user.title ?? t.source.title ?? t.url),
    },
    version: file.version,
    exportedAt: file.exportedAt,
    repos: { total: file.repos.length, new: fresh, duplicates: duplicateNames.length, duplicateNames },
    collections: { total: file.collections.length, new: file.collections.length - existingCollections, existing: existingCollections },
  };
}


export function applyImport(deps: TransferDeps, file: ExportFile, strategy: DuplicateStrategy): ImportResult {
  const { store } = deps;
  const result: ImportResult = {
    added: 0, merged: 0, replaced: 0, skipped: 0, collectionsCreated: 0, collectionsUpdated: 0,
    tools: { added: 0, merged: 0, replaced: 0, skipped: 0 },
  };
  /** id из файла → id в локальной базе */
  const idMap = new Map<string, string>();

  const ops: FileOps = { writes: [], removes: [] };
  try {
    store.transaction(() => {
      for (const imported of file.repos) {
        const key = imported.key.toLowerCase();
        const local = store.getByKey(key);
        if (local && strategy === 'skip') {
          idMap.set(imported.id, local.id);
          result.skipped += 1;
          continue;
        }
        const { avatarDataUrl, ...repoFields } = imported;
        // merge оставляет локальный аватар — тогда файл из импорта не должен его перезаписывать.
        const keepLocalAvatar = local && strategy === 'merge' && local.avatarPath;
        const avatarFromFile = keepLocalAvatar ? null : writeAvatarFromDataUrl(deps.dataDir, ops, avatarDataUrl, imported.github.ownerLogin);
        const candidate: Repo = { ...repoFields, key, avatarPath: avatarFromFile ?? null, analysis: settlePendingAnalysis(imported.analysis) };

        if (!local) {
          const existingId = store.getById(candidate.id);
          const id = existingId ? store.newId() : candidate.id;
          store.insert({ ...candidate, id });
          idMap.set(imported.id, id);
          result.added += 1;
          continue;
        }
        idMap.set(imported.id, local.id);
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

      for (const imported of file.tools as unknown as ImportedTool[]) importTool(deps, imported, strategy, result, ops);
    });
  } catch (e) {
    for (const w of ops.writes) removeFileSafe(w.tmp);
    throw e;
  }
  commitFileOps(deps.dataDir, ops);
  return result;
}

function importTool(deps: TransferDeps, imported: ImportedTool, strategy: DuplicateStrategy, result: ImportResult, ops: FileOps): void {
  const { toolsStore, dataDir } = deps;
  const local = findLocalTool(toolsStore, imported);
  if (local && strategy === 'skip') {
    result.tools.skipped += 1;
    return;
  }
  // id из файла и пути картинок не используются: запись получает локальный id, пути строятся из него.
  const id = local?.id ?? randomUUID();
  const { key, url, domain } = normalizeToolUrl(imported.url);
  const candidate: Tool = {
    id,
    url,
    key,
    domain,
    source: { ...imported.source, iconPath: null, imagePath: null },
    analysis: settlePendingAnalysis(imported.analysis),
    user: { ...imported.user, imagePath: null },
  };
  const w = (kind: ToolImageKind, dataUrl: string | null | undefined) => writeToolImage(dataDir, ops, id, kind, dataUrl);

  if (!local) {
    toolsStore.insert({
      ...candidate,
      source: { ...candidate.source, iconPath: w('icon', imported.iconDataUrl), imagePath: w('cover', imported.coverDataUrl) },
      user: { ...candidate.user, imagePath: w('user', imported.userImageDataUrl) },
    });
    result.tools.added += 1;
    return;
  }

  const merged = mergeImportedTool(local, candidate, strategy);
  const replace = strategy === 'replace';
  // merge: файлы раскладываются тому блоку, чьи данные победили; у локального остаются его файлы.
  const fromFile = replace || merged.source === candidate.source;
  const keepLocal = (p: string | null) => (replace ? null : p);
  const iconPath = fromFile ? (w('icon', imported.iconDataUrl) ?? keepLocal(local.source.iconPath)) : local.source.iconPath;
  const imagePath = fromFile ? (w('cover', imported.coverDataUrl) ?? keepLocal(local.source.imagePath)) : local.source.imagePath;
  const userImage = replace ? w('user', imported.userImageDataUrl) : (local.user.imagePath ?? w('user', imported.userImageDataUrl));

  toolsStore.update({ ...merged, id, source: { ...merged.source, iconPath, imagePath }, user: { ...merged.user, imagePath: userImage } });
  const kept = new Set([iconPath, imagePath, userImage]);
  for (const old of [local.source.iconPath, local.source.imagePath, local.user.imagePath]) if (old && !kept.has(old)) ops.removes.push(old);
  if (replace) result.tools.replaced += 1;
  else result.tools.merged += 1;
}
