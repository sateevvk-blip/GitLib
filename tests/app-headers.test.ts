import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/server/app.js';

const script = 'try{document.documentElement.dataset.theme="dark"}catch(e){}';
let dir: string;
let app: ReturnType<typeof buildApp>['app'];

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitlib-headers-'));
  const clientDir = path.join(dir, 'client');
  fs.mkdirSync(clientDir);
  fs.writeFileSync(
    path.join(clientDir, 'index.html'),
    `<!doctype html><html><head><script>${script}</script><script type="module" src="/assets/a.js"></script></head><body><div id="root"></div></body></html>`,
  );
  ({ app } = buildApp({ dataDir: dir, dbPath: path.join(dir, 'gitlib.sqlite'), settingsPath: path.join(dir, 'settings.json'), clientDir }));
  await app.ready();
});

afterAll(async () => {
  await app.close();
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows держит открытый файл базы до выхода процесса — временная папка уберётся ОС.
  }
});

describe('заголовки страницы приложения', () => {
  const hash = `'sha256-${createHash('sha256').update(script).digest('base64')}'`;

  for (const url of ['/', '/tools/x']) {
    it(`GET ${url} несёт CSP и X-DNS-Prefetch-Control`, async () => {
      const res = await app.inject({ method: 'GET', url, headers: { host: 'localhost' } });
      expect(res.statusCode).toBe(200);
      expect(res.headers['x-dns-prefetch-control']).toBe('off');
      const csp = String(res.headers['content-security-policy']);
      expect(csp).toContain(`script-src 'self' ${hash};`);
      expect(csp).toContain("connect-src 'self'");
      expect(csp).not.toContain('\n');
    });
  }

  it('GET /api/health без CSP', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health', headers: { host: 'localhost' } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-security-policy']).toBeUndefined();
  });
});
