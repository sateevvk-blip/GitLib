import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/server/app.js';
import { LibraryService } from '../src/server/library/service.js';
import type { Repo } from '../src/shared/types.js';
import { makeGithub, makeSettings, makeStore } from './helpers.js';

let app: FastifyInstance;
let analyzeCalls = 0;

beforeAll(async () => {
  const { store, dataDir } = makeStore();
  const settings = makeSettings(dataDir, { LLM_BASE_URL: 'http://llm.local/v1', LLM_MODEL: 'mock', GITHUB_TOKEN: 'ghp_secret_token_1234' });
  const service = new LibraryService({
    store,
    settings,
    github: {
      fetchRepository: async (owner, name) => {
        if (name === 'missing') {
          const { GithubError } = await import('../src/server/errors.js');
          throw new GithubError('Репозиторий не найден на GitHub', 'not_found', 404);
        }
        return { github: makeGithub({ htmlUrl: `https://github.com/${owner}/${name}`, ownerLogin: owner, description: 'Утилита для бэкапов' }), canonical: { owner, name } };
      },
      downloadAvatar: async () => null,
    },
    ai: {
      analyzeRepo: async () => {
        analyzeCalls += 1;
        return { status: 'done', summary: 'Сводка', useCases: ['Бэкап'], suggestedTopics: ['backup'], model: 'mock', generatedAt: new Date().toISOString(), error: null };
      },
    },
  });
  ({ app } = buildApp({ dataDir, dbPath: path.join(dataDir, 'gitlib.sqlite'), settingsPath: path.join(dataDir, 'settings.json'), store, settings, service }));
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('REST API', () => {
  let id = '';

  it('POST /api/repos добавляет запись и ставит анализ в очередь', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/repos', payload: { input: 'https://github.com/Octo/Backup-Tool' } });
    expect(res.statusCode).toBe(201);
    const repo = res.json<Repo>();
    expect(repo.fullName).toBe('Octo/Backup-Tool');
    expect(repo.analysis.status).toBe('pending');
    id = repo.id;
  });

  it('дубликат → 409 с id существующей записи', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/repos', payload: { input: 'octo/backup-tool' } });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'duplicate', repoId: id });
  });

  it('некорректный ввод → 400, не найден на GitHub → 404', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/repos', payload: { input: 'https://gitlab.com/a/b' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/repos', payload: { input: 'octo/missing' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/api/repos', payload: {} })).statusCode).toBe(400);
  });

  it('GET /api/repos ищет по кириллице и фильтрует', async () => {
    const all = await app.inject({ method: 'GET', url: '/api/repos' });
    expect(all.json<{ total: number }>().total).toBe(1);
    const found = await app.inject({ method: 'GET', url: `/api/repos?q=${encodeURIComponent('БЭКАП')}` });
    expect(found.json<{ total: number }>().total).toBe(1);
    const none = await app.inject({ method: 'GET', url: '/api/repos?statuses=using' });
    expect(none.json<{ total: number }>().total).toBe(0);
  });

  it('PATCH сохраняет пользовательские данные, отклоняет неизвестные поля', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/api/repos/${id}`, payload: { notes: 'Заметка', status: 'using', favorite: true, topics: ['Бэкапы'] } });
    expect(res.statusCode).toBe(200);
    expect(res.json<Repo>().user).toMatchObject({ notes: 'Заметка', status: 'using', favorite: true, topics: ['Бэкапы'] });
    const bad = await app.inject({ method: 'PATCH', url: `/api/repos/${id}`, payload: { github: { stars: 1 } } });
    expect(bad.statusCode).toBe(400);
    const badStatus = await app.inject({ method: 'PATCH', url: `/api/repos/${id}`, payload: { status: 'wat' } });
    expect(badStatus.statusCode).toBe(400);
  });

  it('POST /analyze?wait=1 выполняет анализ, пользовательские данные целы', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/repos/${id}/analyze?wait=1` });
    expect(res.statusCode).toBe(200);
    const repo = res.json<Repo>();
    expect(repo.analysis.status).toBe('done');
    expect(repo.user.notes).toBe('Заметка');
    expect(analyzeCalls).toBeGreaterThan(0);
  });

  it('POST /refresh обновляет GitHub-блок и не трогает user/analysis', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/repos/${id}/refresh` });
    expect(res.statusCode).toBe(200);
    const repo = res.json<Repo>();
    expect(repo.user.status).toBe('using');
    expect(repo.analysis.status).toBe('done');
  });

  it('коллекции: создание, членство, фильтр', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/collections', payload: { name: 'Инфраструктура' } });
    expect(created.statusCode).toBe(201);
    const cid = created.json<{ id: string }>().id;
    const dup = await app.inject({ method: 'POST', url: '/api/collections', payload: { name: 'инфраструктура' } });
    expect(dup.statusCode).toBe(400);
    const member = await app.inject({ method: 'POST', url: `/api/collections/${cid}/repos`, payload: { repoId: id } });
    expect(member.json<{ repoIds: string[] }>().repoIds).toEqual([id]);
    const filtered = await app.inject({ method: 'GET', url: `/api/repos?collection=${cid}` });
    expect(filtered.json<{ total: number }>().total).toBe(1);
    const removed = await app.inject({ method: 'DELETE', url: `/api/collections/${cid}/repos/${id}` });
    expect(removed.json<{ repoIds: string[] }>().repoIds).toEqual([]);
  });

  it('настройки маскируют секреты и валидируют URL', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/settings' });
    const body = res.body;
    expect(body).not.toContain('ghp_secret_token_1234');
    expect(res.json()).toMatchObject({ githubToken: { configured: true, source: 'env' }, llmConfigured: true });
    const bad = await app.inject({ method: 'PUT', url: '/api/settings', payload: { llmBaseUrl: 'localhost:1234' } });
    expect(bad.statusCode).toBe(400);
    const ok = await app.inject({ method: 'PUT', url: '/api/settings', payload: { llmTimeoutSec: 30 } });
    expect(ok.json()).toMatchObject({ llmTimeoutSec: 30 });
  });

  it('экспорт и импорт через API', async () => {
    const exp = await app.inject({ method: 'GET', url: '/api/export' });
    expect(exp.statusCode).toBe(200);
    expect(exp.headers['content-disposition']).toContain('gitlib-');
    const file = exp.json<{ format: string; repos: unknown[] }>();
    expect(file.format).toBe('gitlib-library');
    expect(file.repos).toHaveLength(1);

    const preview = await app.inject({ method: 'POST', url: '/api/import/preview', payload: file });
    expect(preview.json()).toMatchObject({ repos: { total: 1, new: 0, duplicates: 1 } });

    const applied = await app.inject({ method: 'POST', url: '/api/import?strategy=skip', payload: file });
    expect(applied.json()).toMatchObject({ added: 0, skipped: 1 });

    const invalid = await app.inject({ method: 'POST', url: '/api/import/preview', payload: { hello: 'world' } });
    expect(invalid.statusCode).toBe(400);
    const badStrategy = await app.inject({ method: 'POST', url: '/api/import?strategy=nuke', payload: file });
    expect(badStrategy.statusCode).toBe(400);
  });

  it('DELETE удаляет запись, повторный GET → 404', async () => {
    expect((await app.inject({ method: 'DELETE', url: `/api/repos/${id}` })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/api/repos/${id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/unknown' })).statusCode).toBe(404);
  });
});
