import { z } from 'zod';
import type { AnalysisData, ChatMessage, ChatReply, Repo, Settings } from '../../shared/types.js';
import { CHAT_HISTORY_LIMIT, CHAT_MAX_FILES, CHAT_MESSAGE_MAX_CHARS } from '../../shared/types.js';
import { questionKeywords, readableEntries, renderContext, summarizeTree, type ChatContext, type RepoTree, type TreeEntry } from './context.js';
import { LlmError } from '../errors.js';
import { chatCompletion, extractJson } from './llm.js';
export { extractJson, probeLlm, type LlmProbe } from './llm.js';
import { config } from '../config.js';

const ResultSchema = z.object({
  summary: z.string().min(1),
  useCases: z.array(z.string().min(1)).default([]),
  suggestedTopics: z.array(z.string().min(1)).default([]),
});

const SYSTEM_PROMPT = `Ты — опытный технический библиотекарь. Тебе дают данные GitHub-репозитория (метаданные и README).
Составь содержательную сводку на русском языке для разработчика, который решает, пригодится ли ему этот проект.

Ответь строго одним JSON-объектом без пояснений и без markdown-ограждений, по схеме:
{
  "summary": "3–6 предложений: что это, какую задачу решает, чем отличается от аналогов, в каком состоянии проект",
  "useCases": ["4–6 коротких практических сценариев, когда проект пригодится; каждый — одна строка"],
  "suggestedTopics": ["3–7 тем для каталога, короткие, в нижнем регистре, латиницей (например: cli, self-hosted, llm, devops)"]
}

Правила: пиши по-русски, но названия проектов, технологий и команд оставляй в оригинале. Не выдумывай возможностей, которых нет в README.
Если README отсутствует — опирайся на описание, темы и язык, но прямо отметь ограниченность данных в summary.`;

export function buildUserPrompt(repo: Repo): string {
  const g = repo.github;
  const readme = g.readme ? g.readme.slice(0, config.readmeForLlmChars) : '(README отсутствует)';
  const langs = Object.entries(g.languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k]) => k)
    .join(', ');
  return [
    `Репозиторий: ${repo.fullName}`,
    `URL: ${g.htmlUrl}`,
    `Описание: ${g.description ?? '(нет)'}`,
    `Основной язык: ${g.language ?? '(не определён)'}${langs ? ` · языки: ${langs}` : ''}`,
    `GitHub topics: ${g.topics.length ? g.topics.join(', ') : '(нет)'}`,
    `Звёзды: ${g.stars} · форки: ${g.forks} · открытые issues: ${g.openIssues} · лицензия: ${g.license ?? '(нет)'}`,
    `Последний push: ${g.pushedAt ?? '?'} · архив: ${g.archived ? 'да' : 'нет'}`,
    g.homepage ? `Сайт: ${g.homepage}` : '',
    '',
    '===== README =====',
    readme,
  ]
    .filter((line) => line !== '')
    .join('\n');
}

export async function analyzeRepo(repo: Repo, settings: Settings): Promise<AnalysisData> {
  if (!settings.llmBaseUrl || !settings.llmModel) {
    throw new LlmError('LLM не настроена: укажите Base URL и модель в настройках', 'llm_not_configured');
  }
  const raw = await chatCompletion(
    settings,
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(repo) },
    ],
    true,
  );
  const parsed = ResultSchema.safeParse(extractJson(raw));
  if (!parsed.success) {
    throw new LlmError('Ответ модели не соответствует ожидаемой структуре (summary/useCases/suggestedTopics)', 'llm_bad_json');
  }
  const cleanTopics = [...new Set(parsed.data.suggestedTopics.map((t) => t.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean))].slice(0, 10);
  return {
    status: 'done',
    summary: parsed.data.summary.trim().slice(0, 4000),
    useCases: parsed.data.useCases.map((u) => u.trim()).filter(Boolean).slice(0, 10),
    suggestedTopics: cleanTopics,
    model: settings.llmModel,
    generatedAt: new Date().toISOString(),
    error: null,
  };
}

const CHAT_SYSTEM_PROMPT = `Ты — технический библиотекарь GitLib, напарник разработчика. Пользователь открыл карточку GitHub-репозитория и задаёт вопросы о нём.
Тебе даны: метаданные, README, при наличии — готовая сводка, структура файлов репозитория и содержимое файлов, отобранных под вопрос. Отвечай по ним предметно.

Правила:
- Отвечай по-русски, по делу: обычно 3–8 предложений или список. Названия проектов, технологий, команд, файлов и флагов — в оригинале.
- Простой Markdown: списки, \`код\`, блоки кода для команд. Файлы называй по пути (например, \`docs/usage.md\`) — пользователь может их открыть.
- Опирайся на содержимое файлов и структуру: если спрашивают «какие есть команды/скиллы/агенты/примеры», перечисли конкретные имена из файлов и папок, кратко поясни каждый. Если файлов много — покажи самые важные и скажи, сколько всего и где лежат остальные.
- Не выдумывай возможностей, настроек или команд, которых нет в данных. Если ответа в прочитанных файлах нет — скажи, что именно прочитал, и назови файлы или папки репозитория, где ответ скорее всего есть.
- Заверши коротким практическим советом, когда это уместно: как применить к задаче пользователя, с чего начать, на что обратить внимание (зависимости, ограничения, подводные камни). Не повторяй советом сам ответ.
- Если вопрос не про этот репозиторий, вежливо верни разговор к нему, но на короткий общий вопрос по теме ответить можно.`;

/** Что модель должна знать о репозитории перед разговором: метаданные, README, сводка, структура и файлы. */
export function buildChatContextMessage(repo: Repo, ctx: ChatContext, question = ''): string {
  const a = repo.analysis;
  const summary =
    a.status === 'done' && a.summary
      ? ['', '===== Готовая сводка GitLib =====', a.summary, a.useCases.length ? `Когда пригодится: ${a.useCases.join('; ')}` : ''].filter(Boolean).join('\n')
      : '';
  const repoContext = renderContext(ctx, question);
  return `${buildUserPrompt(repo)}${summary}${repoContext ? `\n\n${repoContext}` : ''}`;
}

const EMPTY_CONTEXT: ChatContext = { tree: null, files: [], notes: [] };

/** Собирает сообщения для чата: системная роль, данные репозитория с файлами и последние реплики истории. */
export function buildChatMessages(repo: Repo, history: ChatMessage[], ctx: ChatContext = EMPTY_CONTEXT): Array<{ role: string; content: string }> {
  const recent = history.slice(-CHAT_HISTORY_LIMIT).map((m) => ({ role: m.role, content: m.content.slice(0, CHAT_MESSAGE_MAX_CHARS) }));
  const read = ctx.files.length ? ` и файлы: ${ctx.files.map((f) => f.path).join(', ')}` : '';
  return [
    { role: 'system', content: CHAT_SYSTEM_PROMPT },
    { role: 'user', content: buildChatContextMessage(repo, ctx, history[history.length - 1]?.content ?? '') },
    { role: 'assistant', content: `Данные репозитория ${repo.fullName}${read} прочитал. Задавайте вопросы.` },
    ...recent,
  ];
}

/** Ответ модели без служебных полей; сервис дополняет его источниками и примечанием. */
export interface ChatAnswer {
  reply: string;
  model: string;
}

export async function chatAboutRepo(repo: Repo, settings: Settings, history: ChatMessage[], ctx: ChatContext = EMPTY_CONTEXT): Promise<ChatAnswer> {
  if (!settings.llmBaseUrl || !settings.llmModel) {
    throw new LlmError('LLM не настроена: укажите Base URL и модель в настройках', 'llm_not_configured');
  }
  const raw = await chatCompletion(settings, buildChatMessages(repo, history, ctx), false, 0.4);
  return { reply: raw.trim(), model: settings.llmModel };
}

const SELECT_SYSTEM_PROMPT = `Ты помогаешь ответить на вопрос о GitHub-репозитории. Тебе даны вопрос, структура файлов и список файлов-кандидатов.
Выбери файлы, которые нужно прочитать, чтобы ответить предметно: документацию, примеры, конфигурацию, точки входа, файлы с перечнями (команд, скиллов, агентов и т. п.).
Ответь строго одним JSON-объектом без пояснений: {"files": ["путь/из/списка", ...]}.
Не больше ${CHAT_MAX_FILES} путей, только существующие пути из структуры, самые полезные — первыми. Если для ответа достаточно README и структуры — верни {"files": []}.`;

const SelectSchema = z.object({ files: z.array(z.string()).default([]) });

/** Собирает запрос на выбор файлов (экспортирован для тестов). */
export function buildSelectMessages(repo: Repo, history: ChatMessage[], tree: RepoTree, candidates: TreeEntry[]): Array<{ role: string; content: string }> {
  const recent = history.slice(-5, -1).map((m) => `${m.role === 'user' ? 'Пользователь' : 'Ответ'}: ${m.content.slice(0, 300)}`);
  const question = history[history.length - 1]?.content ?? '';
  const a = repo.analysis;
  const user = [
    `Репозиторий: ${repo.fullName} — ${repo.github.description ?? '(без описания)'}`,
    a.status === 'done' && a.summary ? `Сводка: ${a.summary.slice(0, 600)}` : '',
    recent.length ? `Предыдущие реплики:\n${recent.join('\n')}` : '',
    `Вопрос: ${question}`,
    '',
    `Кандидаты по ключевым словам: ${candidates.map((c) => c.path).join(', ') || '(нет)'}`,
    '',
    summarizeTree(tree, config.chatTreeChars, questionKeywords(question)),
  ]
    .filter((line) => line !== '')
    .join('\n');
  return [
    { role: 'system', content: SELECT_SYSTEM_PROMPT },
    { role: 'user', content: user },
  ];
}

/** Просит модель выбрать файлы под вопрос. Возвращает только существующие читаемые пути (до CHAT_MAX_FILES). */
export async function selectChatFiles(repo: Repo, settings: Settings, history: ChatMessage[], tree: RepoTree, candidates: TreeEntry[]): Promise<string[]> {
  const raw = await chatCompletion(settings, buildSelectMessages(repo, history, tree, candidates), true, 0.1);
  const parsed = SelectSchema.safeParse(extractJson(raw));
  if (!parsed.success) throw new LlmError('Модель вернула список файлов не в ожидаемом формате', 'llm_bad_json');
  const readable = new Set(readableEntries(tree).map((e) => e.path));
  const out: string[] = [];
  for (const f of parsed.data.files) {
    const p = f.trim().replace(/^\.?\//, '');
    if (readable.has(p) && !out.includes(p)) out.push(p);
    if (out.length >= CHAT_MAX_FILES) break;
  }
  return out;
}
