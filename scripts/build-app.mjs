/**
 * GitLib.exe (Windows) и GitLib.app (macOS) без установленного Node: сервер и клиент вшиваются
 * в копию исполняемого файла Node (Single Executable Applications, https://nodejs.org/api/single-executable-applications.html).
 *
 *   npm run bundle:app                              # платформа текущей машины
 *   npm run bundle:app -- --target win-x64          # win-x64 | darwin-arm64 | darwin-x64 | all
 *   npm run bundle:app -- --skip-build              # не пересобирать клиент
 *
 * Windows-сборку можно делать на любой ОС. macOS-сборку — только на macOS: бинарник после вшивания
 * нужно заново подписать (`codesign`), иначе Apple Silicon его не запустит. Результат — release/gitlib-<версия>-<платформа>.zip.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import postject from 'postject';
import { writeZip } from './lib/zip.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templates = path.join(root, 'scripts', 'app');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const releaseDir = path.join(root, 'release');
const workDir = path.join(releaseDir, '.app-build');
const cacheDir = path.join(releaseDir, '.node-cache');
const nodeVersion = process.version;
const SENTINEL = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

const TARGETS = {
  'win-x64': { os: 'win32', label: 'windows-x64', archive: 'zip', binary: 'node.exe' },
  'darwin-arm64': { os: 'darwin', label: 'macos-arm64', archive: 'tar.gz', binary: 'bin/node' },
  'darwin-x64': { os: 'darwin', label: 'macos-x64', archive: 'tar.gz', binary: 'bin/node' },
};

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' && cmd === 'npm', ...opts });
  if (res.status !== 0) fail(`Команда завершилась с ошибкой: ${cmd} ${args.join(' ')}`);
}

function parseTargets() {
  const i = process.argv.indexOf('--target');
  const raw = i >= 0 ? process.argv[i + 1] : `${process.platform === 'win32' ? 'win' : process.platform}-${process.arch}`;
  const list = raw === 'all' ? Object.keys(TARGETS) : raw.split(',');
  for (const t of list) if (!TARGETS[t]) fail(`Неизвестная платформа «${t}». Доступны: ${Object.keys(TARGETS).join(', ')}, all`);
  const mac = list.filter((t) => TARGETS[t].os === 'darwin');
  if (mac.length && process.platform !== 'darwin') {
    fail(`Сборка ${mac.join(', ')} возможна только на macOS (нужен codesign). Соберите на Mac или в GitHub Actions (.github/workflows/app.yml).`);
  }
  return list;
}

/** Бинарник Node той же версии, что и сборщик: формат SEA-блоба привязан к версии. */
async function nodeBinary(target) {
  const host = `${process.platform === 'win32' ? 'win' : process.platform}-${process.arch}`;
  if (target === host) return process.execPath;

  const t = TARGETS[target];
  const dist = `node-${nodeVersion}-${target}`;
  const file = `${dist}.${t.archive}`;
  const extracted = path.join(cacheDir, dist, t.binary);
  if (fs.existsSync(extracted)) return extracted;

  fs.mkdirSync(cacheDir, { recursive: true });
  const base = `https://nodejs.org/dist/${nodeVersion}`;
  console.log(`Скачиваю ${base}/${file}…`);
  const [archive, sums] = await Promise.all([
    fetch(`${base}/${file}`).then((r) => (r.ok ? r.arrayBuffer() : fail(`Не скачался ${file}: HTTP ${r.status}`))),
    fetch(`${base}/SHASUMS256.txt`).then((r) => (r.ok ? r.text() : fail(`Не скачался SHASUMS256.txt: HTTP ${r.status}`))),
  ]);
  const data = Buffer.from(archive);
  const expected = sums.split('\n').find((l) => l.endsWith(`  ${file}`))?.split(' ')[0];
  const actual = createHash('sha256').update(data).digest('hex');
  if (!expected || expected !== actual) fail(`Контрольная сумма ${file} не совпала с SHASUMS256.txt — архив не используется`);
  fs.writeFileSync(path.join(cacheDir, file), data);
  // Относительные пути: GNU tar из Git Bash принимает «C:» за адрес удалённой машины.
  run('tar', ['-xf', file], { cwd: cacheDir });
  if (!fs.existsSync(extracted)) fail(`В ${file} нет ${t.binary}`);
  return extracted;
}

function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && !e.name.endsWith('.map')) out.push(path.relative(dir, full).split(path.sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

/** Сервер одним CommonJS-файлом и SEA-блоб с клиентом внутри; блоб одинаков для всех платформ. */
async function prepareBlob() {
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });
  const main = path.join(workDir, 'gitlib.cjs');
  await build({
    entryPoints: [path.join(root, 'src', 'server', 'desktop.ts')],
    outfile: main,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    legalComments: 'none',
    logLevel: 'warning',
    // В SEA `__filename` — путь к исполняемому файлу; config.ts берёт из него import.meta.url.
    define: { 'import.meta.url': '__gitlibImportMetaUrl' },
    banner: { js: 'const __gitlibImportMetaUrl = require("node:url").pathToFileURL(__filename).href;' },
  });

  const clientDir = path.join(root, 'dist', 'client');
  const files = listFiles(clientDir);
  const hash = createHash('sha256');
  const assets = {};
  for (const rel of files) {
    const full = path.join(clientDir, rel);
    hash.update(rel).update(fs.readFileSync(full));
    assets[`client/${rel}`] = full;
  }
  const manifestPath = path.join(workDir, 'client-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ hash: `${pkg.version}-${hash.digest('hex').slice(0, 12)}`, files }));
  assets['client-manifest.json'] = manifestPath;

  const blob = path.join(workDir, 'gitlib.blob');
  const seaConfig = path.join(workDir, 'sea-config.json');
  // Без кеша кода блоб не зависит от архитектуры и годится для всех целей.
  fs.writeFileSync(seaConfig, JSON.stringify({ main, output: blob, disableExperimentalSEAWarning: true, useCodeCache: false, useSnapshot: false, assets }, null, 2));
  run(process.execPath, ['--experimental-sea-config', seaConfig]);
  console.log(`Клиент: ${files.length} файлов вшито`);
  return fs.readFileSync(blob);
}

async function makeExecutable(target, blob, outFile) {
  const isMac = TARGETS[target].os === 'darwin';
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.copyFileSync(await nodeBinary(target), outFile);
  fs.chmodSync(outFile, 0o755);
  if (isMac) run('codesign', ['--remove-signature', outFile]);
  await postject.inject(outFile, 'NODE_SEA_BLOB', blob, {
    sentinelFuse: SENTINEL,
    machoSegmentName: isMac ? 'NODE_SEA' : undefined,
    overwrite: true,
  });
  // Ad-hoc подпись: без неё Apple Silicon не запускает изменённый бинарник.
  if (isMac) run('codesign', ['--sign', '-', '--force', outFile]);
}

function writeTemplate(file, target, transform = (s) => s) {
  let text = fs.readFileSync(path.join(templates, file), 'utf8').replaceAll('{{version}}', pkg.version).replace(/\r\n/g, '\n');
  text = transform(text);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
}

async function packageTarget(target, blob) {
  const t = TARGETS[target];
  const name = `gitlib-${pkg.version}-${t.label}`;
  const outDir = path.join(releaseDir, name);
  const zipPath = path.join(releaseDir, `${name}.zip`);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.rmSync(zipPath, { force: true });
  console.log(`\nСобираю ${name}…`);

  let count;
  if (t.os === 'win32') {
    await makeExecutable(target, blob, path.join(outDir, 'GitLib.exe'));
    writeTemplate('README-windows.md', path.join(outDir, 'README.md'), (s) => s.replace(/\n/g, '\r\n'));
    count = writeZip(outDir, zipPath, name, new Set());
  } else {
    const app = path.join(outDir, 'GitLib.app');
    await makeExecutable(target, blob, path.join(app, 'Contents', 'Resources', 'gitlib-server'));
    writeTemplate('Info.plist', path.join(app, 'Contents', 'Info.plist'));
    writeTemplate('launcher.sh', path.join(app, 'Contents', 'MacOS', 'GitLib'));
    fs.chmodSync(path.join(app, 'Contents', 'MacOS', 'GitLib'), 0o755);
    writeTemplate('README-macos.md', path.join(outDir, 'README.md'));
    count = writeZip(outDir, zipPath, name, new Set(['GitLib.app/Contents/MacOS/GitLib', 'GitLib.app/Contents/Resources/gitlib-server']));
  }
  const mb = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1);
  console.log(`Готово: ${path.relative(root, zipPath)} — ${count} файлов, ${mb} МБ`);
}

const targets = parseTargets();
if (!process.argv.includes('--skip-build')) run('npm', ['run', 'build:client'], { cwd: root });
if (!fs.existsSync(path.join(root, 'dist', 'client', 'index.html'))) fail('Нет dist/client — выполните npm run build:client');

console.log(`Node ${nodeVersion}, платформы: ${targets.join(', ')}`);
const blob = await prepareBlob();
for (const target of targets) await packageTarget(target, blob);
fs.rmSync(workDir, { recursive: true, force: true });
