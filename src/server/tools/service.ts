import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { TOOL_CATEGORIES } from '../../shared/types.js';
import type { ChatMessage, ChatReply, Tool, ToolAnalysis, ToolFacets, ToolPatch, ToolQuery, ToolRecommendation, ToolSource, ToolSummary } from '../../shared/types.js';
import { normalizeToolUrl } from '../../shared/tool-url.js';
import { computeToolFacets, scoreTools, searchTools } from '../../shared/tools-search.js';
import { applyToolAnalysis, applyToolImage, applyToolPatch, applyToolSource, emptyToolAnalysis, newToolUser, settlePendingAnalysis } from '../../shared/merge.js';
import type { ToolsStore } from './store.js';
import type { SettingsStore } from '../settings.js';
import type { ServiceDeps } from '../library/service.js';
import { JobQueue } from '../library/queue.js';
import { fetchImage, fetchPage, type FetchOpts } from './fetcher.js';
import { extractPage, type ExtractedPage } from './extract.js';
import { analyzeTool, chatAboutTool, rankTools } from '../ai/tool-analyzer.js';
import { assertCanChat } from '../ai/llm.js';
import { config } from '../config.js';
import { AppError, FetchError, NotFoundError, ValidationError } from '../errors.js';

export interface ToolsDeps {
  store: ToolsStore;
  settings: SettingsStore;
  queue?: JobQueue;
  /** Папка файлов картинок (`<данные>/tool-images`). */
  imagesDir: string;
  /** Подменяются в тестах. Настройки (ключи, токены) в сетевые вызовы не передаются. */
  net?: { fetchPage: typeof fetchPage; fetchImage: typeof fetchImage };
  ai?: Partial<{ analyzeTool: typeof analyzeTool; chatAboutTool: typeof chatAboutTool; rankTools: typeof rankTools }>;
  log?: ServiceDeps['log'];
}

export interface ManualFields {
  title: string;
  description?: string;
  category?: string;
  tags?: string[];
}

type ImageKind = 'icon' | 'cover' | 'user';

const ID_RE = /^[\w-]+$/;

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return '(адрес)';
  }
};

const notNew = (t: Tool | ToolSummary): AppError => new AppError(`«${t.user.title ?? t.source.title ?? t.domain}» уже есть в инструментах`, 409, 'duplicate', { toolId: t.id });

/**
 * Сценарии раздела «Инструменты»: добавление, обновление страницы, анализ, картинки.
 * Либо страница загружена и запись сохранена, либо ошибка и ничего не записано; AI не блокирует сохранение.
 */
export class ToolsService {
  private readonly store: ToolsStore;
  private readonly settings: SettingsStore;
  private readonly queue: JobQueue;
  private readonly imagesDir: string;
  private readonly net: NonNullable<ToolsDeps['net']>;
  private readonly ai: Required<NonNullable<ToolsDeps['ai']>>;
  private readonly log: NonNullable<ToolsDeps['log']>;

  constructor(deps: ToolsDeps) {
    this.store = deps.store;
    this.settings = deps.settings;
    this.queue = deps.queue ?? new JobQueue();
    this.imagesDir = deps.imagesDir;
    this.net = deps.net ?? { fetchPage, fetchImage };
    this.ai = { analyzeTool, chatAboutTool, rankTools, ...deps.ai };
    this.log = deps.log ?? { info: () => {}, warn: () => {}, error: () => {} };
  }

  // ---------- чтение ----------

  list(query: ToolQuery): ToolSummary[] {
    return searchTools(this.store.listSummaries(), query);
  }

  facets(): ToolFacets {
    return computeToolFacets(this.store.listSummaries());
  }

  get(id: string): Tool {
    const tool = this.store.getById(id);
    if (!tool) throw new NotFoundError('Инструмент не найден в библиотеке');
    return tool;
  }

  // ---------- добавление / обновление ----------

  async add(raw: string): Promise<Tool> {
    const { url, key, domain } = normalizeToolUrl(raw);
    this.assertNew(key);
    const page = await this.net.fetchPage(url, this.pageOpts());
    const meta = this.extract(page.html, page.finalUrl);
    // Сокращённая ссылка и её цель — одна запись: сохраняем исходный адрес и ключ, но проверяем оба ключа.
    const finalKey = this.keyOf(page.finalUrl) ?? key;
    // finalUrl с finalUrl не сравнивается: разные сервисы уводят на общую страницу входа.
    const byFinal = finalKey !== key ? this.store.getByKey(finalKey) : null;
    if (byFinal) throw notNew(byFinal);

    const id = randomUUID();
    const [iconPath, imagePath] = await Promise.all([
      this.saveImageSafe(id, 'icon', meta.iconUrl, null),
      this.saveImageSafe(id, 'cover', meta.imageUrl, null),
    ]);
    // Пока шли загрузки, ту же ссылку могли добавить ещё раз (двойной клик): проверка и вставка — без await между ними.
    const clash = this.findClash(key) ?? (finalKey !== key ? this.store.getByKey(finalKey) : null);
    if (clash) {
      this.removeFiles(id);
      throw notNew(clash);
    }
    const llm = this.settings.isLlmConfigured();
    const tool: Tool = {
      id,
      url,
      key,
      domain,
      source: this.buildSource(meta, page.finalUrl, iconPath, imagePath),
      analysis: llm ? { ...emptyToolAnalysis(), status: 'pending' } : emptyToolAnalysis(),
      user: newToolUser(),
    };
    this.store.insert(tool);
    this.log.info(`Добавлен инструмент ${domain}`);
    if (llm) this.enqueueAnalysis(id);
    return tool;
  }

  /** Карточка без загрузки страницы. Анализ — только если есть описание пользователя. */
  addManual(raw: string, fields: ManualFields): Tool {
    const { url, key, domain } = normalizeToolUrl(raw);
    this.assertNew(key);
    const source: ToolSource = {
      status: 'manual', finalUrl: null, title: null, description: null, siteName: null, lang: null,
      text: null, textChars: 0, iconPath: null, imagePath: null, fetchedAt: null, error: null,
    };
    const base: Tool = { id: randomUUID(), url, key, domain, source, analysis: emptyToolAnalysis(), user: newToolUser() };
    const tool = applyToolPatch(base, { title: fields.title, description: fields.description, category: fields.category, tags: fields.tags, confirmed: true });
    const analyze = this.settings.isLlmConfigured() && Boolean(tool.user.description);
    if (analyze) tool.analysis = { ...emptyToolAnalysis(), status: 'pending' };
    this.store.insert(tool);
    this.log.info(`Добавлен инструмент вручную ${domain}`);
    if (analyze) this.enqueueAnalysis(tool.id);
    return tool;
  }

  /** Повторная загрузка страницы: заменяется только source. Ошибка загрузки запись не портит. */
  async refreshSource(id: string): Promise<Tool> {
    const tool = this.get(id);
    const page = await this.net.fetchPage(tool.url, this.pageOpts());
    const meta = this.extract(page.html, page.finalUrl);
    // Если новая картинка не скачалась — остаётся старая.
    const [iconPath, imagePath] = await Promise.all([
      this.saveImageSafe(id, 'icon', meta.iconUrl, tool.source.iconPath),
      this.saveImageSafe(id, 'cover', meta.imageUrl, tool.source.imagePath),
    ]);
    // Перечитать после ожидания сети: запись могли удалить или поменять.
    const fresh = this.store.getById(id);
    if (!fresh) {
      this.removeFiles(id);
      throw new NotFoundError('Инструмент не найден в библиотеке');
    }
    const updated = applyToolSource(fresh, this.buildSource(meta, page.finalUrl, iconPath, imagePath));
    this.store.updateSource(id, updated.source);
    this.log.info(`Обновлена страница ${tool.domain}`);
    return updated;
  }

  updateUser(id: string, patch: ToolPatch): Tool {
    const updated = applyToolPatch(this.get(id), patch);
    this.store.update(updated);
    return updated;
  }

  delete(id: string): void {
    if (!this.store.delete(id)) throw new NotFoundError('Инструмент не найден в библиотеке');
    this.removeFiles(id);
  }

  /** Своя картинка: скачивается тем же загрузчиком, путь строится из id. `null` — снять. */
  async setImage(id: string, imageUrl: string | null): Promise<Tool> {
    this.get(id);
    let imagePath: string | null = null;
    if (imageUrl === null) this.removeFiles(id, 'user');
    else imagePath = await this.saveImage(id, 'user', imageUrl);
    const fresh = this.store.getById(id);
    if (!fresh) {
      this.removeFiles(id);
      throw new NotFoundError('Инструмент не найден в библиотеке');
    }
    const updated = applyToolImage(fresh, imagePath);
    this.store.update(updated);
    return updated;
  }

  // ---------- AI ----------

  /** Ставит анализ в очередь; `enqueue = false` — вызывающий запустит анализ сам. */
  requestAnalysis(id: string, enqueue = true): Tool {
    const tool = this.get(id);
    if (!this.settings.isLlmConfigured()) {
      throw new ValidationError('LLM не настроена. Укажите Base URL и модель в настройках.');
    }
    const pending: ToolAnalysis = { ...tool.analysis, status: 'pending', error: null };
    this.store.updateAnalysis(id, pending);
    if (enqueue) this.enqueueAnalysis(id);
    return { ...tool, analysis: pending };
  }

  /** Выполняет анализ синхронно (очередь, `wait=1`, тесты). Пишется только блок analysis. */
  async runAnalysis(id: string): Promise<Tool> {
    const tool = this.get(id);
    try {
      const analysis = await this.ai.analyzeTool(this.forAnalysis(tool), this.settings.get(), [...TOOL_CATEGORIES]);
      // Перечитать: правки пользователя, сделанные, пока модель думала, не затираются.
      const updated = applyToolAnalysis(this.get(id), analysis);
      this.store.updateAnalysis(id, updated.analysis);
      this.log.info(`AI-анализ готов: ${tool.domain}`);
      return updated;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const fresh = this.store.getById(id);
      if (!fresh) throw e;
      const failed: ToolAnalysis = { ...fresh.analysis, status: 'failed', error: message };
      this.store.updateAnalysis(id, failed);
      this.log.warn(`AI-анализ не удался для ${tool.domain}: ${message}`);
      return { ...fresh, analysis: failed };
    }
  }

  /** Для ручной карточки текстом страницы служит описание пользователя — единственный случай, когда оно идёт в анализ. */
  private forAnalysis(tool: Tool): Tool {
    if (tool.source.status !== 'manual') return tool;
    return { ...tool, source: { ...tool.source, title: tool.user.title, description: null, text: tool.user.description } };
  }

  /** После перезапуска: незавершённые анализы ставятся в очередь заново или сбрасываются. */
  recoverPending(): void {
    const pending = this.store.listSummaries().filter((t) => t.analysis.status === 'pending');
    if (pending.length === 0) return;
    if (this.settings.isLlmConfigured()) {
      for (const t of pending) this.enqueueAnalysis(t.id);
      this.log.info(`Возобновлено ${pending.length} AI-анализов инструментов`);
    } else {
      for (const t of pending) {
        this.store.updateAnalysis(t.id, settlePendingAnalysis(t.analysis));
      }
    }
  }

  private enqueueAnalysis(id: string): void {
    this.queue.enqueue(`tool:${id}`, async () => {
      if (!this.store.getById(id)) return;
      try {
        await this.runAnalysis(id);
      } catch (e) {
        this.log.warn(`AI-анализ пропущен (${id}): ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  // ---------- чат и подбор ----------

  /** Чат по карточке: сеть не нужна, берётся сохранённый текст страницы. Без LLM — ошибка, как у репозиториев. */
  async chat(id: string, history: ChatMessage[]): Promise<ChatReply> {
    const tool = this.get(id);
    assertCanChat(this.settings.isLlmConfigured(), history);
    const answer = await this.ai.chatAboutTool(tool, this.settings.get(), history);
    const hasText = Boolean(tool.source.text);
    const notice = !hasText
      ? 'Ответ только по карточке: текст страницы не сохранён'
      : tool.source.status !== 'ok'
        ? 'Текст страницы сохранён не полностью — ответ может быть неточным'
        : null;
    return { reply: answer.reply, model: answer.model, sources: hasText ? [tool.url] : [], notice };
  }

  /** Подбор под задачу (S7). Без LLM или при её сбое — честный поиск по словам, без выдуманных причин. */
  async recommend(task: string): Promise<ToolRecommendation> {
    const all = this.store.listSummaries();
    if (all.length === 0) return { mode: 'search', items: [], comment: null, notice: 'В библиотеке пока нет инструментов' };

    const scored = scoreTools(all, task);
    const byId = new Map(all.map((t) => [t.id, t]));
    const max = config.toolRecommendMaxCandidates;
    const searchItems = () => scored.filter((s) => s.score > 0).slice(0, max).map((s) => ({ tool: s.tool, reason: null, fit: null }));
    const fallback = (notice: string): ToolRecommendation => ({ mode: 'search', items: searchItems(), comment: null, notice });

    if (!this.settings.isLlmConfigured()) return fallback('LLM не настроена — показан поиск по словам');

    let candidates = scored.map((s) => s.tool);
    if (candidates.length > max) {
      candidates = scored.some((s) => s.score > 0)
        ? candidates.slice(0, max)
        : [...candidates].sort((a, b) => b.user.addedAt.localeCompare(a.user.addedAt)).slice(0, max);
    }
    try {
      const { matches, comment, shown } = await this.ai.rankTools(task, candidates, this.settings.get());
      const allowed = new Set(shown);
      // Модель не может добавить в выдачу то, чего не видела (нет среди кандидатов или отрезано бюджетом); дубликаты rankTools уже убрал.
      const items = matches.filter((m) => allowed.has(m.id)).map((m) => ({ tool: byId.get(m.id)!, reason: m.reason, fit: m.fit }));
      return { mode: 'ai', items, comment, notice: null };
    } catch (e) {
      this.log.warn(`Подбор через LLM не удался: ${e instanceof Error ? e.message : String(e)}`);
      return fallback('Модель недоступна — показан поиск по словам');
    }
  }

  // ---------- внутреннее ----------

  /** Дубликат по ключу или по адресу после редиректа существующей записи (короткая ссылка добавлена раньше цели). */
  private findClash(key: string): ToolSummary | Tool | null {
    const byKey = this.store.getByKey(key);
    if (byKey) return byKey;
    // shortcut: линейный перебор с разбором finalUrl; при тысячах карточек завести колонку final_key.
    return this.store.listSummaries().find((t) => t.source.finalUrl && this.keyOf(t.source.finalUrl) === key) ?? null;
  }

  private assertNew(key: string): void {
    const existing = this.findClash(key);
    if (existing) throw notNew(existing);
  }

  private keyOf(url: string): string | null {
    try {
      return normalizeToolUrl(url).key;
    } catch {
      return null;
    }
  }

  private pageOpts(): FetchOpts {
    return { maxBytes: config.toolPageMaxBytes, timeoutMs: config.toolFetchTimeoutMs, headersTimeoutMs: config.toolFetchHeadersTimeoutMs };
  }

  /** Исключение разборщика — не 500: клиенту предлагается ручное заполнение. */
  private extract(html: string, finalUrl: string): ExtractedPage {
    try {
      return extractPage(html, finalUrl);
    } catch {
      throw new FetchError('Не удалось разобрать страницу — заполните карточку вручную', 'fetch_parse');
    }
  }

  private buildSource(meta: ExtractedPage, finalUrl: string, iconPath: string | null, imagePath: string | null): ToolSource {
    return {
      status: meta.status,
      finalUrl,
      title: meta.title,
      description: meta.description,
      siteName: meta.siteName,
      lang: meta.lang,
      text: meta.text,
      textChars: meta.text.length,
      iconPath,
      imagePath,
      fetchedAt: new Date().toISOString(),
      error: null,
    };
  }

  /** Картинка не обязательна: сбой — это `fallback` и предупреждение в журнале, а не ошибка добавления. */
  private async saveImageSafe(id: string, kind: ImageKind, url: string | null, fallback: string | null): Promise<string | null> {
    if (!url) return fallback;
    try {
      return await this.saveImage(id, kind, url);
    } catch (e) {
      this.log.warn(`Картинка не сохранена (${hostOf(url)}): ${e instanceof Error ? e.message : String(e)}`);
      return fallback;
    }
  }

  /** Имя файла — только из id, kind (литерал из кода) и расширения по проверенному Content-Type. */
  private async saveImage(id: string, kind: ImageKind, url: string): Promise<string> {
    // Защита в глубину: id записей из импорта (T8) — чужой ввод, в путь он попадает только после проверки формата.
    if (!ID_RE.test(id)) throw new ValidationError('Некорректный идентификатор записи');
    const maxBytes = kind === 'icon' ? config.toolFaviconMaxBytes : config.toolPreviewMaxBytes;
    const img = await this.net.fetchImage(url, { maxBytes, timeoutMs: config.toolFetchTimeoutMs, headersTimeoutMs: config.toolFetchHeadersTimeoutMs });
    const name = `${id}-${kind}.${img.ext}`;
    const root = path.resolve(this.imagesDir);
    const abs = path.resolve(root, name);
    if (!abs.startsWith(root + path.sep)) throw new ValidationError('Некорректный идентификатор записи');
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(abs, img.body);
    this.removeFiles(id, kind, name);
    return `tool-images/${name}`;
  }

  /** Удаляет файлы записи (`kind` — только этого вида), кроме `keep`. Имя должно точно совпасть с шаблоном: файлы записи `abc-def` не задеваются при удалении `abc`. */
  private removeFiles(id: string, kind?: ImageKind, keep?: string): void {
    if (!ID_RE.test(id)) return;
    const pattern = new RegExp(`^${id}-${kind ?? '(?:icon|cover|user)'}\\.[a-z0-9]+$`);
    const root = path.resolve(this.imagesDir);
    let names: string[];
    try {
      names = fs.readdirSync(root);
    } catch {
      return; // папки ещё нет — удалять нечего
    }
    for (const name of names) {
      if (!pattern.test(name) || name === keep) continue;
      try {
        fs.rmSync(path.join(root, name), { force: true });
      } catch {
        // файл занят — запись в БД важнее
      }
    }
  }
}
