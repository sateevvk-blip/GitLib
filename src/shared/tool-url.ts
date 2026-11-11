/**
 * Нормализация адреса инструмента и ключ дедупликации.
 * Без Node-API: работает и на сервере, и в браузере (глобальный URL).
 */
import { NormalizeError } from './normalize.js';

export interface ToolUrl {
  /** Что сохраняется и открывается: без фрагмента и параметров отслеживания. */
  url: string;
  /** Ключ сравнения: хост без www, без схемы, путь без завершающего «/», параметры отсортированы. */
  key: string;
  /** Хост без www; IDN — в Unicode. */
  domain: string;
}

const TRACKING = /^(utm_.*|fbclid|gclid|yclid|mc_cid|mc_eid|ref_src)$/i;

// Декодер punycode (RFC 3492): в shared-коде нельзя взять node:punycode / node:url.
function punyAdapt(delta: number, count: number, first: boolean): number {
  let d = first ? Math.floor(delta / 700) : delta >> 1;
  d += Math.floor(d / count);
  let k = 0;
  while (d > 455) {
    d = Math.floor(d / 35);
    k += 36;
  }
  return k + Math.floor((36 * d) / (d + 38));
}

function punyDecode(input: string): string {
  const out: number[] = [];
  const dash = input.lastIndexOf('-');
  for (let j = 0; j < Math.max(dash, 0); j++) out.push(input.charCodeAt(j));
  let n = 128;
  let i = 0;
  let bias = 72;
  for (let idx = dash > 0 ? dash + 1 : 0; idx < input.length; ) {
    const oldi = i;
    let w = 1;
    for (let k = 36; ; k += 36) {
      const c = input.charCodeAt(idx++);
      const digit = c >= 48 && c < 58 ? c - 22 : c >= 65 && c < 91 ? c - 65 : c >= 97 && c < 123 ? c - 97 : 36;
      if (digit >= 36) throw new Error('bad punycode');
      i += digit * w;
      const t = k <= bias ? 1 : k >= bias + 26 ? 26 : k - bias;
      if (digit < t) break;
      w *= 36 - t;
    }
    const len = out.length + 1;
    bias = punyAdapt(i - oldi, len, oldi === 0);
    n += Math.floor(i / len);
    i %= len;
    out.splice(i++, 0, n);
  }
  return String.fromCodePoint(...out);
}

// shortcut: Unicode только для кириллических зон, расширять при запросе на другие письменности
// (защита от омографов: латиница в метке или чужая зона — остаётся punycode).
function unicodeHost(host: string): string {
  const labels = host.split('.');
  if (!labels[labels.length - 1]!.startsWith('xn--')) return host;
  try {
    const out = labels.map((label) => {
      if (!label.startsWith('xn--')) return label;
      const decoded = punyDecode(label.slice(4));
      if (!/^[а-яё\d-]+$/.test(decoded)) throw new Error('not cyrillic');
      return decoded;
    });
    return out.join('.');
  } catch {
    return host;
  }
}

export function normalizeToolUrl(raw: string): ToolUrl {
  const input = (raw ?? '').trim();
  if (!input) throw new NormalizeError('Введите адрес сайта');

  // Схема есть, если «слово:» не похоже на «хост:порт» (localhost:3000).
  // Точку в имени схемы не допускаем: «example.com:abc» — это битый хост, а не схема.
  const hasScheme = /^[a-z][a-z\d+-]*:/i.test(input) && !/^[^/:]+:\d+(?:[/?#]|$)/.test(input);
  let u: URL;
  try {
    u = new URL(hasScheme ? input : `https://${input.replace(/^\/+/, '')}`);
  } catch {
    throw new NormalizeError('Не удалось разобрать адрес. Ожидается ссылка вида https://example.com');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new NormalizeError('Поддерживаются только ссылки http:// и https://');
  }
  if (u.username || u.password) throw new NormalizeError('Адрес с логином и паролем не поддерживается');

  u.hash = '';
  for (const name of [...u.searchParams.keys()]) if (TRACKING.test(name)) u.searchParams.delete(name);

  const host = u.hostname.replace(/\.+$/, '').replace(/^www\.(?=.)/, '');
  if (!host) throw new NormalizeError('В адресе нет имени сайта');
  const sorted = new URLSearchParams(u.searchParams);
  sorted.sort();
  const query = sorted.toString();
  const key = `${host}${u.port ? `:${u.port}` : ''}${u.pathname.replace(/\/+$/, '')}${query ? `?${query}` : ''}`;
  return { url: u.toString(), key, domain: unicodeHost(host) };
}
