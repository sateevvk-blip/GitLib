import http from 'node:http';
import https from 'node:https';
import type net from 'node:net';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import zlib from 'node:zlib';
import { config } from '../config.js';
import { FetchError } from '../errors.js';
import { assertPublicHost, guardedLookup, type ResolveFn } from './net-guard.js';

export interface TransportResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer | AsyncIterable<Buffer>;
  close?: () => void;
}
export type RequestFn = (
  url: URL,
  headers: Record<string, string>,
  ctx: { signal: AbortSignal; lookup: net.LookupFunction },
) => Promise<TransportResponse>;

export interface FetchOpts {
  maxBytes: number;
  timeoutMs: number;
  /** Соединение и заголовки на каждый шаг; по умолчанию из config. */
  headersTimeoutMs?: number;
  /** Только для тестов. */
  resolve?: ResolveFn;
  request?: RequestFn;
}
export interface FetchedPage { finalUrl: string; status: number; contentType: string; html: string }
export interface FetchedImage { finalUrl: string; contentType: string; ext: string; body: Buffer }

const PAGE_TYPES = ['text/html', 'application/xhtml+xml', 'text/plain'];
const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
  'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico', 'image/svg+xml': 'svg',
};
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;

export const nodeRequest: RequestFn = (url, headers, { signal, lookup }) =>
  new Promise((resolve, reject) => {
    // agent: false — без keep-alive, чтобы каждое соединение проходило свой lookup
    const req = (url.protocol === 'https:' ? https : http).request(
      url,
      { method: 'GET', headers, lookup, signal, agent: false },
      (res) => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: res, close: () => req.destroy() }),
    );
    req.on('error', reject);
    req.end();
  });

const header = (r: TransportResponse, name: string): string | undefined => {
  const v = r.headers[name];
  return Array.isArray(v) ? v[0] : v;
};

function decompressor(encoding: string | undefined) {
  switch ((encoding ?? '').trim().toLowerCase()) {
    case '': case 'identity': return null;
    case 'gzip': case 'x-gzip': return zlib.createGunzip();
    case 'br': return zlib.createBrotliDecompress();
    case 'deflate': return zlib.createInflate();
    default: throw new FetchError('Сайт ответил в неизвестном сжатии', 'fetch_unreachable');
  }
}

async function readLimited(res: TransportResponse, maxBytes: number, signal: AbortSignal): Promise<Buffer> {
  const dec = decompressor(header(res, 'content-encoding'));
  const src = Readable.from(Buffer.isBuffer(res.body) ? [res.body] : res.body);
  const chunks: Buffer[] = [];
  let size = 0;
  let overflow = false;
  const sink = async (source: AsyncIterable<Buffer>) => {
    for await (const chunk of source) {
      size += chunk.length;
      if (size > maxBytes) {
        overflow = true; // pipeline подменяет ошибку приёмника на AbortError
        throw new FetchError('Ответ слишком большой', 'fetch_too_large');
      }
      chunks.push(chunk); // копим только в пределах лимита — gzip-бомба не съест память
    }
  };
  const stages = dec ? [src, dec, sink] : [src, sink];
  const done = (pipeline as (...a: unknown[]) => Promise<void>)(...stages);
  done.catch(() => {});
  // гонка с таймаутом: Readable.from не рвётся, пока генератор источника молчит
  const timedOut = new Promise<never>((_, reject) =>
    signal.addEventListener('abort', () => reject(new FetchError('Сайт не ответил вовремя', 'fetch_timeout')), { once: true }),
  );
  timedOut.catch(() => {});
  if (signal.aborted) src.destroy();
  try {
    await Promise.race([done, timedOut]);
  } catch (e) {
    src.destroy();
    throw overflow ? new FetchError('Ответ слишком большой', 'fetch_too_large') : e;
  }
  return Buffer.concat(chunks);
}

function mapError(e: unknown, signal: AbortSignal): FetchError {
  if (e instanceof FetchError) return e;
  const name = (e as { name?: string })?.name;
  if (signal.aborted || name === 'AbortError' || name === 'TimeoutError') {
    return new FetchError('Сайт не ответил вовремя', 'fetch_timeout');
  }
  return new FetchError('Не удалось связаться с сайтом', 'fetch_unreachable', { reason: (e as { code?: string })?.code });
}

async function get(
  rawUrl: string,
  opts: FetchOpts,
  accept: string,
  allowed: (type: string) => boolean,
  notAllowedMessage: string,
): Promise<{ finalUrl: string; status: number; contentType: string; rawType: string; body: Buffer }> {
  const signal = AbortSignal.timeout(opts.timeoutMs);
  const lookup = guardedLookup(opts.resolve);
  const send = opts.request ?? nodeRequest;
  const headers = {
    'User-Agent': `GitLib/${config.appVersion}`,
    Accept: accept,
    'Accept-Language': 'ru,en',
    'Accept-Encoding': 'gzip, br, deflate',
  };
  try {
    let current: URL;
    try { current = new URL(rawUrl); } catch { throw new FetchError('Некорректный адрес', 'url_forbidden'); }
    for (let hop = 0; ; hop++) {
      if (current.protocol !== 'http:' && current.protocol !== 'https:') {
        throw new FetchError('GitLib открывает только http и https', 'url_forbidden');
      }
      if (current.username || current.password) {
        throw new FetchError('Адреса с логином и паролем GitLib не открывает', 'url_forbidden');
      }
      assertPublicHost(current.hostname); // lookup не вызывается для IP-литерала

      // таймер шага живёт только до получения заголовков, иначе signal оборвал бы чтение тела
      const step = new AbortController();
      const timer = setTimeout(() => step.abort(), opts.headersTimeoutMs ?? config.toolFetchHeadersTimeoutMs);
      let res: TransportResponse;
      try {
        res = await send(current, headers, { signal: AbortSignal.any([signal, step.signal]), lookup });
      } finally {
        clearTimeout(timer);
      }
      try {
        if (REDIRECTS.has(res.status) && header(res, 'location')) {
          if (hop >= MAX_REDIRECTS) throw new FetchError('Слишком много перенаправлений', 'fetch_redirects');
          try { current = new URL(header(res, 'location')!, current); } catch {
            throw new FetchError('Сайт вернул некорректное перенаправление', 'fetch_unreachable');
          }
          continue;
        }
        if (res.status < 200 || res.status >= 300) {
          throw new FetchError(`Сайт ответил кодом ${res.status}`, 'fetch_http', { status: res.status });
        }
        const contentType = (header(res, 'content-type') ?? '').split(';')[0]!.trim().toLowerCase();
        if (!allowed(contentType)) throw new FetchError(notAllowedMessage, 'fetch_not_html');
        const length = Number(header(res, 'content-length'));
        if (!header(res, 'content-encoding') && length > opts.maxBytes) {
          throw new FetchError('Ответ слишком большой', 'fetch_too_large');
        }
        const body = await readLimited(res, opts.maxBytes, signal);
        return { finalUrl: current.href, status: res.status, contentType, rawType: header(res, 'content-type') ?? '', body };
      } finally {
        res.close?.();
      }
    }
  } catch (e) {
    throw mapError(e, signal);
  }
}

function decodeHtml(body: Buffer, contentTypeHeader: string): string {
  if (body[0] === 0xef && body[1] === 0xbb && body[2] === 0xbf) return new TextDecoder('utf-8').decode(body);
  const label =
    /charset\s*=\s*["']?([\w-]+)/i.exec(contentTypeHeader)?.[1] ??
    /<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i.exec(body.subarray(0, 2048).toString('latin1'))?.[1] ??
    'utf-8';
  try { return new TextDecoder(label).decode(body); } catch { return new TextDecoder('utf-8').decode(body); }
}

export async function fetchPage(url: string, opts: FetchOpts): Promise<FetchedPage> {
  const r = await get(
    url,
    opts,
    'text/html,application/xhtml+xml;q=0.9,text/plain;q=0.5',
    (t) => PAGE_TYPES.includes(t),
    'По этой ссылке не веб-страница',
  );
  return { finalUrl: r.finalUrl, status: r.status, contentType: r.contentType, html: decodeHtml(r.body, r.rawType) };
}

export async function fetchImage(url: string, opts: FetchOpts): Promise<FetchedImage> {
  const r = await get(url, opts, 'image/*', (t) => t in IMAGE_EXT, 'По этой ссылке не картинка');
  return { finalUrl: r.finalUrl, contentType: r.contentType, ext: IMAGE_EXT[r.contentType]!, body: r.body };
}
