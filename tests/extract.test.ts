import { describe, expect, it } from 'vitest';
import { extractPage } from '../src/server/tools/extract.js';

const BASE = 'https://example.com/docs/page';
const long = 'Слово '.repeat(100);

describe('extractPage', () => {
  it('обычная страница: заголовок, описание, main без навигации и скриптов', () => {
    const r = extractPage(
      `<html lang="ru"><head><title>Мой сервис</title>
       <meta name="description" content="Описание сервиса">
       <link rel="icon" href="/a.png" sizes="16x16"><link rel="icon" href="/b.png" sizes="64x64"></head>
       <body><nav>Меню</nav><header>Шапка</header>
       <main><h1>Заголовок</h1><p>${long}</p><ul><li>один</li><li>два</li></ul>
       <script>alert(1)</script><div hidden>скрыто</div><div aria-hidden="true">тоже</div></main>
       <footer>Подвал</footer></body></html>`,
      BASE,
    );
    expect(r.title).toBe('Мой сервис');
    expect(r.description).toBe('Описание сервиса');
    expect(r.lang).toBe('ru');
    expect(r.iconUrl).toBe('https://example.com/b.png');
    expect(r.status).toBe('ok');
    expect(r.text).toContain('Заголовок\nСлово');
    expect(r.text).toContain('один\nдва');
    for (const bad of ['Меню', 'Шапка', 'Подвал', 'alert', 'скрыто', 'тоже']) expect(r.text).not.toContain(bad);
  });

  it('только OG-теги: приоритет og над обычными, partial, favicon по умолчанию', () => {
    const r = extractPage(
      `<head><title>Обычный</title><meta property="og:title" content="OG заголовок">
       <meta name="description" content="обычное"><meta property="og:description" content="OG описание">
       <meta property="og:site_name" content="Сайт"><meta property="og:image" content="/cover.jpg"></head>`,
      BASE,
    );
    expect(r).toMatchObject({
      title: 'OG заголовок',
      description: 'OG описание',
      siteName: 'Сайт',
      imageUrl: 'https://example.com/cover.jpg',
      iconUrl: 'https://example.com/favicon.ico',
      text: '',
      status: 'partial',
    });
  });

  it('SPA с пустым корнем: title из h1, текст пустой, partial', () => {
    const r = extractPage('<body><header><h1>Приложение</h1></header><div id="root"></div><script src="/app.js"></script></body>', BASE);
    expect(r.title).toBe('Приложение');
    expect(r.text).toBe('');
    expect(r.status).toBe('partial');
  });

  it('вредный HTML: javascript: и data: отбрасываются, теги в текст не попадают', () => {
    const r = extractPage(
      `<head><meta property="og:image" content="javascript:alert(1)"><meta name="twitter:image" content="data:image/png;base64,AAA">
       <link rel="icon" href="javascript:alert(2)"><link rel="apple-touch-icon" href="/t.png"></head>
       <body><p>Привет <script>steal()</script><b>мир</b></p><template><p>шаблон</p></template></body>`,
      BASE,
    );
    expect(r.imageUrl).toBeNull();
    expect(r.iconUrl).toBe('https://example.com/t.png');
    expect(r.text).toBe('Привет мир');
    expect(r.text).not.toContain('<');
  });

  it('относительные ссылки на иконку разрешаются от baseUrl', () => {
    const r = extractPage('<link rel="shortcut icon" href="../img/i.ico">', 'https://example.com/a/b/c');
    expect(r.iconUrl).toBe('https://example.com/a/img/i.ico');
  });

  it('title берётся только первый и не из встроенного svg', () => {
    const r = extractPage('<body><svg><title>Иконка</title></svg><h1>Сервис<script>x()</script></h1></body>', BASE);
    expect(r.title).toBe('Сервис');
  });

  it('глубокая вложенность: быстро и partial', () => {
    const t = Date.now();
    const r = extractPage('<div>'.repeat(150_000), BASE);
    expect(Date.now() - t).toBeLessThan(1000);
    expect(r.status).toBe('partial');
  });

  it('ячейки таблицы не склеиваются', () => {
    expect(extractPage('<table><tr><td>Название</td><td>Описание</td></tr></table>', BASE).text).toBe('Название\nОписание');
  });

  it('обрезка не оставляет половину суррогатной пары', () => {
    expect(extractPage('<p>ab😀</p>', BASE, 3).text).toBe('ab');
  });

  it('обрезает текст и поля', () => {
    const r = extractPage(`<title>${'я'.repeat(500)}</title><body><p>${'x'.repeat(50)}</p></body>`, BASE, 10);
    expect(r.title).toHaveLength(300);
    expect(r.text).toHaveLength(10);
  });
});
