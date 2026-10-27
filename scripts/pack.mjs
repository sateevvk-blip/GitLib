/**
 * Упаковка GitLib в переносимый архив для друзей и коллег:
 * production-сборка + серверные зависимости + скрипты запуска. Получателю нужен только Node.js 22.13+.
 *
 *   npm run bundle                 # сборка и архив release/gitlib-<версия>.zip
 *   npm run bundle -- --skip-build # упаковать уже собранный dist/
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templates = path.join(root, 'scripts', 'bundle');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const name = `gitlib-${pkg.version}`;
const releaseDir = path.join(root, 'release');
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

/**
 * Минимальный ZIP-архиватор: deflate, UTF-8 имена, unix-права (чтобы .sh и .command
 * остались исполняемыми после распаковки на macOS и Linux).
 */
function writeZip(srcDir, target, prefix, executables) {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push(full);
    }
  };
  walk(srcDir);
  files.sort();

  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  const chunks = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const rel = path.relative(srcDir, file).split(path.sep).join('/');
    const nameBuf = Buffer.from(`${prefix}/${rel}`, 'utf8');
    const data = fs.readFileSync(file);
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const stored = deflated.length >= data.length;
    const body = stored ? data : deflated;
    const crc = zlib.crc32(data);
    const mode = executables.has(rel) ? 0o100755 : 0o100644;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // версия для распаковки
    local.writeUInt16LE(0x0800, 6); // имена в UTF-8
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    chunks.push(local, nameBuf, body);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE((3 << 8) | 20, 4); // создан в unix — права читаются из external attrs
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(stored ? 0 : 8, 10);
    header.writeUInt16LE(dosTime, 12);
    header.writeUInt16LE(dosDate, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(body.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(nameBuf.length, 28);
    header.writeUInt32LE((mode << 16) >>> 0, 38);
    header.writeUInt32LE(offset, 42);
    central.push(header, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }

  const centralSize = central.reduce((sum, b) => sum + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);

  if (files.length > 0xffff || offset > 0xffffffff) throw new Error('Архив слишком большой для ZIP без ZIP64');
  fs.writeFileSync(target, Buffer.concat([...chunks, ...central, end]));
  return files.length;
}
