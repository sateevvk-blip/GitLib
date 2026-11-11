import { afterEach, expect, it, vi } from 'vitest';
import { chatCompletion } from '../src/server/ai/llm.js';
import { LlmError } from '../src/server/errors.js';
import type { Settings } from '../src/shared/types.js';

afterEach(() => vi.unstubAllGlobals());

it('error.message не строка в JSON ошибки → LlmError, а не TypeError', async () => {
  const settings: Settings = { githubToken: '', llmBaseUrl: 'http://llm.local/v1', llmModel: 'test', llmApiKey: 'sk-secret', llmTimeoutSec: 5 };
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{"message":123}}', { status: 500 })));
  await expect(chatCompletion(settings, [{ role: 'user', content: 'x' }], false)).rejects.toBeInstanceOf(LlmError);
});
