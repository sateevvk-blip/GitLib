import { z } from 'zod';
import type { AnalysisData, ChatMessage, ChatReply, Repo, Settings } from '../../shared/types.js';
import { CHAT_HISTORY_LIMIT, CHAT_MESSAGE_MAX_CHARS } from '../../shared/types.js';
import { LlmError } from '../errors.js';
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

/** Достаёт первый JSON-объект из ответа модели (модели любят оборачивать его в ```json). */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1]?.trim(), trimmed].filter((x): x is string => Boolean(x));
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      /* пробуем дальше */
    }
    const start = c.indexOf('{');
    const end = c.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(c.slice(start, end + 1));
      } catch {
        /* пробуем дальше */
      }
    }
  }
  throw new LlmError('Модель вернула ответ не в формате JSON', 'llm_bad_json');
}

type ChatContent = string | Array<{ type: string; text?: string }> | null | undefined;

interface ChatResponse {
  choices?: Array<{ message?: { content?: ChatContent } }>;
  error?: { message?: string } | string;
}

function contentToString(content: ChatContent): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((p) => p.text ?? '').join('');
  return '';
}

async function chatCompletion(settings: Settings, messages: Array<{ role: string; content: string }>, useJsonMode: boolean, temperature = 0.3): Promise<string> {
  const body: Record<string, unknown> = {
    model: settings.llmModel,
    messages,
    temperature,
  };
  if (useJsonMode) body.response_format = { type: 'json_object' };
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (settings.llmApiKey) headers.Authorization = `Bearer ${settings.llmApiKey}`;

  let res: Response;
  try {
    res = await fetch(`${settings.llmBaseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(settings.llmTimeoutSec * 1000),
    });
  } catch (e) {
    const err = e as Error;
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new LlmError(`LLM не ответила за ${settings.llmTimeoutSec} с`, 'llm_timeout');
    }
    throw new LlmError(`Не удалось подключиться к LLM по адресу ${settings.llmBaseUrl}`, 'llm_unreachable');
  }
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try {
      const parsed = JSON.parse(text) as ChatResponse;
      const err = parsed.error;
      msg = typeof err === 'string' ? err : err?.message ?? msg;
    } catch {
      /* оставляем сырой текст */
    }
    if (useJsonMode && res.status === 400 && /response_format|json_object|json mode/i.test(msg)) {
      return chatCompletion(settings, messages, false, temperature);
    }
    if (res.status === 401) throw new LlmError('LLM отклонила ключ API (401)', 'llm_unauthorized');
    if (res.status === 404) throw new LlmError(`Эндпоинт или модель не найдены (404): ${msg}`, 'llm_not_found');
    throw new LlmError(`LLM ответила ошибкой ${res.status}: ${msg}`, 'llm_error');
  }
  let parsed: ChatResponse;
  try {
    parsed = JSON.parse(text) as ChatResponse;
  } catch {
    throw new LlmError('LLM вернула не-JSON ответ (это точно OpenAI-совместимый эндпоинт?)', 'llm_bad_response');
  }
  const content = parsed.choices?.[0]?.message?.content;
  const str = contentToString(content);
  if (!str.trim()) throw new LlmError('LLM вернула пустой ответ', 'llm_empty');
  return str;
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

const CHAT_SYSTEM_PROMPT = `Ты — технический библиотекарь GitLib, напарник разработчика. Пользователь открыл карточку GitHub-репозитория и задаёт уточняющие вопросы о нём.
Ниже — данные репозитория (метаданные, README, при наличии — готовая сводка). Отвечай по ним.

Правила:
- Отвечай по-русски, коротко и по делу: обычно 2–6 предложений или небольшой список. Названия проектов, технологий, команд, файлов и флагов — в оригинале.
- Можно использовать простой Markdown: списки, \`код\`, блоки кода для команд.
- Не выдумывай возможностей, настроек или команд, которых нет в данных. Если в README ответа нет — так и скажи и подскажи, где в репозитории это обычно смотрят (docs, examples, issues).
- Если вопрос не про этот репозиторий, вежливо верни разговор к нему, но на короткий общий вопрос по теме ответить можно.`;

/** Собирает сообщения для чата: системная роль, данные репозитория и последние реплики истории. */
export function buildChatMessages(repo: Repo, history: ChatMessage[]): Array<{ role: string; content: string }> {
  const a = repo.analysis;
  const summary =
    a.status === 'done' && a.summary
      ? ['', '===== Готовая сводка GitLib =====', a.summary, a.useCases.length ? `Когда пригодится: ${a.useCases.join('; ')}` : ''].filter(Boolean).join('\n')
      : '';
  const recent = history.slice(-CHAT_HISTORY_LIMIT).map((m) => ({ role: m.role, content: m.content.slice(0, CHAT_MESSAGE_MAX_CHARS) }));
  return [
    { role: 'system', content: CHAT_SYSTEM_PROMPT },
    { role: 'user', content: `${buildUserPrompt(repo)}${summary}` },
    { role: 'assistant', content: `Данные репозитория ${repo.fullName} прочитал. Задавайте вопросы.` },
    ...recent,
  ];
}

export async function chatAboutRepo(repo: Repo, settings: Settings, history: ChatMessage[]): Promise<ChatReply> {
  if (!settings.llmBaseUrl || !settings.llmModel) {
    throw new LlmError('LLM не настроена: укажите Base URL и модель в настройках', 'llm_not_configured');
  }
  const raw = await chatCompletion(settings, buildChatMessages(repo, history), false, 0.4);
  return { reply: raw.trim(), model: settings.llmModel };
}

export interface LlmProbe {
  ok: boolean;
  message: string;
  configured: boolean;
  model?: string;
}

export async function probeLlm(settings: Settings): Promise<LlmProbe> {
  if (!settings.llmBaseUrl || !settings.llmModel) {
    return { ok: false, configured: false, message: 'LLM не настроена' };
  }
  const headers: Record<string, string> = {};
  if (settings.llmApiKey) headers.Authorization = `Bearer ${settings.llmApiKey}`;
  try {
    const res = await fetch(`${settings.llmBaseUrl}/models`, { headers, signal: AbortSignal.timeout(8000) });
    if (res.status === 401) return { ok: false, configured: true, message: 'Ключ API отклонён (401)', model: settings.llmModel };
    if (!res.ok) {
      return { ok: false, configured: true, message: `Эндпоинт ответил ${res.status} на GET /models`, model: settings.llmModel };
    }
    let known = '';
    try {
      const data = (await res.json()) as { data?: Array<{ id?: string }> };
      const ids = (data.data ?? []).map((m) => m.id).filter(Boolean) as string[];
      if (ids.length && !ids.includes(settings.llmModel)) {
        known = ` · модель «${settings.llmModel}» не найдена в списке (${ids.slice(0, 5).join(', ')}${ids.length > 5 ? '…' : ''})`;
      }
    } catch {
      /* список моделей необязателен */
    }
    return { ok: !known, configured: true, message: `LLM доступна: ${settings.llmBaseUrl}${known}`, model: settings.llmModel };
  } catch {
    return { ok: false, configured: true, message: `LLM недоступна по адресу ${settings.llmBaseUrl}`, model: settings.llmModel };
  }
}
