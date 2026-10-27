/**
 * Запуск GitLib из бандла: проверяет версию Node, поднимает сервер и открывает браузер.
 * Если GitLib на этом порту уже запущен — просто открывает его.
 *
 *   node launch.mjs [--no-browser]
 */
import { spawn } from 'node:child_process';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`Нужен Node.js 22.13 или новее, установлен ${process.versions.node}.`);
  console.error('Скачайте LTS-версию: https://nodejs.org');
  process.exit(1);
}

const port = Number(process.env.GITLIB_PORT ?? 4817);
const url = `http://localhost:${port}`;
const openBrowser = !process.argv.includes('--no-browser') && !process.env.GITLIB_NO_BROWSER;

async function isRunning() {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) });
    return res.ok && (await res.json()).ok === true;
  } catch {
    return false;
  }
}

function open(target) {
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

if (await isRunning()) {
  console.log(`GitLib уже запущен: ${url}`);
  open(url);
  process.exit(0);
}

// В окне консоли — только понятные сообщения, без JSON-лога каждого запроса.
process.env.GITLIB_LOG_LEVEL ??= 'warn';
await import('./dist/server/index.js');

for (let i = 0; i < 50; i += 1) {
  if (await isRunning()) {
    console.log(`\n  GitLib работает: ${url}\n  Остановить — Ctrl+C или закрыть это окно.\n`);
    open(url);
    break;
  }
  await new Promise((r) => setTimeout(r, 200));
}
