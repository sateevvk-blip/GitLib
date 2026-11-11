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
  appVersion: '1.1.0',
  /** Максимальный размер README, сохраняемого локально (символов). */
  readmeMaxChars: 200_000,
  /** Сколько символов README отдаётся модели. */
  readmeForLlmChars: 14_000,
  githubTimeoutMs: 20_000,
  /** Чат: сколько символов списка файлов репозитория отдаётся модели. */
  chatTreeChars: 14_000,
  /** Чат: максимум символов одного файла в контексте. */
  chatFileChars: 10_000,
  /** Чат: суммарный бюджет на содержимое файлов. */
  chatFilesTotalChars: 40_000,
  /** Чат: сколько файлов модель может прочитать для одного ответа. */
  chatMaxFiles: 8,
  /** Чат: файлы крупнее этого (байт) не читаются. */
  chatFileMaxBytes: 300_000,
  /** Чат: сохранённая структура репозитория считается свежей столько миллисекунд (если не менялся pushedAt). */
  chatTreeTtlMs: 24 * 60 * 60 * 1000,
  /** «Инструменты»: локальные картинки (иконки, превью, свои). */
  toolImagesDir: path.join(dataDir, 'tool-images'),
  toolTextMaxChars: 30_000,
  toolTextForLlmChars: 12_000,
  toolChatTextChars: 20_000,
  /** Общий бюджет времени на загрузку чужой страницы вместе с редиректами. */
  toolFetchTimeoutMs: 20_000,
  /** Лимит на соединение и заголовки, на каждый шаг цепочки редиректов. */
  toolFetchHeadersTimeoutMs: 10_000,
  toolPageMaxBytes: 2_000_000,
  /** Лимиты картинок из S3 (не перечислены в S5, но нужны вызывающему коду T6). */
  toolFaviconMaxBytes: 512_000,
  toolPreviewMaxBytes: 3_000_000,
  toolRecommendMaxCandidates: 40,
  toolRecommendChars: 24_000,
};

export function ensureDataDirs(): void {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(config.avatarsDir, { recursive: true });
}
