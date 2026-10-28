/**
 * Точка входа GitLib.exe и GitLib.app (Node SEA): Node и клиент вшиты в исполняемый файл.
 * Выбирает папку данных, распаковывает клиент, не дублирует уже запущенный экземпляр и открывает браузер.
 * Собирается `npm run bundle:app` (scripts/build-app.mjs); в обычной сборке не используется.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getAsset, isSea } from 'node:sea';

interface ClientManifest {
  hash: string;
  files: string[];
}

// node:sqlite в Node 22 помечен экспериментальным — это предупреждение пользователю ни к чему.
process.removeAllListeners('warning');
process.on('warning', (w) => {
  if (w.name !== 'ExperimentalWarning') console.warn(`${w.name}: ${w.message}`);
});

const port = Number(process.env.GITLIB_PORT ?? 4817);
const url = `http://localhost:${port}`;
const openBrowser = !process.argv.includes('--no-browser') && !process.env.GITLIB_NO_BROWSER;

/**
 * Windows и голый бинарник — `data/` рядом с исполняемым файлом, как в zip-бандле.
 * macOS-приложение — в ~/Library/Application Support: внутрь .app писать нельзя.
 */
function defaultDataDir(): string {
  const exeDir = path.dirname(process.execPath);
  if (process.platform === 'darwin' && exeDir.includes('.app/Contents/')) {
    return path.join(os.homedir(), 'Library', 'Application Support', 'GitLib');
  }
  return path.join(exeDir, 'data');
}

/** Клиент лежит в исполняемом файле; распаковывается один раз на сборку в `<данные>/.client/<хеш>`. */
function extractClient(dataDir: string): string {
  const manifest = JSON.parse(getAsset('client-manifest.json', 'utf8')) as ClientManifest;
  const root = path.join(dataDir, '.client');
  const target = path.join(root, manifest.hash);
  if (!fs.existsSync(path.join(target, '.complete'))) {
    fs.rmSync(target, { recursive: true, force: true });
    for (const rel of manifest.files) {
      const file = path.join(target, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(getAsset(`client/${rel}`)));
    }
    fs.writeFileSync(path.join(target, '.complete'), manifest.hash);
  }
  for (const old of fs.readdirSync(root)) {
    if (old !== manifest.hash) fs.rmSync(path.join(root, old), { recursive: true, force: true });
  }
  return target;
}

async function isRunning(): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) });
    return res.ok && ((await res.json()) as { ok?: boolean }).ok === true;
  } catch {
    return false;
  }
}

function open(target: string): void {
  if (!openBrowser) return;
  const [cmd, args, extra] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '""', `"${target}"`], { windowsVerbatimArguments: true }]
      : process.platform === 'darwin'
        ? ['open', [target], {}]
        : ['xdg-open', [target], {}];
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore', ...extra });
    child.on('error', () => {});
    child.unref();
  } catch {
    /* браузер не открылся — адрес напечатан в консоли */
  }
}

async function main(): Promise<void> {
  if (await isRunning()) {
    console.log(`GitLib уже запущен: ${url}`);
    open(url);
    return;
  }

  process.env.GITLIB_DATA_DIR ??= defaultDataDir();
  process.env.GITLIB_LOG_LEVEL ??= 'warn';
  if (isSea()) process.env.GITLIB_CLIENT_DIR = extractClient(path.resolve(process.env.GITLIB_DATA_DIR));

  await import('./index.js');

  for (let i = 0; i < 50; i += 1) {
    if (await isRunning()) {
      console.log(`\n  GitLib работает: ${url}\n  Данные: ${process.env.GITLIB_DATA_DIR}\n  Остановить — Ctrl+C или закрыть это окно.\n`);
      open(url);
      return;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
