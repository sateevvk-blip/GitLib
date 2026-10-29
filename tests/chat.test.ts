import { describe, expect, it } from 'vitest';
import { buildChatMessages } from '../src/server/ai/analyzer.js';
import { LibraryService } from '../src/server/library/service.js';
import { ValidationError } from '../src/server/errors.js';
import type { ChatMessage, Repo } from '../src/shared/types.js';
import { CHAT_HISTORY_LIMIT, CHAT_MESSAGE_MAX_CHARS } from '../src/shared/types.js';
import { makeGithub, makeRepo, makeSettings, makeStore } from './helpers.js';

function history(n: number): ChatMessage[] {
  return Array.from({ length: n }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content: `сообщение ${i}` }));
}

describe('чат о репозитории: сборка сообщений', () => {
  it('системная роль, данные репозитория с README и история в исходном порядке', () => {
    const repo = makeRepo('octo/tool', { github: makeGithub({ readme: '# Tool\n\nУстановка: npm i tool' }) });
    const msgs = buildChatMessages(repo, [
      { role: 'user', content: 'Как установить?' },
      { role: 'assistant', content: 'npm i tool' },
      { role: 'user', content: 'А зависимости?' },
    ]);
    expect(msgs[0]?.role).toBe('system');
    expect(msgs[0]?.content).toMatch(/по-русски/);
    expect(msgs[1]?.role).toBe('user');
    expect(msgs[1]?.content).toContain('Репозиторий: octo/tool');
    expect(msgs[1]?.content).toContain('npm i tool');
    expect(msgs.slice(-3).map((m) => m.content)).toEqual(['Как установить?', 'npm i tool', 'А зависимости?']);
    expect(msgs[msgs.length - 1]?.role).toBe('user');
  });

  it('готовая сводка попадает в контекст, незавершённая — нет', () => {
    const done = makeRepo('octo/done', {
      analysis: { status: 'done', summary: 'Готовая сводка про бэкапы', useCases: ['Бэкап'], suggestedTopics: [], model: 'm', generatedAt: null, error: null },
    });
    expect(buildChatMessages(done, history(1))[1]?.content).toContain('Готовая сводка про бэкапы');
    const failed = makeRepo('octo/failed', {
      analysis: { status: 'failed', summary: 'Старая сводка', useCases: [], suggestedTopics: [], model: null, generatedAt: null, error: 'x' },
    });
    expect(buildChatMessages(failed, history(1))[1]?.content).not.toContain('Старая сводка');
  });

  it('история обрезается до последних сообщений, длинные сообщения — по лимиту', () => {
    const long = history(CHAT_HISTORY_LIMIT + 7);
    long[long.length - 1] = { role: 'user', content: 'x'.repeat(CHAT_MESSAGE_MAX_CHARS + 500) };
    const msgs = buildChatMessages(makeRepo(), long);
    const tail = msgs.slice(3);
    expect(tail).toHaveLength(CHAT_HISTORY_LIMIT);
    expect(tail[0]?.content).toBe(`сообщение ${7}`);
    expect(tail[tail.length - 1]?.content).toHaveLength(CHAT_MESSAGE_MAX_CHARS);
  });
});

describe('чат о репозитории: сервис', () => {
  function makeService(llm: boolean) {
    const { store, dataDir } = makeStore();
    const settings = makeSettings(dataDir, llm ? { LLM_BASE_URL: 'http://llm.local/v1', LLM_MODEL: 'test' } : {});
    const seen: ChatMessage[][] = [];
    const service = new LibraryService({
      store,
      settings,
      github: { fetchRepository: async () => ({ github: makeGithub(), canonical: { owner: 'octo', name: 'test' } }), downloadAvatar: async () => null },
      contents: { fetchTree: async () => ({ sha: 't', truncated: false, entries: [] }), fetchBlob: async () => '' },
      ai: {
        selectChatFiles: async () => [],
        analyzeRepo: async () => {
          throw new Error('не вызывается');
        },
        chatAboutRepo: async (_repo, s, msgs) => {
          seen.push(msgs);
          return { reply: 'Ответ модели', model: s.llmModel };
        },
      },
    });
    const repo: Repo = makeRepo('octo/test');
    store.insert(repo);
    return { service, store, repo, seen };
  }

  it('передаёт историю модели и не меняет запись', async () => {
    const { service, store, repo, seen } = makeService(true);
    const before = store.getById(repo.id);
    const reply = await service.chat(repo.id, [{ role: 'user', content: 'Что это?' }]);
    expect(reply).toEqual({ reply: 'Ответ модели', model: 'test', sources: [], notice: null });
    expect(seen[0]).toEqual([{ role: 'user', content: 'Что это?' }]);
    expect(store.getById(repo.id)).toEqual(before);
  });

  it('без настроенной LLM — понятная ошибка валидации', async () => {
    const { service, repo } = makeService(false);
    await expect(service.chat(repo.id, [{ role: 'user', content: 'Что это?' }])).rejects.toBeInstanceOf(ValidationError);
  });

  it('последнее сообщение должно быть вопросом пользователя, репозиторий — существовать', async () => {
    const { service, repo } = makeService(true);
    await expect(service.chat(repo.id, [{ role: 'assistant', content: 'привет' }])).rejects.toBeInstanceOf(ValidationError);
    await expect(service.chat(repo.id, [{ role: 'user', content: '   ' }])).rejects.toBeInstanceOf(ValidationError);
    await expect(service.chat('nope', [{ role: 'user', content: 'Что это?' }])).rejects.toMatchObject({ statusCode: 404 });
  });
});
