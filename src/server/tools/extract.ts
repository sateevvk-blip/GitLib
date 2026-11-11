import { Parser } from 'htmlparser2';
import { config } from '../config.js';

export interface ExtractedPage {
  title: string | null;
  description: string | null;
  siteName: string | null;
  lang: string | null;
  iconUrl: string | null;
  imageUrl: string | null;
  /** Только очищенный текст: HTML наружу не уходит. */
  text: string;
  status: 'ok' | 'partial';
}

// htmlparser2 разбирает глубокую вложенность за O(N²): глубже этого порога разбор прекращается, страница — partial.
const MAX_DEPTH = 1000;
const CHUNK = 16_384;
const OK_MIN_CHARS = 400;

const SKIP = new Set(['script', 'style', 'noscript', 'template', 'svg', 'iframe', 'nav', 'footer', 'form', 'header', 'head']);
// Скрытие через CSS-классы и таблицы стилей не отслеживается: принятый риск (S4).
const HIDDEN_STYLE = /display\s*:\s*none|visibility\s*:\s*hidden/i;
const BREAK =new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'p', 'div', 'br', 'tr', 'td', 'th', 'dt', 'dd', 'section', 'ul', 'ol', 'blockquote', 'pre',
]);

// Обрезка не оставляет висящий старший суррогат.
const cut = (s: string, max: number): string => s.slice(0, max).replace(/[\uD800-\uDBFF]$/, '');

const clip = (s: string | null | undefined, max: number): string | null => {
  const t = s?.replace(/\s+/g, ' ').trim();
  return t ? cut(t, max) : null;
};

function resolveHttp(value: string | null | undefined, base: string): string | null {
  if (!value?.trim()) return null;
  try {
    const u = new URL(value.trim(), base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

const iconSize = (sizes: string | undefined): number =>
  (sizes ?? '')
    .split(/\s+/)
    .reduce((max, s) => Math.max(max, Number(/^(\d+)x\d+$/i.exec(s)?.[1] ?? (s.toLowerCase() === 'any' ? 1 : 0))), 0);

const tidy = (s: string): string =>
  s
    .split('\n')
    .map((l) => l.replace(/[ \t\f\r ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');

export function extractPage(html: string, baseUrl: string, maxChars = config.toolTextMaxChars): ExtractedPage {
  const meta = new Map<string, string>();
  let titleTag = '';
  let titleSeen = false;
  let inTitle = false;
  let h1: string | null = null;
  let h1Open = false;
  let h1Base = 0;
  let lang: string | null = null;
  const icon: { url: string | null; size: number } = { url: null, size: -1 };
  let touchIcon: string | null = null;

  // Стек: пропускается ли элемент (по имени или скрытости); main/article помечаются для основного текста.
  const stack: { skip: boolean; head: boolean; main: boolean }[] = [];
  let skipDepth = 0;
  let hiddenDepth = 0; // skipDepth без <head>: <title> берём только вне svg и скрытых зон
  let mainDepth = 0;
  let tooDeep = false;
  let body = '';
  let main = '';

  const parser = new Parser(
    {
      onopentag(name, a) {
        const skip = SKIP.has(name) || 'hidden' in a || a['aria-hidden'] === 'true' || HIDDEN_STYLE.test(a.style ?? '');
        const isMain = name === 'main' || name === 'article';
        stack.push({ skip, head: name === 'head', main: isMain });
        if (skip) skipDepth++;
        if (skip && name !== 'head') hiddenDepth++;
        if (isMain) mainDepth++;
        if (stack.length > MAX_DEPTH) tooDeep = true;

        if (name === 'html' && a.lang) lang = a.lang;
        else if (name === 'title' && !titleSeen && !hiddenDepth) {
          inTitle = true;
          titleSeen = true;
        } else if (name === 'h1' && h1 === null) {
          h1 = '';
          h1Open = true;
          h1Base = skipDepth;
        } else if (name === 'meta') {
          const key = (a.property ?? a.name ?? '').toLowerCase();
          if (key && a.content !== undefined && !meta.has(key)) meta.set(key, a.content);
        } else if (name === 'link' && a.href) {
          const rel = (a.rel ?? '').toLowerCase().split(/\s+/);
          if (rel.includes('icon')) {
            const size = iconSize(a.sizes);
            const url = resolveHttp(a.href, baseUrl);
            if (url && size > icon.size) {
              icon.url = url;
              icon.size = size;
            }
          } else if (rel.includes('apple-touch-icon')) touchIcon ??= resolveHttp(a.href, baseUrl);
        }

        if (!skipDepth && BREAK.has(name)) {
          body += '\n';
          if (mainDepth) main += '\n';
        }
      },
      ontext(t) {
        if (inTitle) titleTag += t;
        if (h1Open && skipDepth === h1Base) h1 += t;
        if (skipDepth) return;
        body += t;
        if (mainDepth) main += t;
      },
      onclosetag(name) {
        const top = stack.pop();
        if (!top) return;
        if (top.skip) skipDepth--;
        if (top.skip && !top.head) hiddenDepth--;
        if (top.main) mainDepth--;
        if (name === 'title') inTitle = false;
        if (name === 'h1') h1Open = false;
        if (!skipDepth && BREAK.has(name)) {
          body += '\n';
          if (mainDepth) main += '\n';
        }
      },
    },
    { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true },
  );
  // Порциями, чтобы между ними можно было прервать разбор слишком глубокой страницы.
  for (let i = 0; i < html.length && !tooDeep; i += CHUNK) parser.write(html.slice(i, i + CHUNK));
  if (!tooDeep) parser.end();

  const text = cut(tidy(main) || tidy(body), maxChars);

  return {
    title: clip(meta.get('og:title'), 300) ?? clip(titleTag, 300) ?? clip(h1, 300),
    description:
      clip(meta.get('og:description'), 1000) ?? clip(meta.get('description'), 1000) ?? clip(meta.get('twitter:description'), 1000),
    siteName: clip(meta.get('og:site_name'), 200),
    lang: clip(lang, 35),
    iconUrl: icon.url ?? touchIcon ?? resolveHttp('/favicon.ico', baseUrl),
    imageUrl: resolveHttp(meta.get('og:image'), baseUrl) ?? resolveHttp(meta.get('twitter:image'), baseUrl),
    text,
    status: !tooDeep && text.length >= OK_MIN_CHARS ? 'ok' : 'partial',
  };
}
