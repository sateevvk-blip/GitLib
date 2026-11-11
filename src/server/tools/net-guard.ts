import dns from 'node:dns';
import net from 'node:net';
import { FetchError } from '../errors.js';

export type ResolveFn = (host: string) => Promise<Array<{ address: string; family: 4 | 6 }>>;

const FORBIDDEN_MESSAGE = 'Адрес ведёт во внутреннюю сеть — такие ссылки GitLib не открывает';

const blocked = new net.BlockList();
for (const [addr, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(addr, bits, 'ipv4');
for (const [addr, bits] of [
  ['::', 96], ['::ffff:0:0:0', 96], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
  ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['2002::', 16],
] as const) blocked.addSubnet(addr, bits, 'ipv6');

/** Чистая проверка по строке IP. Не-IP и неразобранное — запрещено. */
export function isPublicAddress(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return !blocked.check(ip, 'ipv4');
  if (kind !== 6) return false;
  let canon: string;
  try {
    canon = new URL(`http://[${ip}]/`).hostname.slice(1, -1); // каноническая запись: ::ffff:a00:1
  } catch {
    return false; // например, zone id
  }
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(canon);
  if (mapped) {
    const hi = parseInt(mapped[1]!, 16);
    const lo = parseInt(mapped[2]!, 16);
    return isPublicAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  return !blocked.check(canon, 'ipv6');
}

/** Хост-литерал (`lookup` для него не вызывается): бросает url_forbidden. Имена не проверяет — это делает lookup. */
export function assertPublicHost(hostname: string): void {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && !isPublicAddress(host)) throw new FetchError(FORBIDDEN_MESSAGE, 'url_forbidden');
}

const systemResolve: ResolveFn = async (host) =>
  (await dns.promises.lookup(host, { all: true })).map((a) => ({ address: a.address, family: a.family as 4 | 6 }));

/** Опция `lookup` запроса: проверка в момент соединения; хоть один запрещённый адрес в ответе — отказ. */
export function guardedLookup(resolve: ResolveFn = systemResolve): net.LookupFunction {
  return (hostname, options, callback) => {
    resolve(hostname).then(
      (list) => {
        if (!list.length || list.some((a) => !isPublicAddress(a.address))) {
          return callback(new FetchError(FORBIDDEN_MESSAGE, 'url_forbidden') as unknown as NodeJS.ErrnoException, '', 4);
        }
        if (options.all) (callback as unknown as (e: null, a: typeof list) => void)(null, list);
        else callback(null, list[0]!.address, list[0]!.family);
      },
      (err) => callback(err, '', 4),
    );
  };
}
