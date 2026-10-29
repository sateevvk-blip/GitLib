import { fold } from '../../shared/search.js';
import { config } from '../config.js';

/**
 * Контекст репозитория для чата: структура файлов и прочитанные файлы.
 * Чистые функции — без сети и базы, покрыты тестами.
 */

export interface TreeEntry {
  path: string;
  type: 'blob' | 'tree';
  sha: string;
  size: number | null;
}

export interface RepoTree {
  sha: string;
  branch: string;
  truncated: boolean;
  entries: TreeEntry[];
  fetchedAt: string;
}

export interface RepoFile {
  path: string;
  content: string;
}

export interface ChatContext {
  tree: RepoTree | null;
  files: RepoFile[];
  /** Пояснения о неполноте контекста — модели и пользователю. */
  notes: string[];
}

const SKIP_DIRS = new Set([
  'node_modules',
  'vendor',
  'dist',
  'build',
  'out',
  '.git',
  '__pycache__',
  '.next',
  '.nuxt',
  'target',
  'coverage',
  '.venv',
  'venv',
  '.idea',
  '.vscode',
  '.cache',
  '.turbo',
  '.svelte-kit',
  'bower_components',
]);

const BINARY_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'psd', 'avif',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'pdf', 'zip', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'jar', 'war',
  'exe', 'dll', 'so', 'dylib', 'bin', 'dat', 'wasm', 'pyc', 'class', 'o', 'a',
  'mp3', 'mp4', 'wav', 'ogg', 'webm', 'mov', 'avi', 'flac',
  'sqlite', 'db', 'pak', 'ds_store',
]);

const UNREADABLE_NAMES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'cargo.lock', 'poetry.lock', 'composer.lock', 'gemfile.lock', 'go.sum', 'bun.lockb']);

export function extOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function depthOf(path: string): number {
  return path.split('/').length - 1;
}

/** Служебные папки и бинарные файлы — ни в списке, ни в чтении. */
export function isVisible(entry: TreeEntry): boolean {
  if (entry.type !== 'blob') return false;
  const segments = entry.path.split('/');
  if (segments.slice(0, -1).some((s) => SKIP_DIRS.has(s.toLowerCase()))) return false;
  const base = baseName(entry.path).toLowerCase();
  if (base === '.ds_store' || base === 'thumbs.db') return false;
  return !BINARY_EXT.has(extOf(entry.path));
}

/** Текстовый файл разумного размера, который имеет смысл показать модели. */
export function isReadable(entry: TreeEntry): boolean {
  if (!isVisible(entry)) return false;
  const base = baseName(entry.path).toLowerCase();
  if (UNREADABLE_NAMES.has(base)) return false;
  if (base.endsWith('.min.js') || base.endsWith('.min.css') || base.endsWith('.map') || base.endsWith('.snap')) return false;
  if (entry.size !== null && entry.size > config.chatFileMaxBytes) return false;
  return true;
}

export function visibleEntries(tree: RepoTree): TreeEntry[] {
  return tree.entries.filter(isVisible);
}

export function readableEntries(tree: RepoTree): TreeEntry[] {
  return tree.entries.filter(isReadable);
}

const PER_DIR_LIMIT = 30;
/** Столько имён показывается в папке, совпадающей с ключевыми словами вопроса. */
const FOCUS_DIR_LIMIT = 150;

/**
 * Список файлов для модели: сгруппирован по папкам, сначала верхние уровни,
 * в каждой папке не больше PER_DIR_LIMIT имён (папки, совпадающие с `focus`, — до FOCUS_DIR_LIMIT),
 * общий размер — не больше maxChars.
 */
export function summarizeTree(tree: RepoTree, maxChars = config.chatTreeChars, focus: string[] = []): string {
  const visible = visibleEntries(tree);
  const hidden = tree.entries.filter((e) => e.type === 'blob').length - visible.length;
  const header = [
    `Структура репозитория: ${visible.length} файлов`,
    hidden > 0 ? `без учёта ${hidden} служебных и бинарных` : '',
    tree.truncated ? 'список GitHub обрезан, показана часть' : '',
    `ветка ${tree.branch}`,
  ]
    .filter(Boolean)
    .join(', ');

  const byDir = new Map<string, string[]>();
  for (const e of visible) {
    const dir = e.path.includes('/') ? e.path.slice(0, e.path.lastIndexOf('/')) : '';
    const list = byDir.get(dir) ?? [];
    list.push(e.path);
    byDir.set(dir, list);
  }
  const dirs = [...byDir.keys()].sort((a, b) => depthOf(a) - depthOf(b) || a.localeCompare(b));

  const lines: string[] = [];
  let chars = header.length;
  let shown = 0;
  let cut = false;
  outer: for (const dir of dirs) {
    const files = (byDir.get(dir) ?? []).sort((a, b) => a.localeCompare(b));
    const folded = fold(dir);
    const limit = focus.some((k) => matchesKeyword(folded, k)) && !isLocalized(dir) ? FOCUS_DIR_LIMIT : PER_DIR_LIMIT;
    for (let i = 0; i < files.length; i += 1) {
      if (i === limit) {
        const rest = `${dir ? `${dir}/` : ''}… ещё ${files.length - i} файлов`;
        lines.push(rest);
        chars += rest.length + 1;
        break;
      }
      const line = files[i] as string;
      if (chars + line.length + 1 > maxChars) {
        cut = true;
        break outer;
      }
      lines.push(line);
      chars += line.length + 1;
      shown += 1;
    }
  }
  if (cut) lines.push(`… ещё ${visible.length - shown} файлов не показаны`);
  return `${header}:\n${lines.join('\n')}`;
}

/** Русские корни вопроса → фрагменты путей, по которым обычно лежит ответ. */
const RU_HINTS: Array<[string, string[]]> = [
  ['команд', ['command', 'commands']],
  ['скилл', ['skill']],
  ['навык', ['skill']],
  ['агент', ['agent']],
  ['хук', ['hook']],
  ['плагин', ['plugin']],
  ['настро', ['config', 'settings', 'setup', 'options']],
  ['конфиг', ['config']],
  ['установ', ['install', 'setup', 'getting-started']],
  ['запус', ['run', 'start', 'main', 'getting-started', 'quickstart']],
  ['старт', ['start', 'quickstart', 'getting-started']],
  ['тест', ['test', 'spec']],
  ['пример', ['example', 'sample', 'demo']],
  ['докум', ['doc', 'docs', 'guide']],
  ['лиценз', ['license']],
  ['апи', ['api']],
  ['маршрут', ['route', 'router']],
  ['схем', ['schema']],
  ['миграц', ['migration', 'migrate']],
  ['зависим', ['package.json', 'requirements', 'pyproject', 'cargo.toml', 'go.mod']],
  ['верси', ['changelog', 'version', 'release']],
  ['измен', ['changelog', 'history']],
  ['контриб', ['contributing']],
  ['вклад', ['contributing']],
  ['промпт', ['prompt']],
  ['модел', ['model']],
  ['безопас', ['security']],
  ['деплой', ['deploy', 'docker', 'k8s', 'helm']],
  ['докер', ['docker', 'compose']],
  ['сборк', ['build', 'makefile', 'webpack', 'vite']],
  ['шаблон', ['template']],
  ['интерфейс', ['ui', 'components', 'view']],
  ['компонент', ['component']],
  ['стил', ['css', 'style', 'theme']],
  ['баз', ['db', 'database', 'schema', 'sql']],
  ['данн', ['data', 'db', 'store']],
  ['ошибк', ['error', 'troubleshooting', 'faq']],
  ['проблем', ['troubleshooting', 'faq', 'known-issues']],
  ['лог', ['log']],
  ['скрипт', ['script']],
  ['модул', ['module', 'mod']],
  ['архитект', ['architecture', 'design', 'overview']],
  ['устро', ['architecture', 'overview', 'src']],
  ['работа', ['how', 'overview', 'architecture']],
  ['огранич', ['limitations', 'faq', 'known-issues']],
  ['ключ', ['env', 'config', 'auth', 'secret']],
  ['токен', ['env', 'config', 'auth']],
  ['перемен', ['env', '.env.example', 'config']],
];

/** Короткие ключи (до 4 символов) ищутся по границам слов, чтобы `api` не ловил `rapid`, а `cli` — `clickhouse`. */
export function matchesKeyword(haystack: string, keyword: string): boolean {
  if (keyword.length > 4) return haystack.includes(keyword);
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, 'u').test(haystack);
}

const LOCALE_SEGMENT = /^(?:[a-z]{2}|[a-z]{2}[-_][a-z]{2,4})$/i;
const OWN_LOCALES = new Set(['ru', 'en']);

/** Переводы документации (`docs/ja-JP/…`, `i18n/es/…`): на русском или английском они уже есть рядом. */
export function isLocalized(path: string): boolean {
  return path
    .split('/')
    .slice(0, -1)
    .some((seg) => LOCALE_SEGMENT.test(seg) && !OWN_LOCALES.has(seg.toLowerCase()) && seg.length <= 5 && !['src', 'lib', 'bin', 'app', 'api', 'ui', 'db', 'io', 'os', 'go', 'js', 'ts', 'py', 'rs'].includes(seg.toLowerCase()));
}

/** Ключевые слова вопроса: сложенные (fold) токены длиннее двух символов плюс англоязычные подсказки. */
export function questionKeywords(question: string): string[] {
  const tokens = fold(question)
    .split(/[^\p{L}\p{N}._-]+/u)
    .map((t) => t.replace(/^[._-]+|[._-]+$/g, ''))
    .filter((t) => t.length >= 3);
  const out = new Set<string>();
  for (const t of tokens) {
    out.add(t);
    for (const [root, hints] of RU_HINTS) {
      if (t.startsWith(root)) for (const h of hints) out.add(h);
    }
  }
  return [...out];
}

const DOC_EXT = new Set(['md', 'mdx', 'rst', 'txt', 'adoc']);
const CONFIG_NAMES = new Set(['package.json', 'pyproject.toml', 'cargo.toml', 'go.mod', 'makefile', 'dockerfile', 'docker-compose.yml', 'docker-compose.yaml', 'setup.py', 'composer.json', 'gemfile', 'build.gradle', 'pom.xml', '.env.example']);

function keyScore(path: string): number {
  const base = baseName(path).toLowerCase();
  const ext = extOf(path);
  let score = 0;
  if (DOC_EXT.has(ext)) score += 2;
  if (base.startsWith('readme') && path.includes('/')) score += 1;
  if (/^(docs?|documentation|guide|guides|examples?|samples?|wiki)\//i.test(path)) score += 1.5;
  if (CONFIG_NAMES.has(base)) score += 2;
  if (/^(changelog|contributing|usage|install|getting[-_]?started|faq|architecture)/i.test(base)) score += 1.5;
  if (isLocalized(path)) score -= 4;
  if (path.startsWith('.')) score -= 1.5;
  return score - depthOf(path) * 0.6;
}

/**
 * Эвристический подбор файлов под вопрос: совпадения ключевых слов в пути,
 * плюс документация и конфигурация. Используется как кандидаты для модели и как запасной вариант.
 */
export function rankFiles(entries: TreeEntry[], question: string, limit: number): TreeEntry[] {
  const keywords = questionKeywords(question);
  // Корневой README модель и так получает целиком.
  const scored = entries.filter((e) => !/^readme(\.[a-z0-9]+)?$/i.test(e.path)).map((e) => {
    const lower = fold(e.path);
    const base = fold(baseName(e.path));
    let score = keyScore(e.path);
    for (const k of keywords) {
      if (matchesKeyword(base, k)) score += 5;
      else if (matchesKeyword(lower, k)) score += 3;
    }
    return { e, score };
  });
  scored.sort((a, b) => b.score - a.score || a.e.path.localeCompare(b.e.path));
  return scored.slice(0, limit).map((s) => s.e);
}

/** Текст контекста репозитория для модели: структура и файлы в пределах бюджета. */
export function renderContext(ctx: ChatContext, question = ''): string {
  const parts: string[] = [];
  if (ctx.tree) parts.push(`===== ${summarizeTree(ctx.tree, config.chatTreeChars, questionKeywords(question))}`);
  let budget = config.chatFilesTotalChars;
  for (const f of ctx.files) {
    if (budget <= 0) break;
    const limit = Math.min(config.chatFileChars, budget);
    const body = f.content.length > limit ? `${f.content.slice(0, limit)}\n…(файл обрезан, всего ${f.content.length} символов)` : f.content;
    budget -= body.length;
    parts.push(`===== Файл: ${f.path} =====\n${body}`);
  }
  if (ctx.notes.length) parts.push(`===== Примечания =====\n${ctx.notes.join('\n')}`);
  return parts.join('\n\n');
}
