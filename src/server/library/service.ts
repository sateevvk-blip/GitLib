import type { AnalysisData, ChatMessage, ChatReply, Collection, Facets, LibraryQuery, Repo, RepoSummary, UserPatch } from '../../shared/types.js';
import { normalizeRepoInput } from '../../shared/normalize.js';
import { computeFacets, searchRepos } from '../../shared/search.js';
import { applyAnalysis, applyGithubRefresh, applyUserPatch, emptyAnalysis, newUserData } from '../../shared/merge.js';
import type { LibraryStore } from './store.js';
import type { SettingsStore } from '../settings.js';
import { downloadAvatar, fetchRepository } from '../github/client.js';
import { analyzeRepo, chatAboutRepo } from '../ai/analyzer.js';
import { DuplicateError, NotFoundError, ValidationError } from '../errors.js';

export interface ServiceDeps {
  store: LibraryStore;
  settings: SettingsStore;
  /** Подменяются в тестах. */
  github?: { fetchRepository: typeof fetchRepository; downloadAvatar: typeof downloadAvatar };
  ai?: { analyzeRepo: typeof analyzeRepo; chatAboutRepo?: typeof chatAboutRepo };
  log?: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };
}

/**
 * Оркестрация сценариев: добавление, обновление, анализ, поиск.
 * AI-анализ выполняется в фоне и никогда не блокирует сохранение.
 */
export class LibraryService {
  private readonly store: LibraryStore;
  private readonly settings: SettingsStore;
  private readonly github: NonNullable<ServiceDeps['github']>;
  private readonly ai: { analyzeRepo: typeof analyzeRepo; chatAboutRepo: typeof chatAboutRepo };
  private readonly log: NonNullable<ServiceDeps['log']>;
  private readonly queue: string[] = [];
  private readonly queued = new Set<string>();
  private running = false;

  constructor(deps: ServiceDeps) {
    this.store = deps.store;
    this.settings = deps.settings;
    this.github = deps.github ?? { fetchRepository, downloadAvatar };
    this.ai = { analyzeRepo: deps.ai?.analyzeRepo ?? analyzeRepo, chatAboutRepo: deps.ai?.chatAboutRepo ?? chatAboutRepo };
    this.log = deps.log ?? { info: () => {}, warn: () => {}, error: () => {} };
  }

  // ---------- чтение ----------

  list(query: LibraryQuery): RepoSummary[] {
    const all = this.store.listSummaries();
    let collectionIds: Set<string> | undefined;
    if (query.collectionId) {
      const c = this.store.getCollection(query.collectionId);
      collectionIds = new Set(c?.repoIds ?? []);
    }
    return searchRepos(all, query, collectionIds);
  }

  facets(): Facets {
    return computeFacets(this.store.listSummaries());
  }

  get(id: string): Repo {
    const repo = this.store.getById(id);
    if (!repo) throw new NotFoundError('Репозиторий не найден в библиотеке');
    return repo;
  }

  // ---------- добавление / обновление ----------

  async add(input: string): Promise<Repo> {
    const ref = normalizeRepoInput(input);
    const existing = this.store.getByKey(ref.key);
    if (existing) throw new DuplicateError(`«${existing.fullName}» уже есть в библиотеке`, existing.id);

    const token = this.settings.get().githubToken;
    const fetched = await this.github.fetchRepository(ref.owner, ref.name, token);
    const canonicalKey = `${fetched.canonical.owner}/${fetched.canonical.name}`.toLowerCase();
    if (canonicalKey !== ref.key) {
      const byCanonical = this.store.getByKey(canonicalKey);
      if (byCanonical) {
        throw new DuplicateError(`«${byCanonical.fullName}» уже есть в библиотеке (репозиторий был переименован)`, byCanonical.id);
      }
    }
    const avatarPath = await this.github.downloadAvatar(fetched.github.ownerAvatarUrl, fetched.github.ownerLogin);
    const now = new Date().toISOString();
    const llmConfigured = this.settings.isLlmConfigured();
    const repo: Repo = {
      id: this.store.newId(),
      owner: fetched.canonical.owner,
      name: fetched.canonical.name,
      fullName: `${fetched.canonical.owner}/${fetched.canonical.name}`,
      key: canonicalKey,
      avatarPath,
      github: fetched.github,
      analysis: llmConfigured ? { ...emptyAnalysis(), status: 'pending' } : emptyAnalysis(),
      user: newUserData(now),
    };
    this.store.insert(repo);
    this.log.info(`Добавлен ${repo.fullName}`);
    if (llmConfigured) this.enqueueAnalysis(repo.id);
    return repo;
  }

  async refresh(id: string): Promise<Repo> {
    const repo = this.get(id);
    const token = this.settings.get().githubToken;
    const fetched = await this.github.fetchRepository(repo.owner, repo.name, token);
    const canonicalKey = `${fetched.canonical.owner}/${fetched.canonical.name}`.toLowerCase();
    if (canonicalKey !== repo.key) {
      const clash = this.store.getByKey(canonicalKey);
      if (clash && clash.id !== repo.id) {
        throw new DuplicateError(`Репозиторий переименован в «${clash.fullName}», который уже есть в библиотеке`, clash.id);
      }
    }
    const avatarPath = await this.github.downloadAvatar(fetched.github.ownerAvatarUrl, fetched.github.ownerLogin);
    const updated = applyGithubRefresh(repo, fetched.github, avatarPath, fetched.canonical);
    this.store.update(updated);
    this.log.info(`Обновлён ${updated.fullName}`);
    return updated;
  }

  updateUser(id: string, patch: UserPatch): Repo {
    const repo = this.get(id);
    let updated: Repo;
    try {
      updated = applyUserPatch(repo, patch);
    } catch (e) {
      throw new ValidationError((e as Error).message);
    }
    this.store.update(updated);
    return updated;
  }

  delete(id: string): void {
    if (!this.store.delete(id)) throw new NotFoundError('Репозиторий не найден в библиотеке');
  }

  // ---------- AI ----------

  /** Ставит анализ в очередь; возвращает запись со статусом pending. */
  requestAnalysis(id: string): Repo {
    const repo = this.get(id);
    if (!this.settings.isLlmConfigured()) {
      throw new ValidationError('LLM не настроена. Укажите Base URL и модель в настройках.');
    }
    const pending: AnalysisData = { ...repo.analysis, status: 'pending', error: null };
    this.store.updateAnalysis(id, pending);
    this.enqueueAnalysis(id);
    return { ...repo, analysis: pending };
  }

  /** Выполняет анализ синхронно (используется очередью и тестами). */
  async runAnalysis(id: string): Promise<Repo> {
    const repo = this.get(id);
    try {
      const analysis = await this.ai.analyzeRepo(repo, this.settings.get());
      const fresh = this.get(id);
      const updated = applyAnalysis(fresh, analysis);
      this.store.updateAnalysis(id, updated.analysis);
      this.log.info(`AI-анализ готов: ${repo.fullName}`);
      return updated;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const fresh = this.store.getById(id);
      if (!fresh) throw e;
      const failed: AnalysisData = { ...fresh.analysis, status: 'failed', error: message };
      this.store.updateAnalysis(id, failed);
      this.log.warn(`AI-анализ не удался для ${repo.fullName}: ${message}`);
      return { ...fresh, analysis: failed };
    }
  }

  /**
   * Уточняющий вопрос о репозитории. История приходит с клиента и нигде не сохраняется;
   * запись в библиотеке не меняется.
   */
  async chat(id: string, history: ChatMessage[]): Promise<ChatReply> {
    const repo = this.get(id);
    if (!this.settings.isLlmConfigured()) {
      throw new ValidationError('LLM не настроена. Укажите Base URL и модель в настройках.');
    }
    const last = history[history.length - 1];
    if (!last || last.role !== 'user' || !last.content.trim()) {
      throw new ValidationError('Последнее сообщение должно быть вопросом пользователя');
    }
    return this.ai.chatAboutRepo(repo, this.settings.get(), history);
  }

  /** После перезапуска: незавершённые анализы ставятся в очередь заново или сбрасываются. */
  recoverPending(): void {
    const pending = this.store.listSummaries().filter((r) => r.analysis.status === 'pending');
    if (pending.length === 0) return;
    if (this.settings.isLlmConfigured()) {
      for (const r of pending) this.enqueueAnalysis(r.id);
      this.log.info(`Возобновлено ${pending.length} AI-анализов`);
    } else {
      for (const r of pending) {
        this.store.updateAnalysis(r.id, { ...r.analysis, status: r.analysis.summary ? 'done' : 'none', error: null });
      }
    }
  }

  pendingCount(): number {
    return this.queue.length + (this.running ? 1 : 0);
  }

  private enqueueAnalysis(id: string): void {
    if (this.queued.has(id)) return;
    this.queued.add(id);
    this.queue.push(id);
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length > 0) {
        const id = this.queue.shift()!;
        this.queued.delete(id);
        if (!this.store.getById(id)) continue;
        await this.runAnalysis(id);
      }
    } finally {
      this.running = false;
    }
  }

  // ---------- коллекции ----------

  listCollections(): Collection[] {
    return this.store.listCollections();
  }

  createCollection(name: string, description = ''): Collection {
    const clean = name.trim();
    if (!clean) throw new ValidationError('Название коллекции не может быть пустым');
    if (this.store.findCollectionByName(clean)) throw new ValidationError(`Коллекция «${clean}» уже существует`);
    const now = new Date().toISOString();
    return this.store.insertCollection({
      id: this.store.newId(),
      name: clean,
      description: description.trim(),
      repoIds: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  updateCollection(id: string, patch: { name?: string; description?: string; repoIds?: string[] }): Collection {
    const c = this.store.getCollection(id);
    if (!c) throw new NotFoundError('Коллекция не найдена');
    const next: Collection = { ...c, updatedAt: new Date().toISOString() };
    if (patch.name !== undefined) {
      const clean = patch.name.trim();
      if (!clean) throw new ValidationError('Название коллекции не может быть пустым');
      const clash = this.store.findCollectionByName(clean);
      if (clash && clash.id !== id) throw new ValidationError(`Коллекция «${clean}» уже существует`);
      next.name = clean;
    }
    if (patch.description !== undefined) next.description = patch.description.trim();
    if (patch.repoIds !== undefined) next.repoIds = [...new Set(patch.repoIds)];
    return this.store.updateCollection(next);
  }

  deleteCollection(id: string): void {
    if (!this.store.deleteCollection(id)) throw new NotFoundError('Коллекция не найдена');
  }

  setRepoInCollection(collectionId: string, repoId: string, inCollection: boolean): Collection {
    const c = this.store.getCollection(collectionId);
    if (!c) throw new NotFoundError('Коллекция не найдена');
    this.get(repoId);
    const ids = new Set(c.repoIds);
    if (inCollection) ids.add(repoId);
    else ids.delete(repoId);
    return this.store.updateCollection({ ...c, repoIds: [...ids], updatedAt: new Date().toISOString() });
  }
}
