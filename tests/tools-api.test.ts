import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/server/app.js';
import { openDatabase } from '../src/server/db/database.js';
import { LibraryStore } from '../src/server/library/store.js';
import { JobQueue } from '../src/server/library/queue.js';
import { ToolsStore } from '../src/server/tools/store.js';
import { ToolsService } from '../src/server/tools/service.js';
import { FetchError } from '../src/server/errors.js';
import { emptyToolAnalysis } from '../src/shared/merge.js';
import type { analyzeTool } from '../src/server/ai/tool-analyzer.js';
import type { Tool, ToolSummary } from '../src/shared/types.js';
import { makeSettings, tempDataDir } from './helpers.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const LONG = 'Three.js is a cross-browser JavaScript library for 3D graphics in the browser. '.repeat(10);
const html = (title = 'Three.js') =>
  `<html lang="en"><head><title>${title}</title><meta property="og:description" content="3D library">` +
  `<link rel="icon" href="/icon.png"><meta property="og:image" content="/cover.png"></head><body><main><p>${LONG}</p></main></body></html>`;

type Net = NonNullable<ConstructorParameters<typeof ToolsService>[0]['net']>;
type Analyze = typeof analyzeTool;

const doneAnalysis: Analyze = async () => ({ ...emptyToolAnalysis(), status: 'done', summary: 'Сводка', model: 'mock', generatedAt: new Date().toISOString() });

interface Opts {
  llm?: boolean;
  fetchPage?: Net['fetchPage'];
  fetchImage?: Net['fetchImage'];
  analyze?: Analyze;
}

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

function setup(o: Opts = {}) {
  const dataDir = tempDataDir();
  const dbPath = path.join(dataDir, 'gitlib.sqlite');
  const db = openDatabase(dbPath);
  const store = new LibraryStore(db);
  const toolsStore = new ToolsStore(db, dataDir);
  const settings = makeSettings(dataDir, o.llm === false ? {} : { LLM_BASE_URL: 'http://llm.local/v1', LLM_MODEL: 'mock' });
  const queue = new JobQueue();
  const imagesDir = path.join(dataDir, 'tool-images');
  const calls = { page: 0, image: 0 };
  const toolsService = new ToolsService({
    store: toolsStore,
    settings,
    queue,
    imagesDir,
    net: {
      fetchPage:
        o.fetchPage ??
        (async (url) => {
          calls.page += 1;
          await new Promise((r) => setImmediate(r)); // даёт гонке шанс: оба запроса уже прошли проверку дубля
          return { finalUrl: url, status: 200, contentType: 'text/html', html: html() };
        }),
      fetchImage: o.fetchImage ?? (async () => ({ finalUrl: 'https://x/i.png', contentType: 'image/png', ext: 'png', body: PNG })),
    },
    ai: { analyzeTool: o.analyze ?? doneAnalysis },
  });
  const { app } = buildApp({ dataDir, dbPath, settingsPath: path.join(dataDir, 'settings.json'), store, settings, toolsStore, toolsService });
  apps.push(app);
  const post = (url: string, payload: unknown) => app.inject({ method: 'POST', url, payload: payload as object });
  const add = async (url: string) => (await post('/api/tools', { url })).json<Tool>();
  const get = async (id: string) => (await app.inject({ method: 'GET', url: `/api/tools/${id}` })).json<Tool>();
  return { app, dataDir, imagesDir, queue, calls, post, add, get, toolsStore };
}

describe('POST /api/tools', () => {
  it('загружает страницу, сохраняет черновик с картинками и ставит анализ в очередь', async () => {
    const t = setup();
    const res = await t.post('/api/tools', { url: 'three.js.org' });
    expect(res.statusCode).toBe(201);
    const tool = res.json<Tool>();
    expect(tool.source).toMatchObject({ status: 'ok', title: 'Three.js', description: '3D library', lang: 'en' });
    expect(tool.user.confirmed).toBe(false);
    expect(tool.analysis.status).toBe('pending');
    expect(tool.source.iconPath).toBe(`tool-images/${tool.id}-icon.png`);
    expect(tool.source.imagePath).toBe(`tool-images/${tool.id}-cover.png`);
    expect(fs.existsSync(path.join(t.dataDir, tool.source.iconPath!))).toBe(true);
    await t.queue.idle();
    expect((await t.get(tool.id)).analysis).toMatchObject({ status: 'done', summary: 'Сводка' });
  });

  it('без LLM анализ не ставится: статус none', async () => {
    const t = setup({ llm: false });
    const tool = await t.add('https://three.js.org');
    expect(tool.analysis.status).toBe('none');
  });

  it('дубликат в другом регистре и с UTM → 409 с toolId', async () => {
    const t = setup();
    const tool = await t.add('https://three.js.org');
    for (const url of ['HTTP://www.Three.JS.org/?utm_source=x#top', 'three.js.org/']) {
      const res = await t.post('/api/tools', { url });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ code: 'duplicate', toolId: tool.id });
    }
    expect(t.toolsStore.count()).toBe(1);
  });

  it('дубликат по адресу после редиректа: короткая ссылка на уже добавленную цель — 409, ничего не сохраняется', async () => {
    const t = setup({
      fetchPage: async (url) => ({ finalUrl: url.includes('short.link') ? 'https://target.example/page' : url, status: 200, contentType: 'text/html', html: html() }),
    });
    const first = await t.add('https://target.example/page');
    const res = await t.post('/api/tools', { url: 'https://short.link/abc' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'duplicate', toolId: first.id });
    expect(t.toolsStore.count()).toBe(1);
  });

  it('короткая ссылка добавлена раньше своей цели: добавление цели → 409 с toolId первой', async () => {
    const t = setup({
      fetchPage: async (url) => ({ finalUrl: url.includes('short.link') ? 'https://target.example/page' : url, status: 200, contentType: 'text/html', html: html() }),
    });
    const first = await t.add('https://short.link/abc');
    for (const post of [() => t.post('/api/tools', { url: 'https://target.example/page' }), () => t.post('/api/tools', { url: 'https://target.example/page', manual: { title: 'X' } })]) {
      const res = await post();
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ toolId: first.id });
    }
    expect(t.toolsStore.count()).toBe(1);
  });

  it('два разных адреса с общим finalUrl — две записи', async () => {
    const t = setup({ fetchPage: async () => ({ finalUrl: 'https://login.example/', status: 200, contentType: 'text/html', html: html() }) });
    expect((await t.post('/api/tools', { url: 'https://a.example' })).statusCode).toBe(201);
    expect((await t.post('/api/tools', { url: 'https://b.example' })).statusCode).toBe(201);
    expect(t.toolsStore.count()).toBe(2);
  });

  it('ручное создание подтверждено и не попадает в черновики', async () => {
    const t = setup({ llm: false });
    const tool = (await t.post('/api/tools', { url: 'https://m.example', manual: { title: 'M' } })).json<Tool>();
    expect(tool.user.confirmed).toBe(true);
    const drafts = (await t.app.inject({ method: 'GET', url: '/api/tools?drafts=1' })).json<{ total: number }>();
    expect(drafts.total).toBe(0);
  });

  it('слишком длинный url → 400', async () => {
    const t = setup();
    expect((await t.post('/api/tools', { url: 'https://a.example/' + 'a'.repeat(2000) })).statusCode).toBe(400);
  });

  it('сохраняется исходный адрес пользователя, а адрес после редиректа — в source.finalUrl', async () => {
    const t = setup({ fetchPage: async () => ({ finalUrl: 'https://target.example/page', status: 200, contentType: 'text/html', html: html() }) });
    const tool = await t.add('https://short.link/abc');
    expect(tool.key).toBe('short.link/abc');
    expect(tool.source.finalUrl).toBe('https://target.example/page');
  });

  it('гонка: два одинаковых add дают одну запись и один 409', async () => {
    const t = setup();
    const [a, b] = await Promise.all([t.post('/api/tools', { url: 'https://race.example' }), t.post('/api/tools', { url: 'https://race.example' })]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]);
    expect(t.toolsStore.count()).toBe(1);
    // файлы проигравшего не остаются
    expect(fs.readdirSync(t.imagesDir)).toHaveLength(2);
  });

  it('сбой загрузки пробрасывается как 422 и ничего не сохраняет', async () => {
    const t = setup({
      fetchPage: async () => {
        throw new FetchError('Адрес ведёт во внутреннюю сеть', 'url_forbidden');
      },
    });
    const res = await t.post('/api/tools', { url: 'http://10.0.0.1' });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: 'url_forbidden' });
    expect(t.toolsStore.count()).toBe(0);
  });

  it('исключение разборщика страницы — 422 fetch_parse, а не 500', async () => {
    const t = setup({ fetchPage: async (url) => ({ finalUrl: url, status: 200, contentType: 'text/html', html: null as unknown as string }) });
    const res = await t.post('/api/tools', { url: 'https://broken.example' });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: 'fetch_parse' });
    expect(t.toolsStore.count()).toBe(0);
  });

  it('сбой картинок не мешает: запись создана без них', async () => {
    const t = setup({
      fetchImage: async () => {
        throw new FetchError('Не картинка', 'fetch_not_html');
      },
    });
    const res = await t.post('/api/tools', { url: 'https://noimg.example' });
    expect(res.statusCode).toBe(201);
    expect(res.json<Tool>().source).toMatchObject({ iconPath: null, imagePath: null });
  });

  it('некорректный ввод → 400; неизвестные поля тела → 400', async () => {
    const t = setup();
    expect((await t.post('/api/tools', { url: 'javascript:alert(1)' })).statusCode).toBe(400);
    expect((await t.post('/api/tools', {})).statusCode).toBe(400);
    expect((await t.post('/api/tools', { url: 'https://a.example', extra: 1 })).statusCode).toBe(400);
  });

  it('ручное создание: без сети, текст пользователя — в user, анализ получает описание как текст страницы', async () => {
    let seen = null as Tool | null;
    const t = setup({
      fetchPage: async () => {
        throw new Error('сеть не должна использоваться');
      },
      analyze: async (tool) => {
        seen = tool;
        return doneAnalysis(tool, {} as never, []);
      },
    });
    const res = await t.post('/api/tools', { url: 'https://manual.example', manual: { title: 'Мой сервис', description: 'Делает всякое', category: 'Дизайн', tags: ['Figma'] } });
    expect(res.statusCode).toBe(201);
    const tool = res.json<Tool>();
    expect(tool.source).toMatchObject({ status: 'manual', title: null, description: null, text: null });
    expect(tool.user).toMatchObject({ title: 'Мой сервис', description: 'Делает всякое', category: 'Дизайн', tags: ['Figma'] });
    expect(tool.analysis.status).toBe('pending');
    await t.queue.idle();
    expect(seen!.source).toMatchObject({ title: 'Мой сервис', text: 'Делает всякое' });
    expect((await t.post('/api/tools', { url: 'https://manual.example', manual: { title: 'x' } })).statusCode).toBe(409);
  });

  it('ручное создание без описания не запускает анализ', async () => {
    const t = setup();
    const tool = (await t.post('/api/tools', { url: 'https://nodesc.example', manual: { title: 'Без описания' } })).json<Tool>();
    expect(tool.analysis.status).toBe('none');
  });
});

describe('чтение, PATCH, удаление', () => {
  it('список, поиск и facets', async () => {
    const t = setup({ llm: false });
    await t.add('https://three.js.org');
    await t.post('/api/tools', { url: 'https://figma.example', manual: { title: 'Макеты', category: 'Дизайн' } });
    const all = (await t.app.inject({ method: 'GET', url: '/api/tools' })).json<{ items: ToolSummary[]; total: number }>();
    expect(all.total).toBe(2);
    expect(all.items[0]).not.toHaveProperty('source.text');
    const found = (await t.app.inject({ method: 'GET', url: `/api/tools?q=${encodeURIComponent('МАКЕТЫ')}` })).json<{ total: number }>();
    expect(found.total).toBe(1);
    const facets = (await t.app.inject({ method: 'GET', url: '/api/tools/facets' })).json();
    expect(facets).toMatchObject({ total: 2, drafts: 1 });
    expect((await t.app.inject({ method: 'GET', url: '/api/tools/nope' })).statusCode).toBe(404);
  });

  it('PATCH не трогает source и analysis; imagePath и неизвестные поля → 400', async () => {
    const t = setup();
    const tool = await t.add('https://three.js.org');
    await t.queue.idle();
    const before = await t.get(tool.id);
    const res = await t.app.inject({
      method: 'PATCH',
      url: `/api/tools/${tool.id}`,
      payload: { notes: 'Заметка', tags: ['WebGL'], favorite: true, confirmed: true, overrides: { summary: 'Моя сводка', features: ['а', 'б'] } },
    });
    expect(res.statusCode).toBe(200);
    const after = res.json<Tool>();
    expect(after.source).toEqual(before.source);
    expect(after.analysis).toEqual(before.analysis);
    expect(after.user).toMatchObject({ notes: 'Заметка', tags: ['WebGL'], favorite: true, confirmed: true, overrides: { summary: 'Моя сводка', features: ['а', 'б'] } });

    const patch = (payload: object) => t.app.inject({ method: 'PATCH', url: `/api/tools/${tool.id}`, payload });
    expect((await patch({ imagePath: '../../x' })).statusCode).toBe(400);
    expect((await patch({ overrides: { imagePath: 'x' } })).statusCode).toBe(400);
    expect((await patch({ source: {} })).statusCode).toBe(400);
    expect((await t.get(tool.id)).user.imagePath).toBeNull();
    // null снимает правку
    const cleared = (await patch({ overrides: { summary: null } })).json<Tool>();
    expect(cleared.user.overrides.summary).toBeUndefined();
    expect(cleared.user.overrides.features).toEqual(['а', 'б']);
  });

  it('DELETE → 204, запись и файлы картинок исчезают', async () => {
    const t = setup();
    const tool = await t.add('https://three.js.org');
    expect(fs.readdirSync(t.imagesDir).length).toBe(2);
    expect((await t.app.inject({ method: 'DELETE', url: `/api/tools/${tool.id}` })).statusCode).toBe(204);
    expect((await t.app.inject({ method: 'GET', url: `/api/tools/${tool.id}` })).statusCode).toBe(404);
    expect((await t.app.inject({ method: 'DELETE', url: `/api/tools/${tool.id}` })).statusCode).toBe(404);
    expect(fs.readdirSync(t.imagesDir)).toEqual([]);
  });

  it('chat: тело проверяется (роль system, лишнее поле, пустой список → 400), без LLM — 400, 404 для чужого id', async () => {
    const t = setup({ llm: false });
    const tool = await t.add('https://three.js.org');
    const url = `/api/tools/${tool.id}/chat`;
    expect((await t.post(url, { messages: [{ role: 'system', content: 'x' }] })).statusCode).toBe(400);
    expect((await t.post(url, { messages: [{ role: 'user', content: 'x', extra: 1 }] })).statusCode).toBe(400);
    expect((await t.post(url, { messages: [] })).statusCode).toBe(400);
    expect((await t.post(url, { messages: [{ role: 'user', content: 'Что это?' }] })).statusCode).toBe(400);
    expect((await t.post('/api/tools/нет/chat', { messages: [{ role: 'user', content: 'Что это?' }] })).statusCode).toBe(404);
  });

  it('recommend: короткая задача → 400; без LLM — поиск по словам; пустая библиотека — notice', async () => {
    const t = setup({ llm: false });
    expect((await t.post('/api/tools/recommend', { task: 'я' })).statusCode).toBe(400);
    const empty = (await t.post('/api/tools/recommend', { task: 'нужен редактор схем' })).json();
    expect(empty).toMatchObject({ mode: 'search', items: [], notice: 'В библиотеке пока нет инструментов' });
    await t.add('https://three.js.org');
    const found = (await t.post('/api/tools/recommend', { task: 'Three.js' })).json();
    expect(found).toMatchObject({ mode: 'search', notice: 'LLM не настроена — показан поиск по словам' });
    expect(found.items).toHaveLength(1);
  });

  it('health показывает число инструментов', async () => {
    const t = setup();
    await t.add('https://three.js.org');
    expect((await t.app.inject({ method: 'GET', url: '/api/health' })).json()).toMatchObject({ tools: 1 });
  });
});

describe('refresh', () => {
  it('заменяет только source; user (включая overrides) и analysis не меняются', async () => {
    let title = 'Старый заголовок';
    const t = setup({ fetchPage: async (url) => ({ finalUrl: url, status: 200, contentType: 'text/html', html: html(title) }) });
    const tool = await t.add('https://three.js.org');
    await t.queue.idle();
    await t.app.inject({ method: 'PATCH', url: `/api/tools/${tool.id}`, payload: { notes: 'моё', overrides: { purpose: 'моя цель' } } });
    const before = await t.get(tool.id);
    title = 'Новый заголовок';
    const res = await t.post(`/api/tools/${tool.id}/refresh`, undefined);
    expect(res.statusCode).toBe(200);
    const after = await t.get(tool.id);
    expect(after.source.title).toBe('Новый заголовок');
    expect(after.user).toEqual(before.user);
    expect(after.analysis).toEqual(before.analysis);
    expect(t.queue.size()).toBe(0); // анализ сам не перезапускается
  });

  it('ошибка загрузки оставляет прежний source и пробрасывается клиенту', async () => {
    let fail = false;
    const t = setup({
      fetchPage: async (url) => {
        if (fail) throw new FetchError('Сайт недоступен', 'fetch_unreachable');
        return { finalUrl: url, status: 200, contentType: 'text/html', html: html() };
      },
    });
    const tool = await t.add('https://three.js.org');
    fail = true;
    const res = await t.post(`/api/tools/${tool.id}/refresh`, undefined);
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: 'fetch_unreachable' });
    expect((await t.get(tool.id)).source).toEqual(tool.source);
  });

  it('новая картинка не скачалась — остаётся старая', async () => {
    let failImages = false;
    const t = setup({
      fetchImage: async () => {
        if (failImages) throw new FetchError('нет', 'fetch_unreachable');
        return { finalUrl: 'https://x/i.png', contentType: 'image/png', ext: 'png', body: PNG };
      },
    });
    const tool = await t.add('https://three.js.org');
    failImages = true;
    await t.post(`/api/tools/${tool.id}/refresh`, undefined);
    expect((await t.get(tool.id)).source.iconPath).toBe(tool.source.iconPath);
  });
});

describe('анализ', () => {
  it('сбой анализа не мешает сохранению: запись есть, статус failed, есть повтор', async () => {
    let ok = false;
    const t = setup({
      analyze: async (tool, s, c) => {
        if (!ok) throw new Error('модель недоступна');
        return doneAnalysis(tool, s, c);
      },
    });
    const tool = await t.add('https://three.js.org');
    await t.queue.idle();
    expect((await t.get(tool.id)).analysis).toMatchObject({ status: 'failed', error: 'модель недоступна' });
    ok = true;
    const retry = await t.post(`/api/tools/${tool.id}/analyze`, undefined);
    expect(retry.json<Tool>().analysis.status).toBe('pending');
    await t.queue.idle();
    expect((await t.get(tool.id)).analysis.status).toBe('done');
  });

  it('?wait=1 выполняет анализ ровно один раз и не трогает user', async () => {
    let runs = 0;
    const t = setup({
      llm: true,
      analyze: async (tool, s, c) => {
        runs += 1;
        return doneAnalysis(tool, s, c);
      },
    });
    const tool = await t.add('https://three.js.org');
    await t.queue.idle();
    runs = 0;
    await t.app.inject({ method: 'PATCH', url: `/api/tools/${tool.id}`, payload: { notes: 'моё', overrides: { summary: 'моя' } } });
    const user = (await t.get(tool.id)).user;
    const res = await t.post(`/api/tools/${tool.id}/analyze?wait=1`, undefined);
    expect(res.json<Tool>().analysis.status).toBe('done');
    await t.queue.idle();
    expect(runs).toBe(1);
    expect((await t.get(tool.id)).user).toEqual(user);
  });

  it('без LLM анализ → 400', async () => {
    const t = setup({ llm: false });
    const tool = await t.add('https://three.js.org');
    expect((await t.post(`/api/tools/${tool.id}/analyze`, undefined)).statusCode).toBe(400);
  });

  it('правка overrides, сделанная, пока модель думала, сохраняется', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const t = setup({
      analyze: async (tool, s, c) => {
        await gate;
        return doneAnalysis(tool, s, c);
      },
    });
    const tool = await t.add('https://three.js.org');
    await t.app.inject({ method: 'PATCH', url: `/api/tools/${tool.id}`, payload: { notes: 'во время анализа', overrides: { summary: 'моя сводка' } } });
    release();
    await t.queue.idle();
    const after = await t.get(tool.id);
    expect(after.analysis.status).toBe('done');
    expect(after.user.overrides.summary).toBe('моя сводка');
    expect(after.user.notes).toBe('во время анализа');
  });

  it('удаление записи во время анализа не роняет очередь', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const t = setup({
      analyze: async (tool, s, c) => {
        await gate;
        return doneAnalysis(tool, s, c);
      },
    });
    const tool = await t.add('https://three.js.org');
    await t.app.inject({ method: 'DELETE', url: `/api/tools/${tool.id}` });
    release();
    await t.queue.idle();
    expect(t.queue.size()).toBe(0);
  });
});

describe('PUT /api/tools/:id/image и /tool-images/', () => {
  it('своя картинка: путь строится из id, файл отдаётся с nosniff и CSP sandbox; null снимает', async () => {
    const t = setup({ llm: false });
    const tool = await t.add('https://three.js.org');
    const put = (imageUrl: string | null) => t.app.inject({ method: 'PUT', url: `/api/tools/${tool.id}/image`, payload: { imageUrl } });

    const res = await put('https://cdn.example/evil/../../x.png');
    expect(res.statusCode).toBe(200);
    expect(res.json<Tool>().user.imagePath).toBe(`tool-images/${tool.id}-user.png`);

    const file = await t.app.inject({ method: 'GET', url: `/${res.json<Tool>().user.imagePath}` });
    expect(file.statusCode).toBe(200);
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(file.headers['content-security-policy']).toBe('sandbox');
    const icon = await t.app.inject({ method: 'GET', url: `/${tool.source.iconPath}` });
    expect(icon.headers['x-content-type-options']).toBe('nosniff');
    expect(icon.headers['content-security-policy']).toBe('sandbox');

    const cleared = await put(null);
    expect(cleared.json<Tool>().user.imagePath).toBeNull();
    expect(fs.existsSync(path.join(t.imagesDir, `${tool.id}-user.png`))).toBe(false);  });

  it('ошибка загрузки своей картинки — 422, user.imagePath не меняется', async () => {
    const t = setup({
      llm: false,
      fetchImage: async () => {
        throw new FetchError('Адрес ведёт во внутреннюю сеть', 'url_forbidden');
      },
    });
    const tool = await t.add('https://three.js.org');
    const res = await t.app.inject({ method: 'PUT', url: `/api/tools/${tool.id}/image`, payload: { imageUrl: 'http://127.0.0.1/a.png' } });
    expect(res.statusCode).toBe(422);
    expect((await t.get(tool.id)).user.imagePath).toBeNull();
  });
});

describe('очередь', () => {
  it('JobQueue: ключ не ставится дважды, ошибка задачи не останавливает остальные', async () => {
    const q = new JobQueue();
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    q.enqueue('a', async () => {
      await gate;
      order.push('a');
    });
    q.enqueue('b', async () => {
      throw new Error('boom');
    });
    q.enqueue('b', async () => {
      order.push('b-дубль');
    });
    q.enqueue('c', async () => {
      order.push('c');
    });
    expect(q.size()).toBe(3);
    release();
    await q.idle();
    expect(order).toEqual(['a', 'c']);
    expect(q.size()).toBe(0);
  });
});
