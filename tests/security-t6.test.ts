// Проверка безопасности T6: статика /tool-images/, маршруты /api/tools*, сервис картинок. Без сети.
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
import type { Tool } from '../src/shared/types.js';
import { makeSettings, makeTool, tempDataDir } from './helpers.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><script>fetch("/api/settings")</script></svg>';
const HTML = '<html><head><title>X</title><link rel="icon" href="/i.png"></head><body><main><p>' + 'text '.repeat(200) + '</p></main></body></html>';

type Net = NonNullable<ConstructorParameters<typeof ToolsService>[0]['net']>;

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

/** realNet = true — настоящий загрузчик (только для адресов, которые он обязан отклонить до соединения). */
function setup(o: { net?: Partial<Net>; realNet?: boolean } = {}) {
  const dataDir = tempDataDir();
  const dbPath = path.join(dataDir, 'gitlib.sqlite');
  const db = openDatabase(dbPath);
  const store = new LibraryStore(db);
  const toolsStore = new ToolsStore(db);
  const settings = makeSettings(dataDir);
  const imagesDir = path.join(dataDir, 'tool-images');
  const net: Net | undefined = o.realNet
    ? undefined
    : {
        fetchPage: o.net?.fetchPage ?? (async (url) => ({ finalUrl: url, status: 200, contentType: 'text/html', html: HTML })),
        fetchImage: o.net?.fetchImage ?? (async () => ({ finalUrl: 'https://x/i.png', contentType: 'image/png', ext: 'png', body: PNG })),
      };
  const toolsService = new ToolsService({ store: toolsStore, settings, queue: new JobQueue(), imagesDir, net });
  const { app } = buildApp({ dataDir, dbPath, settingsPath: path.join(dataDir, 'settings.json'), store, settings, toolsStore, toolsService });
  apps.push(app);
  // секрет рядом с картинками: его не должно быть видно через /tool-images/
  fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify({ llmApiKey: 'sk-SECRET-T6', githubToken: 'ghp_SECRET_T6' }));
  fs.mkdirSync(path.join(dataDir, 'avatars'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'avatars', 'octo.png'), PNG);
  return { app, dataDir, imagesDir, toolsStore, toolsService };
}

const isLeak = (body: string) => /SECRET|SQLite format|PNG/.test(body);

describe('/tool-images/: обход пути', () => {
  const attempts = [
    '/tool-images/../settings.json',
    '/tool-images/..%2fsettings.json',
    '/tool-images/%2e%2e/settings.json',
    '/tool-images/%2e%2e%2fsettings.json',
    '/tool-images/..%5csettings.json',
    '/tool-images/..\\settings.json',
    '/tool-images/%2e%2e%5cgitlib.sqlite',
    '/tool-images/..%252fsettings.json',
    '/tool-images/....//settings.json',
    '/tool-images/..%c0%afsettings.json',
    '/tool-images/..%2favatars%2focto.png',
    '/tool-images/%5c..%5csettings.json',
    '/tool-images//settings.json',
    '/tool-images/settings.json%00.png',
    '/tool-images/C:%5cWindows%5cwin.ini',
    '/tool-images/%5c%5c127.0.0.1%5cc$%5cWindows%5cwin.ini',
  ];
  for (const url of attempts) {
    it(`не отдаёт файл вне папки: ${url}`, async () => {
      const t = setup();
      const res = await t.app.inject({ method: 'GET', url });
      expect(res.statusCode).not.toBe(200);
      expect(isLeak(res.body)).toBe(false);
    });
  }

  it('не показывает список файлов папки', async () => {
    const t = setup();
    fs.writeFileSync(path.join(t.imagesDir, 'abc-icon.png'), PNG);
    for (const url of ['/tool-images/', '/tool-images', '/tool-images/.']) {
      const res = await t.app.inject({ method: 'GET', url });
      expect(res.body).not.toContain('abc-icon');
    }
  });
});

describe('/tool-images/: заголовки на всех ответах с телом файла', () => {
  const name = 'abc-user.svg';
  const prepare = () => {
    const t = setup();
    fs.writeFileSync(path.join(t.imagesDir, name), SVG);
    return t;
  };
  const expectGuard = (h: Record<string, unknown>) => {
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(String(h['content-security-policy'])).toMatch(/sandbox/);
  };

  it('200: SVG со скриптом отдаётся как image/svg+xml в песочнице', async () => {
    const t = prepare();
    const res = await t.app.inject({ method: 'GET', url: `/tool-images/${name}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^image\/svg\+xml/);
    expectGuard(res.headers);
  });

  it('HEAD, 206 и 304 тоже с nosniff и sandbox', async () => {
    const t = prepare();
    const head = await t.app.inject({ method: 'HEAD', url: `/tool-images/${name}` });
    expectGuard(head.headers);
    const range = await t.app.inject({ method: 'GET', url: `/tool-images/${name}`, headers: { range: 'bytes=0-10' } });
    expect(range.statusCode).toBe(206);
    expectGuard(range.headers);
    const etag = String(head.headers.etag);
    const nm = await t.app.inject({ method: 'GET', url: `/tool-images/${name}`, headers: { 'if-none-match': etag } });
    expect(nm.statusCode).toBe(304);
    expectGuard(nm.headers);
  });

  it('неизвестное расширение (обход через Windows-суффиксы) не превращается в HTML', async () => {
    const t = prepare();
    for (const url of [`/tool-images/${name}.`, `/tool-images/${name}::$DATA`, `/tool-images/${name.toUpperCase()}`]) {
      const res = await t.app.inject({ method: 'GET', url });
      if (res.statusCode === 200) {
        expect(String(res.headers['content-type'] ?? '')).not.toMatch(/html|xml\b(?!.*svg)/);
        expectGuard(res.headers);
      }
    }
  });
});

describe('DNS rebinding: новые маршруты за проверкой Host', () => {
  for (const [method, url] of [
    ['GET', '/api/tools'],
    ['POST', '/api/tools'],
    ['GET', '/tool-images/abc-user.svg'],
    ['PUT', '/api/tools/x/image'],
  ] as const) {
    it(`${method} ${url} с чужим Host → 403`, async () => {
      const t = setup();
      fs.writeFileSync(path.join(t.imagesDir, 'abc-user.svg'), SVG);
      const res = await t.app.inject({ method, url, headers: { host: 'evil.example:4817' }, payload: method === 'GET' ? undefined : { url: 'a.com' } });
      expect(res.statusCode).toBe(403);
    });
  }
});

describe('Внешние вызовы только через загрузчик (настоящий fetcher, без сети)', () => {
  const forbidden = [
    'http://127.0.0.1:4817/api/settings',
    'http://[::1]/x.png',
    'http://169.254.169.254/latest/meta-data/',
    'http://2130706433/x.png',
    'http://0x7f.1/x.png',
    'http://0.0.0.0/x.png',
    'http://[::ffff:10.0.0.1]/x.png',
    'file:///C:/Windows/win.ini',
    'data:image/svg+xml,<svg/>',
    'http://user:pass@example.com/x.png',
  ];
  for (const imageUrl of forbidden) {
    it(`PUT /image ${imageUrl} → 422, картинка не меняется`, async () => {
      const t = setup({ realNet: true });
      const tool = makeTool('https://example.com');
      t.toolsStore.insert(tool);
      const res = await t.app.inject({ method: 'PUT', url: `/api/tools/${tool.id}/image`, payload: { imageUrl } });
      expect(res.statusCode).toBe(422);
      expect(t.toolsStore.getById(tool.id)!.user.imagePath).toBeNull();
      expect(fs.readdirSync(t.imagesDir)).toEqual([]);
    });
  }

  it('refresh ручной карточки с внутренним адресом идёт через загрузчик и отклоняется', async () => {
    const t = setup({ realNet: true });
    const res = await t.app.inject({ method: 'POST', url: '/api/tools', payload: { url: 'http://127.0.0.1:4817/', manual: { title: 'X' } } });
    expect(res.statusCode).toBe(201);
    const id = res.json<Tool>().id;
    const r = await t.app.inject({ method: 'POST', url: `/api/tools/${id}/refresh` });
    expect(r.statusCode).toBe(422);
    expect(r.json().code).toBe('url_forbidden');
  });

  it('загрузчик не получает настроек: ни токена, ни ключа в аргументах', async () => {
    const seen: unknown[] = [];
    const t = setup({
      net: {
        fetchPage: async (url, opts) => {
          seen.push(url, opts);
          return { finalUrl: url, status: 200, contentType: 'text/html', html: HTML };
        },
        fetchImage: async (url, opts) => {
          seen.push(url, opts);
          return { finalUrl: url, contentType: 'image/png', ext: 'png', body: PNG };
        },
      },
    });
    const add = await t.app.inject({ method: 'POST', url: '/api/tools', payload: { url: 'example.com' } });
    expect(add.statusCode).toBe(201);
    await t.app.inject({ method: 'PUT', url: `/api/tools/${add.json<Tool>().id}/image`, payload: { imageUrl: 'https://example.com/a.png' } });
    expect(JSON.stringify(seen)).not.toMatch(/SECRET|token|apiKey|cookie|authorization/i);
  });
});

describe('Подмена путей картинок через тело запроса', () => {
  for (const payload of [
    { imagePath: '../../gitlib.sqlite' },
    { user: { imagePath: '../x' } },
    { source: { iconPath: '../x' } },
    { iconPath: '../x' },
    { overrides: { imagePath: '../x' } },
    { overrides: { summary: 'x', extra: 1 } },
  ]) {
    it(`PATCH ${JSON.stringify(payload)} → 400`, async () => {
      const t = setup();
      const tool = makeTool('https://example.com');
      t.toolsStore.insert(tool);
      const res = await t.app.inject({ method: 'PATCH', url: `/api/tools/${tool.id}`, payload });
      expect(res.statusCode).toBe(400);
      const after = t.toolsStore.getById(tool.id)!;
      expect(after.user.imagePath).toBeNull();
      expect(after.source.iconPath).toBe(tool.source.iconPath);
    });
  }

  it('PATCH с __proto__ в JSON не подкладывает imagePath', async () => {
    const t = setup();
    const tool = makeTool('https://example.com');
    t.toolsStore.insert(tool);
    const raw = '{"title":"x","__proto__":{"imagePath":"../x"},"constructor":{"prototype":{"imagePath":"../y"}}}';
    await t.app.inject({ method: 'PATCH', url: `/api/tools/${tool.id}`, headers: { 'content-type': 'application/json' }, payload: raw });
    expect(t.toolsStore.getById(tool.id)!.user.imagePath).toBeNull();
    expect(({} as Record<string, unknown>).imagePath).toBeUndefined();
  });

  it('POST /api/tools с лишними полями (id, imagePath) → 400', async () => {
    const t = setup();
    for (const payload of [
      { url: 'a.com', id: '../../x' },
      { url: 'a.com', manual: { title: 'X', imagePath: '../x' } },
    ]) {
      const res = await t.app.inject({ method: 'POST', url: '/api/tools', payload });
      expect(res.statusCode).toBe(400);
    }
  });

  it('PUT /image принимает только imageUrl', async () => {
    const t = setup();
    const tool = makeTool('https://example.com');
    t.toolsStore.insert(tool);
    const res = await t.app.inject({ method: 'PUT', url: `/api/tools/${tool.id}/image`, payload: { imageUrl: null, imagePath: '../x' } });
    expect(res.statusCode).toBe(400);
  });

  it('имя файла картинки — только из id и расширения загрузчика, ничего из адреса сайта', async () => {
    const t = setup({
      net: {
        fetchImage: async () => ({ finalUrl: 'https://e.com/..%2f..%2fevil.svg', contentType: 'image/svg+xml', ext: 'svg', body: Buffer.from(SVG) }),
      },
    });
    const add = await t.app.inject({ method: 'POST', url: '/api/tools', payload: { url: 'https://e.com/../../x' } });
    const tool = add.json<Tool>();
    const files = fs.readdirSync(t.imagesDir);
    for (const f of files) expect(f).toMatch(new RegExp(`^${tool.id}-(icon|cover|user)\\.(png|jpg|webp|gif|ico|svg)$`));
    expect(files.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(t.dataDir, 'evil.svg'))).toBe(false);
  });

  // Защита в глубину: id записи сейчас всегда randomUUID, но T8 (импорт) будет вставлять записи из файла.
  // Сервис строит путь файла из id без проверки формата — запись с id «../../x» пишет файл вне tool-images,
  // а id-префикс («abc») удаляет файлы чужой записи «abc-…».
  it('setImage не пишет файл вне tool-images, даже если id записи не UUID', async () => {
    const t = setup();
    const evil = makeTool('https://evil.com', { id: '../escaped' });
    t.toolsStore.insert(evil);
    await t.toolsService.setImage(evil.id, 'https://evil.com/a.png').catch(() => {});
    expect(fs.existsSync(path.join(t.dataDir, 'escaped-user.png'))).toBe(false);
  });

  it('удаление записи с коротким id не трогает файлы другой записи', async () => {
    const t = setup();
    const a = makeTool('https://a.com', { id: 'abc' });
    const b = makeTool('https://b.com', { id: 'abc-def' });
    t.toolsStore.insert(a);
    t.toolsStore.insert(b);
    await t.toolsService.setImage(b.id, 'https://b.com/b.png');
    t.toolsService.delete(a.id);
    expect(fs.existsSync(path.join(t.imagesDir, 'abc-def-user.png'))).toBe(true);
  });
});

describe('Гонки: файлы не остаются без записи', () => {
  it('delete во время setImage: файл не остаётся, ответ 404', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const t = setup({
      net: {
        fetchImage: async () => {
          await gate;
          return { finalUrl: 'https://x/i.png', contentType: 'image/png', ext: 'png', body: PNG };
        },
      },
    });
    const tool = makeTool('https://example.com');
    t.toolsStore.insert(tool);
    const pending = t.app.inject({ method: 'PUT', url: `/api/tools/${tool.id}/image`, payload: { imageUrl: 'https://x/i.png' } });
    await new Promise((r) => setTimeout(r, 20));
    expect((await t.app.inject({ method: 'DELETE', url: `/api/tools/${tool.id}` })).statusCode).toBe(204);
    release();
    expect((await pending).statusCode).toBe(404);
    expect(fs.readdirSync(t.imagesDir)).toEqual([]);
  });

  it('delete во время refresh: файлы не остаются', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const t = setup({
      net: {
        fetchImage: async () => {
          await gate;
          return { finalUrl: 'https://x/i.png', contentType: 'image/png', ext: 'png', body: PNG };
        },
      },
    });
    const tool = makeTool('https://example.com');
    t.toolsStore.insert(tool);
    const pending = t.app.inject({ method: 'POST', url: `/api/tools/${tool.id}/refresh` });
    await new Promise((r) => setTimeout(r, 20));
    await t.app.inject({ method: 'DELETE', url: `/api/tools/${tool.id}` });
    release();
    expect((await pending).statusCode).toBe(404);
    expect(fs.readdirSync(t.imagesDir)).toEqual([]);
  });

  it('два одинаковых add: одна запись, файлы проигравшего удалены', async () => {
    const t = setup();
    const [a, b] = await Promise.all([
      t.app.inject({ method: 'POST', url: '/api/tools', payload: { url: 'example.com' } }),
      t.app.inject({ method: 'POST', url: '/api/tools', payload: { url: 'https://www.example.com/' } }),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]);
    const winner = (a.statusCode === 201 ? a : b).json<Tool>();
    for (const f of fs.readdirSync(t.imagesDir)) expect(f.startsWith(`${winner.id}-`)).toBe(true);
  });
});

describe('Ошибки не раскрывают путей и секретов', () => {
  it('сбой записи файла картинки → 500 без пути', async () => {
    const t = setup();
    const tool = makeTool('https://example.com');
    t.toolsStore.insert(tool);
    await t.app.ready(); // статика уже поднята, дальше ломается только запись файла
    fs.rmSync(t.imagesDir, { recursive: true, force: true });
    fs.writeFileSync(t.imagesDir, 'not a dir'); // mkdir/write упадут с путём в сообщении
    const res = await t.app.inject({ method: 'PUT', url: `/api/tools/${tool.id}/image`, payload: { imageUrl: 'https://x/i.png' } });
    expect(res.body).not.toContain(t.dataDir);
    expect(res.body).not.toMatch(/[A-Z]:\\|ENOTDIR|EEXIST/);
  });

  it('ошибка загрузчика с внутренними подробностями не выходит наружу', async () => {
    const t = setup({ net: { fetchPage: async () => { throw new Error(`connect ECONNREFUSED at ${'C:\\secret\\path'}`); } } });
    const res = await t.app.inject({ method: 'POST', url: '/api/tools', payload: { url: 'example.com' } });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('secret');
  });
});

describe('Размеры тел', () => {
  it('url в POST /api/tools ограничен по длине (как imageUrl в PUT /image)', async () => {
    const t = setup();
    const url = 'https://example.com/' + 'a'.repeat(100_000);
    const res = await t.app.inject({ method: 'POST', url: '/api/tools', payload: { url, manual: { title: 'X' } } });
    expect(res.statusCode).toBe(400);
  });


  it('PATCH: длинные поля режутся схемой', async () => {
    const t = setup();
    const tool = makeTool('https://example.com');
    t.toolsStore.insert(tool);
    for (const payload of [
      { title: 'x'.repeat(301) },
      { description: 'x'.repeat(2001) },
      { notes: 'x'.repeat(100_001) },
      { tags: Array.from({ length: 101 }, (_, i) => `t${i}`) },
      { overrides: { features: Array.from({ length: 51 }, () => 'x') } },
    ]) {
      const res = await t.app.inject({ method: 'PATCH', url: `/api/tools/${tool.id}`, payload });
      expect(res.statusCode).toBe(400);
    }
  });
});
