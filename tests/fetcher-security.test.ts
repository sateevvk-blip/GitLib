// Проверка безопасности T2 (S3): попытки обойти net-guard и fetcher. Сети нет: транспорт и DNS подменены.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { FetchError } from '../src/server/errors.js';
import { fetchImage, fetchPage, type FetchOpts, type RequestFn, type TransportResponse } from '../src/server/tools/fetcher.js';
import { guardedLookup, isPublicAddress, type ResolveFn } from '../src/server/tools/net-guard.js';

type Reply = Partial<TransportResponse>;
const ok = (body: string | Buffer, type = 'text/html', extra: Record<string, string> = {}): Reply => ({
  status: 200,
  headers: { 'content-type': type, ...extra },
  body: Buffer.isBuffer(body) ? body : Buffer.from(body),
});
const redirect = (to: string, status = 302): Reply => ({ status, headers: { location: to }, body: Buffer.alloc(0) });

function fake(routes: Record<string, Reply>) {
  const seen: Array<{ url: string; headers: Record<string, string> }> = [];
  const request: RequestFn = async (url, headers) => {
    seen.push({ url: url.href, headers });
    const r = routes[url.href];
    if (!r) throw Object.assign(new Error('no route'), { code: 'ENOTFOUND' });
    return { status: r.status ?? 200, headers: r.headers ?? {}, body: r.body ?? Buffer.alloc(0) };
  };
  return { request, seen };
}
const opts = (request: RequestFn, extra: Partial<FetchOpts> = {}): FetchOpts => ({ maxBytes: 2_000_000, timeoutMs: 5_000, request, ...extra });
const code = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { expect(e).toBeInstanceOf(FetchError); return (e as FetchError).code; }
  return 'no error';
};
function lookupErr(resolve: ResolveFn, all: boolean): Promise<unknown> {
  return new Promise((res) => {
    (guardedLookup(resolve) as (h: string, o: object, cb: (e: unknown) => void) => void)('evil.test', { all }, (e) => res(e));
  });
}

// ДЫРЫ (красные): IPv6-диапазоны со встроенным IPv4 и устаревшие локальные префиксы проходят как публичные.
describe('ДЫРА: IPv6 со встроенным внутренним IPv4', () => {
  const holes = [
    '::127.0.0.1', // IPv4-compatible ::/96 (RFC 4291, устаревший) → канон ::7f00:1
    '::7f00:1',
    '::a00:1', // ::10.0.0.1
    '::ffff:0:7f00:1', // SIIT IPv4-translated ::ffff:0:0/96 (RFC 2765)
    '64:ff9b:1::7f00:1', // локальный NAT64 64:ff9b:1::/48 (RFC 8215)
    'fec0::1', // site-local fec0::/10 (устаревший, но маршрутизируется внутри сети)
  ];
  it.each(holes)('isPublicAddress(%j) === false', (ip) => expect(isPublicAddress(ip)).toBe(false));

  it('литерал http://[::127.0.0.1]/ — url_forbidden без запроса', async () => {
    const { request, seen } = fake({});
    expect(await code(fetchPage('http://[::127.0.0.1]/', opts(request)))).toBe('url_forbidden');
    expect(seen).toEqual([]);
  });

  it('DNS вернул ::7f00:1 — lookup отказывает', async () => {
    const e = await lookupErr(async () => [{ address: '::7f00:1', family: 6 }], true);
    expect((e as FetchError)?.code).toBe('url_forbidden');
  });
});

// Ниже — проверенные и закрытые векторы (регрессия).
describe('закрыто: записи адреса после разбора WHATWG', () => {
  const bs = String.fromCharCode(92);
  it.each([
    'http://0177.0.0.1/', 'http://017700000001/', 'http://0x7f000001/', 'http://127.1/', 'http://0/',
    'http://127.0.0.%31/', 'http://１２７.０.０.１/', `http:${bs}${bs}127.0.0.1${bs}`, 'http://127.0.0.1\t/', ' http://127.0.0.1/ ',
    'http://[0:0:0:0:0:ffff:7f00:1]/', 'http://[::]/', 'http://[fc00::1]/', 'http://[fe80::1]/', 'http://[64:ff9b::a00:1]/',
    'http://[2002:a00:1::]/', 'http://100.64.0.1/', 'http://198.19.0.1/', 'http://255.255.255.255/', 'http://224.0.0.1/',
    'http://[fe80::1%25eth0]/', 'http://evil.test@127.0.0.1/', 'http://127.0.0.1:22/',
    'javascript:alert(1)', 'data:text/html,x', 'file:///C:/Windows/win.ini', 'gopher://public.test/', 'ws://public.test/',
  ])('url_forbidden без запроса: %j', async (u) => {
    const { request, seen } = fake({});
    expect(await code(fetchPage(u, opts(request)))).toBe('url_forbidden');
    expect(seen).toEqual([]);
  });
});

describe('закрыто: DNS', () => {
  it.each([
    ['family 6 ::1', [{ address: '::1', family: 6 as const }]],
    ['IPv6 публичный + IPv4 внутренний', [{ address: '2606:4700::1', family: 6 as const }, { address: '169.254.169.254', family: 4 as const }]],
    ['0.0.0.0', [{ address: '0.0.0.0', family: 4 as const }]],
    ['мусор вместо адреса', [{ address: 'localhost', family: 4 as const }]],
    ['адрес с zone id', [{ address: 'fe80::1%eth0', family: 6 as const }]],
  ])('%s — отказ при all=true и all=false', async (_n, list) => {
    for (const all of [true, false]) expect(((await lookupErr(async () => list, all)) as FetchError)?.code).toBe('url_forbidden');
  });

  it('rebinding: резолв один раз на соединение, без предварительной проверки', async () => {
    // Если бы загрузчик резолвил заранее и потом соединялся, резолвер вызывался бы дважды и второй ответ не проверялся.
    let calls = 0;
    const resolve: ResolveFn = async () => (++calls === 1 ? [{ address: '127.0.0.1', family: 4 }] : [{ address: '127.0.0.1', family: 4 }]);
    expect(await code(fetchPage('http://rebind.test:9/', { maxBytes: 1000, timeoutMs: 2000, resolve }))).toBe('url_forbidden');
    expect(calls).toBe(1);
  });
});

describe('закрыто: редиректы', () => {
  it.each([
    'file:///etc/passwd', 'data:text/html,<script>1</script>', 'javascript:alert(1)', 'http://user:pw@public.test/',
    'http://[::ffff:a9fe:a9fe]/', '//127.0.0.1/', 'http://0x7f.1/',
  ])('Location %j — url_forbidden, запроса туда нет', async (to) => {
    const { request, seen } = fake({ 'http://public.test/': redirect(to, 307) });
    expect(await code(fetchPage('http://public.test/', opts(request)))).toBe('url_forbidden');
    expect(seen.map((s) => s.url)).toEqual(['http://public.test/']);
  });
  it('цикл редиректов обрывается fetch_redirects', async () => {
    const { request, seen } = fake({ 'http://public.test/a': redirect('/b', 308), 'http://public.test/b': redirect('/a', 301) });
    expect(await code(fetchPage('http://public.test/a', opts(request)))).toBe('fetch_redirects');
    expect(seen).toHaveLength(6);
  });
  it('картинка: редирект на внутренний адрес через IPv4-mapped', async () => {
    const { request } = fake({ 'http://public.test/i.png': redirect('http://[::ffff:192.168.0.1]/i.png') });
    expect(await code(fetchImage('http://public.test/i.png', opts(request)))).toBe('url_forbidden');
  });
});

describe('закрыто: тело и ресурсы', () => {
  it.each([
    ['br', zlib.brotliCompressSync],
    ['deflate', zlib.deflateSync],
  ] as const)('%s-бомба 50 МБ — fetch_too_large', async (enc, pack) => {
    const { request } = fake({ 'http://public.test/': ok(pack(Buffer.alloc(50 * 1024 * 1024, 97)), 'text/html', { 'content-encoding': enc }) });
    expect(await code(fetchPage('http://public.test/', opts(request)))).toBe('fetch_too_large');
  });
  it('двойное сжатие gzip, gzip — отказ, а не распаковка без лимита', async () => {
    const twice = zlib.gzipSync(zlib.gzipSync(Buffer.alloc(1000, 97)));
    const { request } = fake({ 'http://public.test/': ok(twice, 'text/html', { 'content-encoding': 'gzip, gzip' }) });
    expect(await code(fetchPage('http://public.test/', opts(request)))).not.toBe('no error');
  });
  it('Content-Length врёт (меньше тела) — лимит по реальным байтам', async () => {
    const { request } = fake({ 'http://public.test/': ok(Buffer.alloc(5000, 97), 'text/html', { 'content-length': '10' }) });
    expect(await code(fetchPage('http://public.test/', opts(request, { maxBytes: 100 })))).toBe('fetch_too_large');
  });
  it('бесконечный медленный поток под лимитом — fetch_timeout', async () => {
    const body = (async function* () { for (;;) { await new Promise((r) => setTimeout(r, 5)); yield Buffer.from('a'); } })();
    const { request } = fake({ 'http://public.test/': { status: 200, headers: { 'content-type': 'text/html' }, body } });
    expect(await code(fetchPage('http://public.test/', opts(request, { timeoutMs: 100 })))).toBe('fetch_timeout');
  });
  it('общий бюджет времени на всю цепочку редиректов, а не на шаг', async () => {
    const slow = (r: Reply): Reply => r;
    const request: RequestFn = async (url) => {
      await new Promise((res) => setTimeout(res, 40));
      return url.pathname === '/5' ? (ok('x') as TransportResponse) : (slow(redirect(`/${Number(url.pathname.slice(1)) + 1}`)) as TransportResponse);
    };
    expect(await code(fetchPage('http://public.test/0', opts(request, { timeoutMs: 120 })))).toBe('fetch_timeout');
  });
});

describe('закрыто: тип картинки и расширение', () => {
  it('расширение только из Content-Type, ничего из URL', async () => {
    const u = new URL('http://public.test/..%2F..%2Fx.php%00.exe?a=.svg').href;
    const { request } = fake({ [u]: ok(Buffer.from([1]), 'IMAGE/PNG; name="../../a.exe"') });
    const img = await fetchImage(u, opts(request));
    expect(img.ext).toBe('png');
  });
  it.each(['text/html', 'image/png2', 'image/svg+xml-x', 'application/octet-stream', 'image/*'])('тип %j для картинки — отказ', async (t) => {
    const { request } = fake({ 'http://public.test/i': ok('<script>', t) });
    expect(await code(fetchImage('http://public.test/i', opts(request)))).toBe('fetch_not_html');
  });
});

describe('закрыто: утечки секретов', () => {
  it('в исходящем запросе только фиксированные заголовки, без cookie и авторизации, на каждом шаге', async () => {
    const { request, seen } = fake({ 'https://public.test/': redirect('http://other.test/'), 'http://other.test/': ok('x') });
    await fetchPage('https://public.test/', opts(request));
    for (const s of seen) {
      expect(Object.keys(s.headers).map((k) => k.toLowerCase()).sort()).toEqual(['accept', 'accept-encoding', 'accept-language', 'user-agent']);
    }
  });
  it('загрузчик не импортирует settings и не использует глобальный fetch', () => {
    for (const f of ['src/server/tools/fetcher.ts', 'src/server/tools/net-guard.ts']) {
      const src = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
      expect(src).not.toMatch(/settings/i);
      expect(src).not.toMatch(/(^|[^.\w])fetch\(/m);
      expect(src).not.toMatch(/rejectUnauthorized/);
    }
  });
});
