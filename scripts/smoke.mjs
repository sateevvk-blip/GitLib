/**
 * Smoke-проверка production-сборки без сети:
 * запускает dist/server/index.js во временной папке данных, проверяет health,
 * отдачу клиента, API и валидацию, затем останавливает процесс.
 *
 *   npm run build && npm run smoke
 *   npm run smoke -- --exe release/gitlib-<версия>-windows-x64/GitLib.exe   # собранный GitLib.exe / gitlib-server
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exeArg = process.argv.indexOf('--exe');
const exe = exeArg >= 0 ? path.resolve(process.argv[exeArg + 1] ?? '') : null;
const entry = exe ?? path.join(root, 'dist', 'server', 'index.js');
if (!fs.existsSync(entry)) {
  console.error(exe ? `Нет ${exe}` : 'Нет dist/server/index.js — сначала выполните npm run build');
  process.exit(1);
}
const port = 4877 + Math.floor(Math.random() * 100);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitlib-smoke-'));
const base = `http://127.0.0.1:${port}`;

const [cmd, args] = exe ? [exe, []] : [process.execPath, ['--disable-warning=ExperimentalWarning', entry]];
const child = spawn(cmd, args, {
  env: { ...process.env, GITLIB_PORT: String(port), GITLIB_DATA_DIR: dataDir, GITLIB_LOG_LEVEL: 'warn', GITLIB_NO_BROWSER: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', (d) => (output += d));
child.stderr.on('data', (d) => (output += d));

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function waitForHealth() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return res.json();
    } catch {
      /* ещё не поднялся */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Сервер не ответил на /api/health за 10 с\n${output}`);
}

try {
  const health = await waitForHealth();
  check('health', health.ok === true && health.repos === 0, `версия ${health.version}`);

  const index = await fetch(`${base}/`);
  const html = await index.text();
  check('клиент отдаётся', index.ok && html.includes('<div id="root">'));

  const spa = await fetch(`${base}/repo/does-not-exist`);
  check('SPA fallback', spa.ok && (await spa.text()).includes('<div id="root">'));

  const facets = await (await fetch(`${base}/api/facets`)).json();
  check('facets пустой библиотеки', facets.total === 0 && facets.topics.length === 0);

  const bad = await fetch(`${base}/api/repos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input: 'not a repo' }) });
  check('валидация ввода → 400', bad.status === 400, (await bad.json()).error);

  const settings = await (await fetch(`${base}/api/settings`)).json();
  check('настройки', settings.dataDir === dataDir && settings.llmConfigured === false);

  const col = await fetch(`${base}/api/collections`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Smoke' }) });
  check('создание коллекции', col.status === 201);

  const exp = await (await fetch(`${base}/api/export`)).json();
  check('экспорт', exp.format === 'gitlib-library' && exp.collections.length === 1);

  const unknown = await fetch(`${base}/api/nope`);
  check('404 для неизвестного API', unknown.status === 404);

  check('база создана', fs.existsSync(path.join(dataDir, 'gitlib.sqlite')));
} catch (e) {
  check('smoke', false, e instanceof Error ? e.message : String(e));
} finally {
  child.kill();
  await new Promise((r) => setTimeout(r, 300));
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* на Windows файл может быть ещё занят — не критично */
  }
}

const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length} проверок не прошли` : `\nВсе ${checks.length} проверок прошли`);
process.exit(failed.length ? 1 : 0);
