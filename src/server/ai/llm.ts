import type { Settings } from '../../shared/types.js';
import { LlmError } from '../errors.js';

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

/** Прокси иногда повторяют ключ в теле ошибки; адрес LLM может содержать user:pass@. */
const hideUserinfo = (url: string): string => url.replace(/\/\/[^/@]*@/, '//***@');

export async function chatCompletion(settings: Settings, messages: Array<{ role: string; content: string }>, useJsonMode: boolean, temperature = 0.3): Promise<string> {
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
    throw new LlmError(`Не удалось подключиться к LLM по адресу ${hideUserinfo(settings.llmBaseUrl)}`, 'llm_unreachable');
  }
  const raw = await res.text();
  const text = settings.llmApiKey ? raw.replaceAll(settings.llmApiKey, '***') : raw;
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
    return { ok: !known, configured: true, message: `LLM доступна: ${hideUserinfo(settings.llmBaseUrl)}${known}`, model: settings.llmModel };
  } catch {
    return { ok: false, configured: true, message: `LLM недоступна по адресу ${hideUserinfo(settings.llmBaseUrl)}`, model: settings.llmModel };
  }
}
