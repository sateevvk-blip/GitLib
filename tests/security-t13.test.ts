/**
 * T13: итоговая проверка безопасности раздела «Инструменты» перед 1.2.0.
 * Красные тесты (describe «ДЫРА») — найденные дыры, критерий приёмки для исполнителя; остальные — регрессия
 * векторов, которые раньше не проверялись. Сети нет: DNS подменён или резолвит только localhost, сервер — на 127.0.0.1.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Settings } from '../src/shared/types.js';
import { TOOL_CATEGORIES } from '../src/shared/types.js';
import { FetchError } from '../src/server/errors.js';
import { fetchImage, fetchPage } from '../src/server/tools/fetcher.js';
import { guardedLookup, isPublicAddress, type ResolveFn } from '../src/server/tools/net-guard.js';
import { analyzeTool } from '../src/server/ai/tool-analyzer.js';
import { makeSource, makeTool } from './helpers.js';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(FetchError);
    return (e as FetchError).code;
  }
  return 'no error';
};

function lookupErr(resolve: ResolveFn): Promise<unknown> {
  return new Promise((res) => {
    (guardedLookup(resolve) as (h: string, o: object, cb: (e: unknown) => void) => void)('evil.test', { all: true }, (e) => res(e));
  });
}

afterEach(() => vi.unstubAllGlobals());

// ---------- ДЫРЫ ----------

describe('ДЫРА: Teredo 2001::/32 (IPv4 клиента встроен в адрес) проходит как публичный', () => {
  // Соединение уходит в локальный Teredo-адаптер Windows, а не в обычную маршрутизацию; 6to4 (2002::/16) уже запрещён.
  const teredo = ['2001:0:4136:e378:8000:63bf:3fff:fdd2', '2001::a00:1', '2001:0:7f00:1::'];
  it.each(teredo)('isPublicAddress(%j) === false', (ip) => expect(isPublicAddress(ip)).toBe(false));

  it('DNS вернул Teredo-адрес — lookup отказывает', async () => {
    const e = await lookupErr(async () => [{ address: '2001::a00:1', family: 6 }]);
    expect((e as FetchError)?.code).toBe('url_forbidden');
  });
});

describe('ДЫРА: ключ LLM, экранированный в JSON тела ошибки, не вычищается', () => {
  // Маскировка идёт по сырому тексту до JSON.parse: «\/» (PHP json_encode) или «\u00XX» скрывают ключ,
  // а после разбора он целиком попадает в LlmError → analysis.error → GET /api/tools/:id, журнал и экспорт.
  const KEY = 'sk-ab/cd+ef/SECRET-0123456789';
  const settings: Settings = { githubToken: '', llmBaseUrl: 'http://llm.local/v1', llmModel: 'test', llmApiKey: KEY, llmTimeoutSec: 5 };
  const tool = () => makeTool('https://figma.com', { source: makeSource({ text: 'Figma is a design tool.' }) });
  const escapedSlash = KEY.replaceAll('/', '\\/');
  const escapedUnicode = KEY.replaceAll('-', '\\u002d');
  const cases: Array<[string, number, string]> = [
    ['403, «\\/» в message', 403, `{"error":{"message":"Key ${escapedSlash} is not allowed"}}`],
    ['404, «\\u002d» в error', 404, `{"error":"model not found for key ${escapedUnicode}"}`],
  ];
  for (const [name, status, body] of cases) {
    it(`${name}: ключа нет в сообщении ошибки`, async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status })));
      const err = await analyzeTool(tool(), settings, [...TOOL_CATEGORIES]).then(
        () => null,
        (e: Error) => e,
      );
      expect(err).not.toBeNull();
      expect(err!.message).not.toContain(KEY);
    });
  }
});

// ---------- закрыто: настоящий транспорт (node:http) с проверкой в lookup ----------

describe('закрыто: настоящий nodeRequest не соединяется с внутренним адресом', () => {
  async function withServer(fn: (port: number, hits: () => number) => Promise<void>) {
    let hits = 0;
    const server = http.createServer((_q, r) => {
      hits++;
      r.writeHead(200, { 'content-type': 'text/html' });
      r.end('<p>secret</p>');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    try {
      await fn((server.address() as AddressInfo).port, () => hits);
    } finally {
      server.close();
    }
  }

  it('localhost и localhost. через системный DNS — url_forbidden, сервер не получил ни одного запроса', async () => {
    await withServer(async (port, hits) => {
      for (const host of ['localhost', 'localhost.']) {
        expect(await code(fetchPage(`http://${host}:${port}/`, { maxBytes: 1e6, timeoutMs: 3000 }))).toBe('url_forbidden');
      }
      expect(await code(fetchImage(`http://localhost:${port}/favicon.ico`, { maxBytes: 1e6, timeoutMs: 3000 }))).toBe('url_forbidden');
      expect(hits()).toBe(0);
    });
  });

  it('DNS: публичный и 127.0.0.1 в одном ответе, затем «перепривязка» — соединения нет', async () => {
    await withServer(async (port, hits) => {
      const answers = [
        [{ address: '8.8.8.8', family: 4 as const }, { address: '127.0.0.1', family: 4 as const }],
        [{ address: '127.0.0.1', family: 4 as const }],
      ];
      let n = 0;
      const resolve: ResolveFn = async () => answers[Math.min(n++, 1)]!;
      expect(await code(fetchPage(`http://rebind.test:${port}/`, { maxBytes: 1e6, timeoutMs: 3000, resolve }))).toBe('url_forbidden');
      expect(await code(fetchPage(`http://rebind.test:${port}/`, { maxBytes: 1e6, timeoutMs: 3000, resolve }))).toBe('url_forbidden');
      expect(hits()).toBe(0);
    });
  });
});
