import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { openDatabase } from './db/database.js';
import { LibraryStore } from './library/store.js';
import { LibraryService } from './library/service.js';
import type { DatabaseSync } from 'node:sqlite';
import { JobQueue } from './library/queue.js';
import { ToolsStore } from './tools/store.js';
import { ToolsService } from './tools/service.js';
import { registerToolRoutes } from './routes/tools.js';
import { SettingsStore } from './settings.js';
import { AppError } from './errors.js';
import { registerRepoRoutes } from './routes/repos.js';
import { registerCollectionRoutes } from './routes/collections.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerTransferRoutes } from './routes/transfer.js';
import { config } from './config.js';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export interface AppOptions {
  dataDir: string;
  dbPath: string;
  settingsPath: string;
  clientDir?: string;
  logger?: boolean | { level: string };
  service?: LibraryService;
  settings?: SettingsStore;
  store?: LibraryStore;
  toolsService?: ToolsService;
  toolsStore?: ToolsStore;
  /** Остановка по `POST /api/shutdown` (значок в трее). Без него маршрута нет. */
  onShutdown?: () => void;
}

export interface AppContext {
  app: FastifyInstance;
  store: LibraryStore;
  settings: SettingsStore;
  service: LibraryService;
  toolsStore: ToolsStore;
  toolsService: ToolsService;
}

export function buildApp(opts: AppOptions): AppContext {
  const app = Fastify({
    logger: opts.logger ?? false,
    bodyLimit: 256 * 1024 * 1024,
  });

  // POST без тела, но с Content-Type: application/json — не ошибка (например, /analyze из curl).
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const text = typeof body === 'string' ? body : body.toString('utf8');
    if (!text.trim()) {
      done(null, undefined);
      return;
    }
    try {
      done(null, JSON.parse(text));
    } catch {
      const err = new Error('Тело запроса не является корректным JSON') as Error & { statusCode?: number };
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  // Одно соединение с базой на оба хранилища; открывается лениво — тесты передают готовое хранилище.
  let db: DatabaseSync | undefined;
  const getDb = (): DatabaseSync => (db ??= openDatabase(opts.dbPath));
  const store = opts.store ?? new LibraryStore(getDb());
  const toolsStore = opts.toolsStore ?? new ToolsStore(getDb(), opts.dataDir);
  const settings = opts.settings ?? new SettingsStore(opts.settingsPath, process.env, opts.dataDir, opts.dbPath);
  const log = {
    info: (m: string) => app.log.info(m),
    warn: (m: string) => app.log.warn(m),
    error: (m: string) => app.log.error(m),
  };
  const queue = new JobQueue();
  const imagesDir = path.join(opts.dataDir, 'tool-images');
  fs.mkdirSync(imagesDir, { recursive: true });
  const service = opts.service ?? new LibraryService({ store, settings, queue, log });
  const toolsService = opts.toolsService ?? new ToolsService({ store: toolsStore, settings, queue, imagesDir, log });
  // После перезапуска возобновляет незавершённые анализы инструментов (для репозиториев это делает index.ts).
  app.addHook('onReady', async () => toolsService.recoverPending());

  // Защита от DNS rebinding: чужая страница, чьё имя указывает на 127.0.0.1, приходит с чужим Host.
  // При явном GITLIB_HOST (доступ из сети) проверка не включается — это выбор владельца, см. README.
  if (LOOPBACK_HOSTS.has(config.host)) {
    app.addHook('onRequest', async (req, reply) => {
      const host = (req.headers.host ?? '').replace(/:\d+$/, '').toLowerCase();
      if (!LOOPBACK_HOSTS.has(host)) {
        return reply.status(403).send({ error: 'GitLib доступен только с этого компьютера (localhost)', code: 'forbidden_host' });
      }
    });
  }

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) {
      void reply.status(err.statusCode).send({ error: err.message, code: err.code, ...(err.extra ?? {}) });
      return;
    }
    const e = err as Error & { statusCode?: number; validation?: unknown; name?: string };
    if (e.name === 'NormalizeError') {
      void reply.status(400).send({ error: e.message, code: 'invalid_input' });
      return;
    }
    if (e.statusCode && e.statusCode < 500) {
      void reply.status(e.statusCode).send({ error: e.message, code: 'bad_request' });
      return;
    }
    app.log.error(err);
    void reply.status(500).send({ error: 'Внутренняя ошибка сервера', code: 'internal' });
  });

  app.get('/api/health', async () => ({
    ok: true,
    app: 'GitLib',
    version: config.appVersion,
    dataDir: opts.dataDir,
    repos: store.count(),
    tools: toolsStore.count(),
    pendingAnalyses: service.pendingCount(),
  }));

  const onShutdown = opts.onShutdown;
  if (onShutdown) {
    app.post('/api/shutdown', async (req, reply) => {
      // Свой заголовок чужая страница не отправит без CORS-preflight, а CORS сервер не разрешает.
      if (req.headers['x-gitlib-shutdown'] !== '1') {
        return reply.status(403).send({ error: 'Нужен заголовок X-GitLib-Shutdown: 1', code: 'forbidden' });
      }
      reply.raw.once('finish', () => setImmediate(onShutdown));
      return reply.status(202).send({ ok: true });
    });
  }

  registerRepoRoutes(app, service);
  registerToolRoutes(app, toolsService);
  registerCollectionRoutes(app, service);
  registerSettingsRoutes(app, settings);
  registerTransferRoutes(app, { store, toolsStore, dataDir: opts.dataDir, appVersion: config.appVersion });

  // Аватары из папки данных
  const avatarsDir = path.join(opts.dataDir, 'avatars');
  fs.mkdirSync(avatarsDir, { recursive: true });
  void app.register(fastifyStatic, {
    root: avatarsDir,
    prefix: '/avatars/',
    decorateReply: false,
    maxAge: '7d',
  });

  // Картинки инструментов: Content-Type из загрузчика не перепроверяется, поэтому файл не должен ни исполняться
  // (sandbox), ни переопределять тип (nosniff) — SVG с скриптом откроется мёртвым.
  void app.register(fastifyStatic, {
    root: imagesDir,
    prefix: '/tool-images/',
    decorateReply: false,
    setHeaders(reply) {
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('Content-Security-Policy', 'sandbox');
    },
  });

  // Собранный клиент (production)
  const clientDir = opts.clientDir;
  if (clientDir && fs.existsSync(path.join(clientDir, 'index.html'))) {
    const indexPath = path.join(clientDir, 'index.html');
    const indexHtml = fs.readFileSync(indexPath, 'utf8');
    // Хеши встроенных скриптов без src считаются из отдаваемого файла: правка скрипта не расходится с политикой.
    // shortcut: `[^>]*` собьётся на `>` внутри значения атрибута script, сейчас в index.html таких нет — перейти на HTML-парсер, если появятся.
    // Браузер перед хешированием нормализует CRLF/CR в LF — делаем так же.
    const scriptHashes = [...indexHtml.matchAll(/<script(?![^>]*\ssrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)]
      .map((m) => `'sha256-${createHash('sha256').update((m[1] ?? '').replace(/\r\n?/g, '\n')).digest('base64')}'`);
    const csp = [
      "default-src 'self'",
      `script-src 'self' ${scriptHashes.join(' ')}`.trim(),
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https: http:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; ');
    const pageHeaders = (reply: { header: (k: string, v: string) => unknown }) => {
      reply.header('X-DNS-Prefetch-Control', 'off');
      reply.header('Content-Security-Policy', csp);
    };
    void app.register(fastifyStatic, {
      root: clientDir,
      prefix: '/',
      decorateReply: true,
      index: ['index.html'],
      wildcard: false,
      cacheControl: false,
      setHeaders(reply, filePath) {
        // Хешированные ассеты кэшируются навсегда, index.html — никогда (иначе после пересборки
        // открытая вкладка будет просить старые файлы).
        if (filePath.includes(`${path.sep}assets${path.sep}`)) reply.header('Cache-Control', 'public, max-age=31536000, immutable');
        else reply.header('Cache-Control', 'no-cache');
        if (path.resolve(filePath) === path.resolve(indexPath)) pageHeaders(reply);
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/avatars/') || req.url.startsWith('/tool-images/')) {
        void reply.status(404).send({ error: 'Не найдено', code: 'not_found' });
        return;
      }
      if (req.url.startsWith('/assets/')) {
        void reply.status(404).type('text/plain').send('Not found');
        return;
      }
      pageHeaders(reply);
      void reply
        .header('Cache-Control', 'no-cache')
        .type('text/html')
        .send(indexHtml);
    });
  } else {
    app.setNotFoundHandler((_req, reply) => {
      void reply.status(404).send({ error: 'Не найдено', code: 'not_found' });
    });
  }

  return { app, store, settings, service, toolsStore, toolsService };
}
