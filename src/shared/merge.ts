/**
 * Правила слияния данных. Единственное место, где решается, что перезаписывается, а что нет.
 */
import type { AnalysisData, Collection, GithubData, Repo, UserData, DuplicateStrategy, UserPatch } from './types.js';
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
  const pickAnalysis = (): AnalysisData => {
    if (local.analysis.status !== 'done' && imported.analysis.status === 'done') return imported.analysis;
    if (local.analysis.status === 'done' && imported.analysis.status === 'done') {
      return (imported.analysis.generatedAt ?? '') > (local.analysis.generatedAt ?? '') ? imported.analysis : local.analysis;
    }
    return local.analysis;
  };
  const localNotes = local.user.notes.trim();
  const importedNotes = imported.user.notes.trim();
  let notes = local.user.notes;
  if (!localNotes) notes = imported.user.notes;
  else if (importedNotes && importedNotes !== localNotes && !localNotes.includes(importedNotes)) {
    notes = `${local.user.notes.trimEnd()}${IMPORT_NOTES_SEPARATOR}${importedNotes}`;
  }
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
    analysis: pickAnalysis(),
    avatarPath: local.avatarPath ?? imported.avatarPath,
    user,
  };
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
