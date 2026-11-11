import http from 'node:http';
import type { AddressInfo } from 'node:net';
import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { FetchError } from '../src/server/errors.js';
import { fetchImage, fetchPage, nodeRequest, type FetchOpts, type RequestFn, type TransportResponse } from '../src/server/tools/fetcher.js';

type Reply = Partial<TransportResponse> & { body?: TransportResponse['body'] };
const ok = (body: string | Buffer, type = 'text/html; charset=utf-8', extra: Record<string, string> = {}): Reply => ({
  status: 200,
  headers: { 'content-type': type, ...extra },
  body: Buffer.isBuffer(body) ? body : Buffer.from(body),
});
const redirect = (to: string): Reply => ({ status: 302, headers: { location: to }, body: Buffer.alloc(0) });

/** Подменённый транспорт: ответы по адресу, список запрошенных адресов. Сети нет. */
function fake(routes: Record<string, Reply | (() => Reply)>) {
  const seen: string[] = [];
  const request: RequestFn = async (url) => {
    seen.push(url.href);
    const r = routes[url.href];
    if (!r) throw Object.assign(new Error('no route'), { code: 'ENOTFOUND' });
    const v = typeof r === 'function' ? r() : r;
    return { status: v.status ?? 200, headers: v.headers ?? {}, body: v.body ?? Buffer.alloc(0) };
  };
  return { request, seen };
}
const base = { maxBytes: 2_000_000, timeoutMs: 5_000 };
const opts = (request: RequestFn, extra: Partial<FetchOpts> = {}): FetchOpts => ({ ...base, request, ...extra });
const code = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { expect(e).toBeInstanceOf(FetchError); return (e as FetchError).code; }
  return 'no error';
};

describe('fetchPage: адрес и схема', () => {
  it('загружает страницу и возвращает конечный адрес', async () => {
    const { request } = fake({ 'https://public.test/': ok('<h1>Привет</h1>') });
    const p = await fetchPage('https://public.test/', opts(request));
    expect(p).toMatchObject({ finalUrl: 'https://public.test/', status: 200, contentType: 'text/html', html: '<h1>Привет</h1>' });
  });

  it.each([
    'http://127.0.0.1/', 'http://[::1]/', 'http://2130706433/', 'http://0x7f.1/', 'http://[::ffff:127.0.0.1]/',
    'http://169.254.169.254/latest', 'http://0.0.0.0/', 'ftp://public.test/', 'file:///etc/passwd',
    'http://user:pass@public.test/', 'не адрес',
  ])('url_forbidden без запроса: %s', async (u) => {
    const { request, seen } = fake({});
    expect(await code(fetchPage(u, opts(request)))).toBe('url_forbidden');
    expect(seen).toEqual([]);
  });

  it('редирект на внутренний адрес отклонён, запроса к нему нет', async () => {
    const { request, seen } = fake({ 'http://public.test/': redirect('http://127.0.0.1/admin') });
    expect(await code(fetchPage('http://public.test/', opts(request)))).toBe('url_forbidden');
    expect(seen).toEqual(['http://public.test/']);
  });

  it('https → http разрешён, относительный Location разбирается', async () => {
    const { request } = fake({
      'https://public.test/a': redirect('/b'),
      'https://public.test/b': redirect('http://other.test/c'),
      'http://other.test/c': ok('x'),
    });
    expect((await fetchPage('https://public.test/a', opts(request))).finalUrl).toBe('http://other.test/c');
  });
});

describe('fetchPage: редиректы', () => {
  const chain = (n: number) => {
    const routes: Record<string, Reply> = {};
    for (let i = 0; i < n; i++) routes[`http://public.test/${i}`] = redirect(`http://public.test/${i + 1}`);
    routes[`http://public.test/${n}`] = ok('конец');
    return routes;
  };
  it('пять редиректов проходят', async () => {
    const { request } = fake(chain(5));
    expect((await fetchPage('http://public.test/0', opts(request))).html).toBe('конец');
  });
  it('шестой редирект — fetch_redirects', async () => {
    const { request } = fake(chain(6));
    expect(await code(fetchPage('http://public.test/0', opts(request)))).toBe('fetch_redirects');
  });
});

describe('fetchPage: статус и тип', () => {
  it('404 — fetch_http со статусом', async () => {
    const { request } = fake({ 'http://public.test/': { status: 404, headers: {}, body: Buffer.alloc(0) } });
    try { await fetchPage('http://public.test/', opts(request)); expect.unreachable(); } catch (e) {
      expect((e as FetchError).code).toBe('fetch_http');
      expect((e as FetchError).extra).toEqual({ status: 404 });
    }
  });
  it('3xx без Location — fetch_http', async () => {
    const { request } = fake({ 'http://public.test/': { status: 304, headers: {}, body: Buffer.alloc(0) } });
    expect(await code(fetchPage('http://public.test/', opts(request)))).toBe('fetch_http');
  });
  it.each([['application/pdf'], ['image/png'], ['']])('тип %j — fetch_not_html', async (t) => {
    const { request } = fake({ 'http://public.test/': { status: 200, headers: t ? { 'content-type': t } : {}, body: Buffer.from('x') } });
    expect(await code(fetchPage('http://public.test/', opts(request)))).toBe('fetch_not_html');
  });
  it.each(['application/xhtml+xml', 'text/plain'])('тип %s допустим', async (t) => {
    const { request } = fake({ 'http://public.test/': ok('x', t) });
    expect((await fetchPage('http://public.test/', opts(request))).contentType).toBe(t);
  });
  it('транспортная ошибка — fetch_unreachable', async () => {
    const { request } = fake({});
    expect(await code(fetchPage('http://public.test/', opts(request)))).toBe('fetch_unreachable');
  });
});

describe('fetchPage: размер', () => {
  it('Content-Length больше лимита — отказ без чтения', async () => {
    let read = false;
    const body = (async function* () { read = true; yield Buffer.from('x'); })();
    const { request } = fake({ 'http://public.test/': { status: 200, headers: { 'content-type': 'text/html', 'content-length': '101' }, body } });
    expect(await code(fetchPage('http://public.test/', opts(request, { maxBytes: 100 })))).toBe('fetch_too_large');
    expect(read).toBe(false);
  });
  it('ровно лимит проходит, на байт больше — fetch_too_large', async () => {
    const { request } = fake({ 'http://public.test/a': ok(Buffer.alloc(100, 97)), 'http://public.test/b': ok(Buffer.alloc(101, 97)) });
    expect((await fetchPage('http://public.test/a', opts(request, { maxBytes: 100 }))).html).toHaveLength(100);
    expect(await code(fetchPage('http://public.test/b', opts(request, { maxBytes: 100 })))).toBe('fetch_too_large');
  });
  it('лимит без Content-Length режет поток', async () => {
    const body = (async function* () { for (let i = 0; i < 1000; i++) yield Buffer.alloc(1000, 97); })();
    const { request } = fake({ 'http://public.test/': { status: 200, headers: { 'content-type': 'text/html' }, body } });
    expect(await code(fetchPage('http://public.test/', opts(request, { maxBytes: 5_000 })))).toBe('fetch_too_large');
  });
  it('gzip-бомба (10 КБ → 50 МБ) — fetch_too_large', async () => {
    const bomb = zlib.gzipSync(Buffer.alloc(50 * 1024 * 1024, 97));
    expect(bomb.length).toBeLessThan(200_000);
    const { request } = fake({ 'http://public.test/': ok(bomb, 'text/html', { 'content-encoding': 'gzip' }) });
    expect(await code(fetchPage('http://public.test/', opts(request)))).toBe('fetch_too_large');
  });
  it.each([['gzip', zlib.gzipSync], ['br', zlib.brotliCompressSync], ['deflate', zlib.deflateSync]] as const)(
    'распаковывает %s',
    async (enc, pack) => {
      const { request } = fake({ 'http://public.test/': ok(pack(Buffer.from('<p>сжато</p>')), 'text/html', { 'content-encoding': enc }) });
      expect((await fetchPage('http://public.test/', opts(request))).html).toBe('<p>сжато</p>');
    },
  );
});

describe('fetchPage: время', () => {
  it('сервер молчит после заголовков — fetch_timeout', async () => {
    const body = (async function* () { await new Promise(() => {}); yield Buffer.alloc(0); })();
    const { request } = fake({ 'http://public.test/': { status: 200, headers: { 'content-type': 'text/html' }, body } });
    expect(await code(fetchPage('http://public.test/', opts(request, { timeoutMs: 50 })))).toBe('fetch_timeout');
  });
  it('сервер молчит до заголовков — fetch_timeout', async () => {
    const request: RequestFn = (_u, _h, { signal }) =>
      new Promise((_res, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' }))));
    expect(await code(fetchPage('http://public.test/', opts(request, { timeoutMs: 50 })))).toBe('fetch_timeout');
  });
});

describe('fetchPage: кодировка', () => {
  // «Трёхмерная» в windows-1251
  const cp1251 = Buffer.from([0xd2, 0xf0, 0xb8, 0xf5, 0xec, 0xe5, 0xf0, 0xed, 0xe0, 0xff]);
  const page = (head: string) => Buffer.concat([Buffer.from(head, 'latin1'), cp1251]);

  it('<meta charset="windows-1251">', async () => {
    const { request } = fake({ 'http://public.test/': ok(page('<meta charset="windows-1251">'), 'text/html') });
    expect((await fetchPage('http://public.test/', opts(request))).html).toContain('Трёхмерная');
  });
  it('charset из Content-Type главнее meta', async () => {
    const { request } = fake({ 'http://public.test/': ok(page('<meta charset="utf-8">'), 'text/html; charset=windows-1251') });
    expect((await fetchPage('http://public.test/', opts(request))).html).toContain('Трёхмерная');
  });
  it('BOM побеждает всё', async () => {
    const body = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Трёхмерная')]);
    const { request } = fake({ 'http://public.test/': ok(body, 'text/html; charset=windows-1251') });
    expect((await fetchPage('http://public.test/', opts(request))).html).toBe('Трёхмерная');
  });
  it('неизвестная метка — UTF-8', async () => {
    const { request } = fake({ 'http://public.test/': ok('Привет', 'text/html; charset=nonsense-9') });
    expect((await fetchPage('http://public.test/', opts(request))).html).toBe('Привет');
  });
});

describe('fetchImage', () => {
  it.each([
    ['image/png', 'png'], ['image/jpeg', 'jpg'], ['image/webp', 'webp'], ['image/gif', 'gif'],
    ['image/x-icon', 'ico'], ['image/vnd.microsoft.icon', 'ico'], ['image/svg+xml', 'svg'],
  ])('%s → .%s (по типу, не по URL)', async (type, ext) => {
    const { request } = fake({ 'http://public.test/pic.php': ok(Buffer.from([1, 2, 3]), type) });
    const img = await fetchImage('http://public.test/pic.php', opts(request));
    expect(img).toMatchObject({ ext, contentType: type, finalUrl: 'http://public.test/pic.php' });
    expect([...img.body]).toEqual([1, 2, 3]);
  });
  it('не картинка и без типа — fetch_not_html', async () => {
    const { request } = fake({
      'http://public.test/a': ok('x', 'text/html'),
      'http://public.test/b': { status: 200, headers: {}, body: Buffer.from('x') },
    });
    expect(await code(fetchImage('http://public.test/a', opts(request)))).toBe('fetch_not_html');
    expect(await code(fetchImage('http://public.test/b', opts(request)))).toBe('fetch_not_html');
  });
  it('превышение лимита картинки', async () => {
    const { request } = fake({ 'http://public.test/a': ok(Buffer.alloc(11), 'image/png') });
    expect(await code(fetchImage('http://public.test/a', opts(request, { maxBytes: 10 })))).toBe('fetch_too_large');
  });
  it('редирект картинки на внутренний адрес отклонён', async () => {
    const { request } = fake({ 'http://public.test/a': redirect('http://10.0.0.1/x.png') });
    expect(await code(fetchImage('http://public.test/a', opts(request)))).toBe('url_forbidden');
  });
});

describe('настоящий транспорт: проверка в lookup, соединения не происходит', () => {
  const real = (resolve: FetchOpts['resolve']) => ({ ...base, resolve });
  it.each([
    ['имя резолвится во внутренний адрес', [{ address: '127.0.0.1', family: 4 as const }]],
    ['localhost. с точкой', [{ address: '127.0.0.1', family: 4 as const }]],
    ['ответ DNS с публичным и частным адресом', [{ address: '93.184.216.34', family: 4 as const }, { address: '10.0.0.5', family: 4 as const }]],
    ['IPv4-mapped в ответе DNS', [{ address: '::ffff:7f00:1', family: 6 as const }]],
  ])('%s — url_forbidden', async (_n, list) => {
    expect(await code(fetchPage('http://public.test:9/', real(async () => list)))).toBe('url_forbidden');
  });
  it('ENOTFOUND — fetch_unreachable', async () => {
    const enotfound = async () => { throw Object.assign(new Error('x'), { code: 'ENOTFOUND' }); };
    expect(await code(fetchPage('http://public.test:9/', real(enotfound)))).toBe('fetch_unreachable');
  });
});

describe('настоящий транспорт: сокет закрывается по таймауту', () => {
  it('после fetch_timeout соединений на сервере нет', async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.flushHeaders(); // заголовки отданы, дальше молчим
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    try {
      const port = (server.address() as AddressInfo).port;
      // подмена lookup только в тесте: guard в продакшен-пути не ослаблен
      const lookup = ((_h: string, o: { all?: boolean }, cb: (...a: unknown[]) => void) =>
        o.all ? cb(null, [{ address: '127.0.0.1', family: 4 }]) : cb(null, '127.0.0.1', 4)) as never;
      const request: RequestFn = (u, h, ctx) => nodeRequest(u, h, { ...ctx, lookup });
      expect(await code(fetchPage(`http://public.test:${port}/`, opts(request, { timeoutMs: 200 })))).toBe('fetch_timeout');
      let open = 1;
      for (let i = 0; i < 40 && open; i++) {
        open = await new Promise<number>((r) => server.getConnections((_e, n) => r(n)));
        if (open) await new Promise((r) => setTimeout(r, 25));
      }
      expect(open).toBe(0);
    } finally {
      server.close();
    }
  });
});

describe('лимит на заголовки отдельно от общего', () => {
  it('транспорт молчит до заголовков — fetch_timeout по headersTimeoutMs при большом timeoutMs', async () => {
    const request: RequestFn = (_u, _h, { signal }) =>
      new Promise((_res, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' }))));
    const t0 = Date.now();
    expect(await code(fetchPage('http://public.test/', opts(request, { timeoutMs: 5_000, headersTimeoutMs: 50 })))).toBe('fetch_timeout');
    expect(Date.now() - t0).toBeLessThan(2_000);
  });

  it('заголовки сразу, тело дольше headersTimeoutMs, но в пределах timeoutMs — успех (настоящий сокет)', async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.write('<p>');
      setTimeout(() => res.end('медленно</p>'), 300);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    try {
      const port = (server.address() as AddressInfo).port;
      const lookup = ((_h: string, o: { all?: boolean }, cb: (...a: unknown[]) => void) =>
        o.all ? cb(null, [{ address: '127.0.0.1', family: 4 }]) : cb(null, '127.0.0.1', 4)) as never;
      const request: RequestFn = (u, h, ctx) => nodeRequest(u, h, { ...ctx, lookup });
      const page = await fetchPage(`http://public.test:${port}/`, opts(request, { timeoutMs: 5_000, headersTimeoutMs: 100 }));
      expect(page.html).toBe('<p>медленно</p>');
    } finally {
      server.close();
    }
  });
});
