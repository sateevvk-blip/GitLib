/**
 * Правила слияния данных. Единственное место, где решается, что перезаписывается, а что нет.
 */
import type {
  AnalysisData,
  Collection,
  GithubData,
  Repo,
  UserData,
  DuplicateStrategy,
  UserPatch,
  Tool,
  ToolAnalysis,
  ToolOverrides,
  ToolPatch,
  ToolSource,
  ToolUser,
} from './types.js';
import { REPO_STATUSES } from './types.js';

export function emptyAnalysis(): AnalysisData {
  return { status: 'none', summary: null, useCases: [], suggestedTopics: [], model: null, generatedAt: null, error: null };
}

export function newUserData(now = new Date().toISOString()): UserData {
  return { notes: '', topics: [], status: 'inbox', favorite: false, addedAt: now, updatedAt: now };
}

export function normalizeTopicList(topics: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of topics) {
    const t = String(raw ?? '').trim().replace(/\s+/g, ' ');
    if (!t) continue;
    const k = t.toLocaleLowerCase('ru-RU');
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/** Обновление GitHub-данных: заменяется только блок github и аватар. */
export function applyGithubRefresh(
  repo: Repo,
  github: GithubData,
  avatarPath: string | null,
  canonical?: { owner: string; name: string },
): Repo {
  const owner = canonical?.owner ?? repo.owner;
  const name = canonical?.name ?? repo.name;
  const fullName = `${owner}/${name}`;
  return { ...repo, owner, name, fullName, key: fullName.toLowerCase(), github, avatarPath: avatarPath ?? repo.avatarPath };
}

/** Повторный AI-анализ: заменяется только блок analysis. */
export function applyAnalysis(repo: Repo, analysis: AnalysisData): Repo {
  return { ...repo, analysis };
}

export function applyUserPatch(repo: Repo, patch: UserPatch, now = new Date().toISOString()): Repo {
  const user: UserData = { ...repo.user };
  if (patch.notes !== undefined) user.notes = String(patch.notes);
  if (patch.topics !== undefined) user.topics = normalizeTopicList(patch.topics);
  if (patch.status !== undefined) {
    if (!REPO_STATUSES.includes(patch.status)) throw new Error(`Неизвестный статус: ${patch.status}`);
    user.status = patch.status;
  }
  if (patch.favorite !== undefined) user.favorite = Boolean(patch.favorite);
  user.updatedAt = now;
  return { ...repo, user };
}

export const IMPORT_NOTES_SEPARATOR = '\n\n— — — Заметки из импорта — — —\n';

const STATUS_RANK: Record<string, number> = { inbox: 0, parked: 1, try: 2, using: 3 };

/**
 * Слияние при импорте дубликата. Ни одно пользовательское поле не теряется молча:
 * заметки объединяются, темы — объединение, избранное — ИЛИ, статус — более «продвинутый».
 */
export function mergeImportedRepo(local: Repo, imported: Repo, strategy: DuplicateStrategy): Repo {
  if (strategy === 'skip') return local;
  if (strategy === 'replace') {
    return { ...imported, id: local.id, avatarPath: imported.avatarPath ?? local.avatarPath };
  }
  const github = (imported.github.fetchedAt ?? '') > (local.github.fetchedAt ?? '') ? imported.github : local.github;
  const notes = mergeNotes(local.user.notes, imported.user.notes);
  const status =
    (STATUS_RANK[imported.user.status] ?? 0) > (STATUS_RANK[local.user.status] ?? 0) ? imported.user.status : local.user.status;
  const user: UserData = {
    notes,
    topics: normalizeTopicList([...local.user.topics, ...imported.user.topics]),
    status,
    favorite: local.user.favorite || imported.user.favorite,
    addedAt: local.user.addedAt < imported.user.addedAt ? local.user.addedAt : imported.user.addedAt,
    updatedAt: new Date().toISOString(),
  };
  return {
    ...local,
    github,
    analysis: pickAnalysis(local.analysis, imported.analysis),
    avatarPath: local.avatarPath ?? imported.avatarPath,
    user,
  };
}

/** Заметки при импорте: пустые заменяются, разные — склеиваются, повтор не дублируется. */
function mergeNotes(local: string, imported: string): string {
  const l = local.trim();
  const i = imported.trim();
  if (!l) return imported;
  if (i && i !== l && !l.includes(i)) return `${local.trimEnd()}${IMPORT_NOTES_SEPARATOR}${i}`;
  return local;
}

/** Готовый анализ побеждает неготовый; из двух готовых — более свежий. */
function pickAnalysis<A extends { status: string; generatedAt: string | null }>(local: A, imported: A): A {
  if (local.status !== 'done' && imported.status === 'done') return imported;
  if (local.status === 'done' && imported.status === 'done') {
    return (imported.generatedAt ?? '') > (local.generatedAt ?? '') ? imported : local;
  }
  return local;
}

// ───── Инструменты ─────

export function emptyToolAnalysis(): ToolAnalysis {
  return {
    status: 'none',
    summary: null,
    purpose: null,
    audience: null,
    features: [],
    useCases: [],
    limitations: [],
    suggestedTags: [],
    suggestedCategory: null,
    model: null,
    generatedAt: null,
    error: null,
    basedOn: null,
  };
}

export function newToolUser(now = new Date().toISOString()): ToolUser {
  return {
    title: null,
    description: null,
    category: null,
    tags: [],
    notes: '',
    favorite: false,
    confirmed: false,
    imagePath: null,
    overrides: {},
    addedAt: now,
    updatedAt: now,
  };
}

/** Обновление страницы: заменяется только блок source. */
export function applyToolSource(tool: Tool, source: ToolSource): Tool {
  return { ...tool, source };
}

/** Повторный анализ: заменяется только блок analysis; user.overrides не читается и не пишется. */
export function applyToolAnalysis(tool: Tool, analysis: ToolAnalysis): Tool {
  return { ...tool, analysis };
}

const OVERRIDE_FIELDS = ['summary', 'purpose', 'audience', 'features', 'useCases', 'limitations'] as const;
const blankToNull = (v: string | null): string | null => v?.trim() || null;
const cleanList = (list: string[]): string[] => list.map((s) => String(s ?? '').trim()).filter(Boolean);

export function applyToolPatch(tool: Tool, patch: ToolPatch, now = new Date().toISOString()): Tool {
  const user: ToolUser = { ...tool.user };
  if (patch.title !== undefined) user.title = blankToNull(patch.title);
  if (patch.description !== undefined) user.description = blankToNull(patch.description);
  if (patch.category !== undefined) user.category = blankToNull(patch.category);
  if (patch.tags !== undefined) user.tags = normalizeTopicList(patch.tags);
  if (patch.notes !== undefined) user.notes = String(patch.notes);
  if (patch.favorite !== undefined) user.favorite = Boolean(patch.favorite);
  if (patch.confirmed !== undefined) user.confirmed = Boolean(patch.confirmed);
  if (patch.overrides !== undefined) {
    const o: Record<string, unknown> = { ...user.overrides };
    for (const field of OVERRIDE_FIELDS) {
      const value = patch.overrides[field];
      if (value === undefined) continue;
      // null и пустая строка снимают правку; пустой список — осознанная правка «ничего нет».
      const next = Array.isArray(value) ? cleanList(value) : typeof value === 'string' ? value.trim() : null;
      if (next === null || next === '') delete o[field];
      else o[field] = next;
    }
    user.overrides = o as ToolOverrides;
  }
  user.updatedAt = now;
  return { ...tool, user };
}

/** Своя картинка: меняется только user.imagePath (файл скачивает сервис). */
export function applyToolImage(tool: Tool, imagePath: string | null, now = new Date().toISOString()): Tool {
  return { ...tool, user: { ...tool.user, imagePath, updatedAt: now } };
}

/**
 * Слияние инструмента при импорте дубликата (тот же key). Адрес и id остаются локальными.
 * Заметки склеиваются, теги объединяются, избранное и confirmed — ИЛИ, правки overrides — локальные
 * приоритетнее, недостающие берутся из файла; source и analysis — более свежие.
 * Пути картинок в source/user.imagePath принадлежат записи-победителю: файлы раскладывает импорт (T8).
 */
export function mergeImportedTool(local: Tool, imported: Tool, strategy: DuplicateStrategy): Tool {
  if (strategy === 'skip') return local;
  if (strategy === 'replace') return { ...imported, id: local.id };
  const source = (imported.source.fetchedAt ?? '') > (local.source.fetchedAt ?? '') ? imported.source : local.source;
  const localOverrides = Object.fromEntries(Object.entries(local.user.overrides).filter(([, v]) => v !== undefined));
  const user: ToolUser = {
    title: local.user.title ?? imported.user.title,
    description: local.user.description ?? imported.user.description,
    category: local.user.category ?? imported.user.category,
    tags: normalizeTopicList([...local.user.tags, ...imported.user.tags]),
    notes: mergeNotes(local.user.notes, imported.user.notes),
    favorite: local.user.favorite || imported.user.favorite,
    confirmed: local.user.confirmed || imported.user.confirmed,
    imagePath: local.user.imagePath ?? imported.user.imagePath,
    overrides: { ...imported.user.overrides, ...localOverrides },
    addedAt: local.user.addedAt < imported.user.addedAt ? local.user.addedAt : imported.user.addedAt,
    updatedAt: new Date().toISOString(),
  };
  return { ...local, source, analysis: pickAnalysis(local.analysis, imported.analysis), user };
}

export function mergeCollection(
  local: Collection,
  imported: Collection,
  idMap: Map<string, string>,
  strategy: DuplicateStrategy,
): Collection {
  const mappedIds = imported.repoIds.map((id) => idMap.get(id)).filter((x): x is string => Boolean(x));
  if (strategy === 'replace') {
    return { ...local, description: imported.description, repoIds: [...new Set(mappedIds)], updatedAt: new Date().toISOString() };
  }
  const repoIds = [...new Set([...local.repoIds, ...mappedIds])];
  return {
    ...local,
    description: local.description || imported.description,
    repoIds,
    updatedAt: new Date().toISOString(),
  };
}
