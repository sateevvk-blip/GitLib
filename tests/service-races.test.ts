import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/server/app.js';
import { LibraryService } from '../src/server/library/service.js';
import type { AnalysisData } from '../src/shared/types.js';
import { makeGithub, makeRepo, makeSettings, makeStore } from './helpers.js';

const LLM = { LLM_BASE_URL: 'http://llm.local/v1', LLM_MODEL: 'mock' };

function gate(): { wait: Promise<void>; open: () => void } {
  let open!: () => void;
  const wait = new Promise<void>((r) => (open = r));
  return { wait, open };
}

const done = (summary: string): AnalysisData => ({
  status: 'done',
  summary,
  useCases: [],
  suggestedTopics: [],
  model: 'mock',
  generatedAt: new Date().toISOString(),
  error: null,
});

describe('сервис: правки во время ожидания сети', () => {
  it('удаление записи во время анализа не роняет процесс, очередь идёт дальше', async () => {
    const { store, dataDir } = makeStore();
    const g = gate();
    const analyzed: string[] = [];
    const service = new LibraryService({
      store,
      settings: makeSettings(dataDir, LLM),
      ai: {
        analyzeRepo: async (r) => {
          await g.wait;
          analyzed.push(r.id);
          return done('ok');
        },
      },
    });
    const a = store.insert(makeRepo('octo/a'));
    const b = store.insert(makeRepo('octo/b', { id: 'b-id' }));
    const rejections: unknown[] = [];
    const onRejection = (e: unknown) => rejections.push(e);
    process.on('unhandledRejection', onRejection);
    try {
      service.requestAnalysis(a.id);
      service.requestAnalysis(b.id);
      service.delete(a.id);
      g.open();
      await new Promise((r) => setTimeout(r, 50));
    } finally {
      process.off('unhandledRejection', onRejection);
    }
    expect(rejections).toEqual([]);
    expect(store.getById(b.id)?.analysis.status).toBe('done');
    expect(service.pendingCount()).toBe(0);
  });

  it('refresh не затирает заметки и анализ, изменённые пока шёл запрос к GitHub', async () => {
    const { store, dataDir } = makeStore();
    const g = gate();
    const repo = store.insert(makeRepo('octo/r'));
    const service = new LibraryService({
      store,
      settings: makeSettings(dataDir),
      github: {
        fetchRepository: async () => {
          await g.wait;
          return { github: makeGithub({ description: 'новое описание' }), canonical: { owner: 'octo', name: 'r' } };
        },
        downloadAvatar: async () => null,
      },
    });
    const pending = service.refresh(repo.id);
    service.updateUser(repo.id, { notes: 'написано во время обновления' });
    store.updateAnalysis(repo.id, done('сводка, готовая во время обновления'));
    g.open();
    await pending;
    const saved = store.getById(repo.id)!;
    expect(saved.github.description).toBe('новое описание');
    expect(saved.user.notes).toBe('написано во время обновления');
    expect(saved.analysis.summary).toBe('сводка, готовая во время обновления');
  });

  it('два одновременных добавления одного репозитория: второе — дубликат, а не 500', async () => {
    const { store, dataDir } = makeStore();
    const g = gate();
    const service = new LibraryService({
      store,
      settings: makeSettings(dataDir),
      github: {
        fetchRepository: async (owner, name) => {
          await g.wait;
          return { github: makeGithub({ ownerLogin: owner }), canonical: { owner, name } };
        },
        downloadAvatar: async () => null,
      },
    });
    const first = service.add('octo/twice');
    const second = service.add('octo/twice');
    g.open();
    await expect(first).resolves.toMatchObject({ fullName: 'octo/twice' });
    await expect(second).rejects.toMatchObject({ code: 'duplicate' });
    expect(store.count()).toBe(1);
  });
});

describe('защита от DNS rebinding', () => {
  it('запросы с чужим Host отклоняются, localhost и 127.0.0.1 проходят', async () => {
    const { store, dataDir } = makeStore();
    const settings = makeSettings(dataDir);
    const { app } = buildApp({ dataDir, dbPath: path.join(dataDir, 'gitlib.sqlite'), settingsPath: path.join(dataDir, 'settings.json'), store, settings });
    await app.ready();
    try {
      const evil = await app.inject({ method: 'GET', url: '/api/settings', headers: { host: 'evil.example:4817' } });
      expect(evil.statusCode).toBe(403);
      expect(evil.json()).toMatchObject({ code: 'forbidden_host' });
      const put = await app.inject({ method: 'PUT', url: '/api/settings', headers: { host: 'evil.example' }, payload: { llmBaseUrl: 'https://evil.example' } });
      expect(put.statusCode).toBe(403);
      expect(settings.get().llmBaseUrl).toBe('');
      for (const host of ['localhost:4817', '127.0.0.1:4817', '[::1]:4817', 'LOCALHOST']) {
        const ok = await app.inject({ method: 'GET', url: '/api/health', headers: { host } });
        expect(ok.statusCode, host).toBe(200);
      }
    } finally {
      await app.close();
    }
  });
});
