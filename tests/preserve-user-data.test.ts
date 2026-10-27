import { describe, expect, it } from 'vitest';
import { LibraryService } from '../src/server/library/service.js';
import { DuplicateError } from '../src/server/errors.js';
import type { AnalysisData, Repo } from '../src/shared/types.js';
import { makeGithub, makeSettings, makeStore } from './helpers.js';

function makeService(opts: { llm?: boolean; analysis?: () => Promise<AnalysisData>; fetched?: () => ReturnType<typeof fetchedFor> } = {}) {
  const { store, dataDir } = makeStore();
  const settings = makeSettings(dataDir, opts.llm ? { LLM_BASE_URL: 'http://llm.local/v1', LLM_MODEL: 'test' } : {});
  const calls = { fetch: 0, analyze: 0 };
  const service = new LibraryService({
    store,
    settings,
    github: {
      fetchRepository: async (owner, name) => {
        calls.fetch += 1;
        return opts.fetched ? opts.fetched() : fetchedFor(owner, name);
      },
      downloadAvatar: async () => null,
    },
    ai: {
      analyzeRepo: async () => {
        calls.analyze += 1;
        if (opts.analysis) return opts.analysis();
        return doneAnalysis();
      },
    },
  });
  return { service, store, settings, calls };
}

function fetchedFor(owner: string, name: string, stars = 10) {
  return {
    github: makeGithub({ htmlUrl: `https://github.com/${owner}/${name}`, ownerLogin: owner, stars, fetchedAt: new Date().toISOString() }),
    canonical: { owner, name },
  };
}

function doneAnalysis(summary = 'Сводка'): AnalysisData {
  return { status: 'done', summary, useCases: ['Сценарий'], suggestedTopics: ['ai-topic'], model: 'test', generatedAt: new Date().toISOString(), error: null };
}

async function addWithUserData(service: LibraryService): Promise<Repo> {
  const added = await service.add('Octo/Test');
  return service.updateUser(added.id, { notes: 'Мои заметки', topics: ['моя-тема'], status: 'using', favorite: true });
}

describe('сохранность пользовательских данных', () => {
  it('обновление GitHub-метаданных не затирает заметки, темы, статус, избранное и анализ', async () => {
    const { service } = makeService({ llm: true });
    const repo = await addWithUserData(service);
    await service.runAnalysis(repo.id);
    const before = service.get(repo.id);
    expect(before.analysis.status).toBe('done');

    const refreshed = await service.refresh(repo.id);
    expect(refreshed.user).toEqual(before.user);
    expect(refreshed.analysis).toEqual(before.analysis);
    expect(refreshed.github.fetchedAt >= before.github.fetchedAt).toBe(true);
    expect(service.get(repo.id).user.notes).toBe('Мои заметки');
  });

  it('повторный AI-анализ не затирает пользовательские данные и GitHub-блок', async () => {
    const { service } = makeService({ llm: true, analysis: async () => doneAnalysis('Новая сводка') });
    const repo = await addWithUserData(service);
    const before = service.get(repo.id);
    const analyzed = await service.runAnalysis(repo.id);
    expect(analyzed.analysis.summary).toBe('Новая сводка');
    expect(analyzed.user).toEqual(before.user);
    expect(analyzed.github).toEqual(before.github);
  });

  it('сбой AI-анализа не мешает сохранению и фиксируется в статусе failed', async () => {
    const { service } = makeService({
      llm: true,
      analysis: async () => {
        throw new Error('LLM недоступна');
      },
    });
    const repo = await service.add('octo/test');
    expect(repo.analysis.status).toBe('pending');
    const after = await service.runAnalysis(repo.id);
    expect(after.analysis.status).toBe('failed');
    expect(after.analysis.error).toContain('LLM недоступна');
    expect(service.get(repo.id).fullName).toBe('octo/test');
  });

  it('без настроенной LLM анализ не запускается и статус остаётся none', async () => {
    const { service, calls } = makeService({ llm: false });
    const repo = await service.add('octo/test');
    expect(repo.analysis.status).toBe('none');
    await new Promise((r) => setTimeout(r, 10));
    expect(calls.analyze).toBe(0);
    expect(() => service.requestAnalysis(repo.id)).toThrow(/LLM не настроена/);
  });

  it('дубликаты отклоняются без учёта регистра и формы ввода', async () => {
    const { service, calls } = makeService();
    const first = await service.add('octo/test');
    await expect(service.add('OCTO/TEST')).rejects.toBeInstanceOf(DuplicateError);
    await expect(service.add('https://github.com/Octo/Test.git')).rejects.toBeInstanceOf(DuplicateError);
    await expect(service.add('OCTO/TEST')).rejects.toMatchObject({ extra: { repoId: first.id } });
    expect(calls.fetch).toBe(1);
  });

  it('дубликат по каноническому имени (переименованный репозиторий) тоже отклоняется', async () => {
    const { service } = makeService({ fetched: () => fetchedFor('new-owner', 'test') });
    await service.add('new-owner/test');
    await expect(service.add('old-owner/test')).rejects.toBeInstanceOf(DuplicateError);
  });

  it('патч пользовательских данных нормализует темы и не трогает другие блоки', async () => {
    const { service } = makeService();
    const repo = await service.add('octo/test');
    const updated = service.updateUser(repo.id, { topics: [' Веб ', 'веб', 'cli', ''] });
    expect(updated.user.topics).toEqual(['Веб', 'cli']);
    expect(updated.github).toEqual(repo.github);
    expect(updated.analysis).toEqual(repo.analysis);
  });
});
