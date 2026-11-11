import { describe, expect, it } from 'vitest';
import { normalizeToolUrl } from '../src/shared/tool-url.js';
import { NormalizeError } from '../src/shared/normalize.js';

describe('normalizeToolUrl', () => {
  it('один ключ для регистра, www, схемы, слэша, фрагмента и UTM', () => {
    const a = normalizeToolUrl('http://www.Three.js.org/?utm_source=x#top');
    const b = normalizeToolUrl('https://three.js.org');
    expect(a.key).toBe(b.key);
    expect(a.key).toBe('three.js.org');
    expect(a.domain).toBe('three.js.org');
    expect(a.url).toBe('http://www.three.js.org/');
  });

  it('подставляет https и убирает завершающий слэш пути', () => {
    expect(normalizeToolUrl('threejs.org/docs/').key).toBe('threejs.org/docs');
    expect(normalizeToolUrl('threejs.org/docs').url).toBe('https://threejs.org/docs');
    expect(normalizeToolUrl('localhost:3000').domain).toBe('localhost');
  });

  it('убирает параметры отслеживания, остальные сортирует в ключе, но не в url', () => {
    const a = normalizeToolUrl('https://x.io/p?b=2&utm_medium=m&a=1&fbclid=z&gclid=1&yclid=2&mc_cid=3&mc_eid=4&ref_src=5');
    expect(a.url).toBe('https://x.io/p?b=2&a=1');
    expect(a.key).toBe('x.io/p?a=1&b=2');
    expect(normalizeToolUrl('https://x.io/p?a=1&b=2').key).toBe(a.key);
  });

  it('разные пути и параметры — разные ключи', () => {
    expect(normalizeToolUrl('https://x.io/a').key).not.toBe(normalizeToolUrl('https://x.io/b').key);
    expect(normalizeToolUrl('https://x.io/?q=1').key).not.toBe(normalizeToolUrl('https://x.io/').key);
  });

  it('кириллический домен показывается в Unicode, ключ — в punycode', () => {
    const n = normalizeToolUrl('https://пример.рф/Путь');
    expect(n.domain).toBe('пример.рф');
    expect(n.key.startsWith('xn--e1afmkfd.xn--p1ai/')).toBe(true);
    expect(normalizeToolUrl('https://ПРИМЕР.рф/Путь').key).toBe(n.key);
  });

  it('Unicode только для кириллических зон; остальное остаётся punycode', () => {
    expect(normalizeToolUrl('https://пример.рф').domain).toBe('пример.рф');
    expect(normalizeToolUrl('https://sub.пример.рф').domain).toBe('sub.пример.рф');
    expect(normalizeToolUrl('https://xn--80ak6aa92e.com').domain).toBe('xn--80ak6aa92e.com');
    expect(normalizeToolUrl('https://xn--mnchen-3ya.de/').domain).toBe('xn--mnchen-3ya.de');
    expect(normalizeToolUrl('https://aб.рф').domain).toBe('xn--a-btb.xn--p1ai'); // смешанная метка
  });

  it('punycode-метка с ASCII-частью до дефиса декодируется', () => {
    expect(normalizeToolUrl('https://тест-1.рф').domain).toBe('тест-1.рф');
  });

  it('точка в конце хоста не меняет ключ', () => {
    expect(normalizeToolUrl('https://example.com./a').key).toBe(normalizeToolUrl('https://example.com/a').key);
    expect(normalizeToolUrl('https://example.com.').domain).toBe('example.com');
  });

  it('битый хост с двоеточием — ошибка разбора, а не «не та схема»', () => {
    expect(() => normalizeToolUrl('example.com:abc')).toThrow('Не удалось разобрать адрес');
  });

  it.each(['javascript:alert(1)', 'file:///etc/passwd', 'ftp://example.com/x', 'data:text/html,hi', 'mailto:a@b.c'])(
    'отклоняет %s',
    (raw) => {
      expect(() => normalizeToolUrl(raw)).toThrow(NormalizeError);
    },
  );

  it('пустой хост и хвост из точек', () => {
    expect(() => normalizeToolUrl('https://.')).toThrow('нет имени сайта');
    expect(normalizeToolUrl('https://x.com..').key).toBe('x.com');
  });

  it('отклоняет логин и пароль, пустой ввод и мусор', () => {
    expect(() => normalizeToolUrl('https://user:pass@example.com')).toThrow(NormalizeError);
    expect(() => normalizeToolUrl('')).toThrow(NormalizeError);
    expect(() => normalizeToolUrl('   ')).toThrow(NormalizeError);
    expect(() => normalizeToolUrl('http://')).toThrow(NormalizeError);
  });
});
