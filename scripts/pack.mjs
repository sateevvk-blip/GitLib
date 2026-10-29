/**
 * Упаковка GitLib в переносимый архив для друзей и коллег:
 * production-сборка + серверные зависимости + скрипты запуска. Получателю нужен только Node.js 22.13+.
 *
 *   npm run bundle                 # сборка и архив release/<версия>/gitlib-<версия>.zip
 *   npm run bundle -- --skip-build # упаковать уже собранный dist/
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { writeZip } from './lib/zip.mjs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templates = path.join(root, 'scripts', 'bundle');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const name = `gitlib-${pkg.version}`;
/** Артефакты каждого выпуска — в своей подпапке с номером версии (.claude/rules/release.md). */
const releaseDir = path.join(root, 'release', pkg.version);
const outDir = path.join(releaseDir, name);
const zipPath = path.join(releaseDir, `${name}.zip`);

/** Зависимости, которые сервер импортирует в рантайме; клиентские уже собраны Vite в dist/client. */
const RUNTIME_DEPS = ['fastify', '@fastify/static', 'zod'];

function run(cmd, args, cwd) {
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (res.status !== 0) {
    console.error(`Команда завершилась с ошибкой: ${cmd} ${args.join(' ')}`);
    process.exit(res.status ?? 1);
  }
}

function copyDir(from, to) {
  fs.cpSync(from, to, { recursive: true, filter: (src) => !src.endsWith('.map') });
}

/** Шаблон с подстановкой версии и нужными концами строк (CRLF для .cmd, LF для остального). */
function writeTemplate(file, target = file) {
  let text = fs.readFileSync(path.join(templates, file), 'utf8').replaceAll('{{version}}', pkg.version);
  text = text.replace(/\r\n/g, '\n');
  if (target.endsWith('.cmd')) text = text.replace(/\n/g, '\r\n');
  fs.writeFileSync(path.join(outDir, target), text);
}

if (!process.argv.includes('--skip-build')) run('npm', ['run', 'build'], root);
for (const part of ['server', 'shared', 'client']) {
  if (!fs.existsSync(path.join(root, 'dist', part))) {
    console.error(`Нет dist/${part} — выполните npm run build`);
    process.exit(1);
  }
}

console.log(`\nСобираю ${path.relative(root, outDir)}…`);
fs.rmSync(outDir, { recursive: true, force: true });
fs.rmSync(zipPath, { force: true });
fs.mkdirSync(outDir, { recursive: true });
for (const part of ['server', 'shared', 'client']) copyDir(path.join(root, 'dist', part), path.join(outDir, 'dist', part));

// Версии фиксируются точно такими, с какими приложение собрано и проверено.
const dependencies = {};
for (const dep of RUNTIME_DEPS) {
  const installed = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', dep, 'package.json'), 'utf8'));
  dependencies[dep] = installed.version;
}
const bundlePkg = {
  name: 'gitlib',
  version: pkg.version,
  private: true,
  description: pkg.description,
  type: 'module',
  engines: pkg.engines,
  scripts: { start: 'node --disable-warning=ExperimentalWarning launch.mjs' },
  dependencies,
};
fs.writeFileSync(path.join(outDir, 'package.json'), `${JSON.stringify(bundlePkg, null, 2)}\n`);
run('npm', ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], outDir);
pruneNodeModules(path.join(outDir, 'node_modules'));

writeTemplate('launch.mjs');
writeTemplate('README.md');
writeTemplate('GitLib.cmd');
writeTemplate('gitlib.sh');
writeTemplate('gitlib.sh', 'GitLib.command');

const count = writeZip(outDir, zipPath, name, new Set(['gitlib.sh', 'GitLib.command']));
const mb = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1);
console.log(`\nГотово: ${path.relative(root, zipPath)} — ${count} файлов, ${mb} МБ`);
console.log('Получателю: распаковать и запустить GitLib.cmd (Windows) или GitLib.command / gitlib.sh (macOS, Linux).');

/**
 * Убирает из пакетов тесты, бенчмарки и примеры: в рантайме они не нужны, а в фикстурах
 * встречаются имена файлов, которые встроенный в Windows распаковщик не переваривает (`snow ☃`).
 */
function pruneNodeModules(dir) {
  const JUNK = new Set(['test', 'tests', '__tests__', 'benchmark', 'benchmarks', 'bench', 'example', 'examples', '.github']);
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    if (entry.name.startsWith('@')) {
      pruneNodeModules(full);
      continue;
    }
    for (const child of fs.readdirSync(full, { withFileTypes: true })) {
      if (child.isDirectory() && JUNK.has(child.name)) fs.rmSync(path.join(full, child.name), { recursive: true, force: true });
    }
    pruneNodeModules(path.join(full, 'node_modules'));
  }
}
