import { buildApp } from './app.js';
import { config, ensureDataDirs } from './config.js';

ensureDataDirs();

const { app, service } = buildApp({
  dataDir: config.dataDir,
  dbPath: config.dbPath,
  settingsPath: config.settingsPath,
  clientDir: config.clientDir,
  logger: { level: process.env.GITLIB_LOG_LEVEL ?? 'info' },
});

service.recoverPending();

app
  .listen({ port: config.port, host: config.host })
  .then((address) => {
    app.log.info(`GitLib ${config.appVersion} · ${address} · данные: ${config.dataDir}`);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    app.log.info('Остановка…');
    void app.close().then(() => process.exit(0));
  });
}
