import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/server/app.js';

// T17 (S8): любой ответ с HTML приложения обязан нести CSP и X-DNS-Prefetch-Control, как бы ни был записан URL.
let dir: string;
let app: ReturnType<typeof buildApp>['app'];

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitlib-sec-t17-'));
  const clientDir = path.join(dir, 'client');
  fs.mkdirSync(path.join(clientDir, 'assets'), { recursive: true });
  fs.writeFileSync(
    path.join(clientDir, 'index.html'),
    '<!doctype html><html><head><script>var a=1</script><script type="module" src="/assets/a.js"></script></head><body><div id="root"></div></body></html>',
  );
  fs.writeFileSync(path.join(clientDir, 'assets', 'a.js'), 'console.log(1)');
  fs.writeFileSync(path.join(clientDir, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  ({ app } = buildApp({ dataDir: dir, dbPath: path.join(dir, 'gitlib.sqlite'), settingsPath: path.join(dir, 'settings.json'), clientDir }));
  await app.ready();
});

afterAll(async () => {
  await app.close();
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows держит файл базы до выхода процесса.
  }
});

const isHtml = (ct: unknown) => String(ct ?? '').includes('text/html');

describe('безопасность T17: HTML приложения всегда с CSP', () => {
  const urls = [
    '/', '/?x=1', '/index.html', '/index.html?x=1', '/INDEX.HTML', '/Index.html', '/index.HTML',
    '//', '/./index.html', '/%69ndex.html', '/index.html/', '/assets/../index.html', '/assets/%2e%2e/index.html',
    '/%5Cindex.html', '/tools/x', '/tools/x.js', '/foo.html', '/repo/a/b', '/api', '/avatars', '/tool-images',
  ];
  for (const method of ['GET', 'HEAD'] as const) {
    for (const url of urls) {
      it(`${method} ${url}: HTML только с CSP`, async () => {
        const res = await app.inject({ method, url, headers: { host: 'localhost' } });
        if (!isHtml(res.headers['content-type']) && !res.body.includes('<div id="root">')) return;
        expect(res.headers['content-security-policy'], `${method} ${url} → ${res.statusCode}`).toContain("connect-src 'self'");
        expect(res.headers['x-dns-prefetch-control']).toBe('off');
      });
    }
  }

  it('условный запрос (304) и Range (206) к index.html не снимают политику', async () => {
    const first = await app.inject({ method: 'GET', url: '/index.html', headers: { host: 'localhost' } });
    const etag = String(first.headers.etag ?? '');
    const lm = String(first.headers['last-modified'] ?? '');
    for (const headers of [{ 'if-none-match': etag }, { 'if-modified-since': lm }, { range: 'bytes=0-20' }]) {
      const res = await app.inject({ method: 'GET', url: '/index.html', headers: { host: 'localhost', ...headers } });
      if (res.statusCode === 304) continue; // тело из кэша браузера уже пришло с политикой
      expect(res.headers['content-security-policy'], JSON.stringify(headers) + ' → ' + res.statusCode).toContain("script-src 'self'");
    }
  });

  it('политика не допускает чужих хостов для скриптов, стилей, соединений и форм', async () => {
    const res = await app.inject({ method: 'GET', url: '/', headers: { host: 'localhost' } });
    const csp = String(res.headers['content-security-policy']);
    const dir = (name: string) => csp.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${name} `)) ?? '';
    for (const d of ['default-src', 'script-src', 'style-src', 'connect-src', 'form-action', 'base-uri', 'font-src']) {
      expect(dir(d), d).not.toMatch(/https?:|\*|'unsafe-eval'|'strict-dynamic'|blob:/);
    }
    expect(dir('script-src')).not.toContain("'unsafe-inline'");
    expect(dir('script-src')).not.toContain('data:');
    expect(dir('object-src')).toBe("object-src 'none'");
    expect(dir('frame-ancestors')).toBe("frame-ancestors 'none'");
  });
});

describe('безопасность T17: хеш встроенного скрипта совпадает с тем, что посчитает браузер', () => {
  // HTML-парсер нормализует CRLF в LF до подсчёта хеша CSP. При core.autocrlf=true (так у владельца, .gitattributes нет)
  // свежий checkout даёт src/client/index.html с CRLF, Vite копирует его в dist — и хеш сервера не совпадёт с браузерным:
  // скрипт темы будет заблокирован (отказ в закрытую сторону, но регресс темы в релизной сборке).
  it('index.html с CRLF: в политике хеш текста с LF', async () => {
    const { createHash } = await import('node:crypto');
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gitlib-sec-t17-crlf-'));
    const clientDir = path.join(d, 'client');
    fs.mkdirSync(clientDir);
    const body = '\r\n  var a = 1;\r\n  var b = 2;\r\n';
    fs.writeFileSync(path.join(clientDir, 'index.html'), `<!doctype html>\r\n<html><head><script>${body}</script></head><body><div id="root"></div></body></html>\r\n`);
    const built = buildApp({ dataDir: d, dbPath: path.join(d, 'gitlib.sqlite'), settingsPath: path.join(d, 'settings.json'), clientDir });
    await built.app.ready();
    try {
      const res = await built.app.inject({ method: 'GET', url: '/', headers: { host: 'localhost' } });
      const browserHash = `'sha256-${createHash('sha256').update(body.replace(/\r\n?/g, '\n')).digest('base64')}'`;
      expect(String(res.headers['content-security-policy'])).toContain(browserHash);
    } finally {
      await built.app.close();
    }
  });
});
