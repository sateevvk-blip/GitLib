import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function resolveDataDir(): string {
  const raw = process.env.GITLIB_DATA_DIR?.trim();
  if (raw) return path.resolve(raw);
  // По умолчанию — папка data рядом с package.json (корень проекта).
  return path.resolve(here, '..', '..', 'data');
}

const dataDir = resolveDataDir();

export const config = {
  port: Number(process.env.GITLIB_PORT ?? 4817),
  host: process.env.GITLIB_HOST ?? '127.0.0.1',
  dataDir,
  avatarsDir: path.join(dataDir, 'avatars'),
  dbPath: path.join(dataDir, 'gitlib.sqlite'),
  settingsPath: path.join(dataDir, 'settings.json'),
  /** Собранный клиент (dist/client). В dev-режиме отсутствует — используется Vite. GitLib.exe распаковывает свой. */
  clientDir: process.env.GITLIB_CLIENT_DIR?.trim() ? path.resolve(process.env.GITLIB_CLIENT_DIR) : path.resolve(here, '..', 'client'),
  appVersion: '1.0.0',
  /** Максимальный размер README, сохраняемого локально (символов). */
  readmeMaxChars: 200_000,
  /** Сколько символов README отдаётся модели. */
  readmeForLlmChars: 14_000,
  githubTimeoutMs: 20_000,
};

export function ensureDataDirs(): void {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(config.avatarsDir, { recursive: true });
}
