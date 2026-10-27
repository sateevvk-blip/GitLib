import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

interface Props {
  markdown: string;
  /** Базовый URL репозитория для относительных ссылок и картинок. */
  repoUrl: string;
  branch: string;
}

marked.setOptions({ gfm: true, breaks: false });

function absolutize(html: string, repoUrl: string, branch: string): string {
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
  return doc.body.innerHTML;
}

export function Markdown({ markdown, repoUrl, branch }: Props) {
  const html = useMemo(() => {
    const raw = marked.parse(markdown, { async: false }) as string;
    const clean = DOMPurify.sanitize(raw, { USE_PROFILES: { html: true }, ADD_ATTR: ['target', 'align', 'width', 'height'] });
    return absolutize(clean, repoUrl, branch);
  }, [markdown, repoUrl, branch]);
  // eslint-disable-next-line react/no-danger -- HTML прошёл через DOMPurify
  return <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />;
}
