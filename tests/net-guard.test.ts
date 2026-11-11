import { describe, expect, it } from 'vitest';
import { FetchError } from '../src/server/errors.js';
import { assertPublicHost, guardedLookup, isPublicAddress } from '../src/server/tools/net-guard.js';

const forbidden = [
  '127.0.0.1', '127.255.255.254', '0.0.0.0', '0.1.2.3', '10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1',
  '169.254.169.254', '100.64.0.1', '100.127.255.255', '192.0.0.1', '198.18.0.1', '224.0.0.1', '240.0.0.1', '255.255.255.255',
  '::', '::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1', '64:ff9b::7f00:1', '2002:7f00:1::', '2001:0:7f00:1::',
  '::ffff:10.0.0.1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a00:1', '0:0:0:0:0:ffff:c0a8:101',
  '::7f00:1', '::a00:1', '::ffff:0:7f00:1', '::ffff:0:a00:1', '64:ff9b:1::7f00:1', 'fec0::1',
  'localhost', 'example.com', '', '999.1.1.1',
];
const allowed = ['8.8.8.8', '1.1.1.1', '172.15.255.255', '172.32.0.1', '100.63.255.255', '2606:4700:4700::1111', '2001:4860:4860::8888', '::ffff:8.8.8.8', '::ffff:808:808'];

describe('isPublicAddress', () => {
  it.each(forbidden)('запрещает %j', (ip) => expect(isPublicAddress(ip)).toBe(false));
  it.each(allowed)('разрешает %s', (ip) => expect(isPublicAddress(ip)).toBe(true));
});

describe('assertPublicHost: литералы после разбора URL', () => {
  // WHATWG приводит десятичную и шестнадцатеричную записи к 127.0.0.1 — проверяем hostname после парсинга
  it.each(['http://127.0.0.1/', 'http://[::1]/', 'http://2130706433/', 'http://0x7f.1/', 'http://[::ffff:127.0.0.1]/', 'http://0.0.0.0/', 'http://169.254.169.254/'])(
    'отклоняет %s',
    (u) => {
      const run = () => assertPublicHost(new URL(u).hostname);
      expect(run).toThrow(FetchError);
      try { run(); } catch (e) { expect((e as FetchError).code).toBe('url_forbidden'); }
    },
  );
  it('пропускает публичный литерал и имя (имя проверит lookup)', () => {
    expect(() => assertPublicHost('8.8.8.8')).not.toThrow();
    expect(() => assertPublicHost('[2606:4700:4700::1111]')).not.toThrow();
    expect(() => assertPublicHost('example.com')).not.toThrow();
  });
});

type Result = { err: unknown; address: unknown; family?: number };
function run(resolve: Parameters<typeof guardedLookup>[0], host: string, all: boolean): Promise<Result> {
  return new Promise((res) => {
    (guardedLookup(resolve) as (h: string, o: object, cb: (e: unknown, a: unknown, f?: number) => void) => void)(
      host,
      { all },
      (err, address, family) => res({ err, address, family }),
    );
  });
}
const pub = { address: '93.184.216.34', family: 4 as const };

describe('guardedLookup', () => {
  it('all: true — отдаёт массив', async () => {
    const r = await run(async () => [pub], 'public.test', true);
    expect(r.err).toBeNull();
    expect(r.address).toEqual([pub]);
  });
  it('all: false — отдаёт одну пару', async () => {
    const r = await run(async () => [pub], 'public.test', false);
    expect(r).toEqual({ err: null, address: pub.address, family: 4 });
  });
  it.each([
    ['частный адрес', [{ address: '10.0.0.5', family: 4 as const }]],
    ['публичный и частный в одном ответе', [pub, { address: '10.0.0.5', family: 4 as const }]],
    ['localhost. с точкой на конце', [{ address: '127.0.0.1', family: 4 as const }]],
    ['IPv4-mapped', [{ address: '::ffff:7f00:1', family: 6 as const }]],
    ['пустой ответ', []],
  ])('отказ: %s', async (_n, list) => {
    for (const all of [true, false]) {
      const r = await run(async () => list, 'localhost.', all);
      expect(r.err).toBeInstanceOf(FetchError);
      expect((r.err as FetchError).code).toBe('url_forbidden');
    }
  });
  it('ошибку резолвера передаёт как есть', async () => {
    const boom = Object.assign(new Error('x'), { code: 'ENOTFOUND' });
    const r = await run(async () => { throw boom; }, 'nope.test', true);
    expect(r.err).toBe(boom);
  });
});
