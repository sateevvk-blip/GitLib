import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { openDatabase } from './db/database.js';
import { LibraryStore } from './library/store.js';
import { LibraryService } from './library/service.js';
import { SettingsStore } from './settings.js';
import { AppError } from './errors.js';
import { registerRepoRoutes } from './routes/repos.js';
import { registerCollectionRoutes } from './routes/collections.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerTransferRoutes } from './routes/transfer.js';
import { config } from './config.js';

export interface AppOptions {
  dataDir: string;
  dbPath: string;
  settingsPath: string;
  clientDir?: string;
  logger?: boolean | { level: string };
  service?: LibraryService;
  settings?: SettingsStore;
  store?: LibraryStore;
}

export interface AppContext {
  app: FastifyInstance;
  store: LibraryStore;
  settings: SettingsStore;
  service: LibraryService;
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

  const store = opts.store ?? new LibraryStore(openDatabase(opts.dbPath));
  const settings = opts.settings ?? new SettingsStore(opts.settingsPath, process.env, opts.dataDir, opts.dbPath);
  const service =
    opts.service ??
    new LibraryService({
      store,
      settings,
      log: {
        info: (m) => app.log.info(m),
        warn: (m) => app.log.warn(m),
        error: (m) => app.log.error(m),
      },
    });

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
    pendingAnalyses: service.pendingCount(),
  }));

  registerRepoRoutes(app, service);
  registerCollectionRoutes(app, service);
  registerSettingsRoutes(app, settings);
  registerTransferRoutes(app, { store, dataDir: opts.dataDir, appVersion: config.appVersion });

  // Аватары из папки данных
  const avatarsDir = path.join(opts.dataDir, 'avatars');
  fs.mkdirSync(avatarsDir, { recursive: true });
  void app.register(fastifyStatic, {
    root: avatarsDir,
    prefix: '/avatars/',
    decorateReply: false,
    maxAge: '7d',
  });

  // Собранный клиент (production)
  const clientDir = opts.clientDir;
  if (clientDir && fs.existsSync(path.join(clientDir, 'index.html'))) {
    void app.register(fastifyStatic, {
      root: clientDir,
      prefix: '/',
      decorateReply: true,
      index: ['index.html'],
      wildcard: false,
      cacheControl: false,
      setHeaders(res, filePath) {
        // Хешированные ассеты кэшируются навсегда, index.html — никогда (иначе после пересборки
        // открытая вкладка будет просить старые файлы).
        if (filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else res.setHeader('Cache-Control', 'no-cache');
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/avatars/')) {
        void reply.status(404).send({ error: 'Не найдено', code: 'not_found' });
        return;
      }
      if (req.url.startsWith('/assets/')) {
        void reply.status(404).type('text/plain').send('Not found');
        return;
      }
      void reply
        .header('Cache-Control', 'no-cache')
        .type('text/html')
        .send(fs.readFileSync(path.join(clientDir, 'index.html'), 'utf8'));
    });
  } else {
    app.setNotFoundHandler((_req, reply) => {
      void reply.status(404).send({ error: 'Не найдено', code: 'not_found' });
    });
  }

  return { app, store, settings, service };
}
