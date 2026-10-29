import { describe, expect, it } from 'vitest';
import { buildChatMessages, buildSelectMessages } from '../src/server/ai/analyzer.js';
import { isLocalized, isReadable, isVisible, matchesKeyword, questionKeywords, rankFiles, readableEntries, renderContext, summarizeTree, type RepoTree, type TreeEntry } from '../src/server/ai/context.js';
import { LibraryService } from '../src/server/library/service.js';
import { GithubError } from '../src/server/errors.js';
import { config } from '../src/server/config.js';
import type { ChatMessage, Repo } from '../src/shared/types.js';
import { makeGithub, makeRepo, makeSettings, makeStore } from './helpers.js';

function blob(path: string, size = 100, sha = `sha-${path}`): TreeEntry {
  return { path, type: 'blob', sha, size };
}

function tree(entries: TreeEntry[], overrides: Partial<RepoTree> = {}): RepoTree {
  return { sha: 'tree-1', branch: 'main', truncated: false, entries, fetchedAt: new Date().toISOString(), ...overrides };
}

const ECC = tree([
  blob('README.md'),
  blob('package.json'),
  blob('docs/ru/README.md'),
  blob('docs/commands.md'),
  blob('commands/plan.md'),
  blob('commands/review.md'),
  blob('skills/tdd/SKILL.md'),
  blob('skills/docs/SKILL.md'),
  blob('agents/reviewer.md'),
  blob('src/index.ts'),
  blob('assets/logo.png'),
  blob('node_modules/x/index.js'),
  blob('dist/bundle.min.js'),
  blob('package-lock.json'),
  blob('data/big.json', 5_000_000),
  { path: 'docs', type: 'tree', sha: 'd', size: null },
]);

describe('контекст чата: структура репозитория', () => {
  it('служебные папки, бинарные и огромные файлы не читаются', () => {
    expect(isVisible(blob('assets/logo.png'))).toBe(false);
    expect(isVisible(blob('node_modules/x/index.js'))).toBe(false);
    expect(isVisible(blob('src/index.ts'))).toBe(true);
    expect(isReadable(blob('package-lock.json'))).toBe(false);
    expect(isReadable(blob('dist/bundle.min.js'))).toBe(false);
    expect(isReadable(blob('data/big.json', 5_000_000))).toBe(false);
    expect(isReadable(blob('docs/commands.md'))).toBe(true);
    expect(readableEntries(ECC).map((e) => e.path)).not.toContain('docs');
  });

  it('сводка дерева: заголовок с количеством, верхние уровни первыми, бюджет символов', () => {
    const text = summarizeTree(ECC);
    expect(text).toMatch(/^Структура репозитория: 12 файлов, без учёта 3 служебных и бинарных, ветка main:/);
    expect(text.indexOf('README.md')).toBeLessThan(text.indexOf('commands/plan.md'));
    expect(text).toContain('skills/tdd/SKILL.md');
    expect(text).not.toContain('node_modules');

    const many = tree(Array.from({ length: 80 }, (_, i) => blob(`commands/cmd-${String(i).padStart(2, '0')}.md`)));
    const capped = summarizeTree(many);
    expect(capped).toContain('commands/… ещё 50 файлов');
    expect(capped.split('\n')).toHaveLength(1 + 30 + 1);

    const tight = summarizeTree(many, 200);
    expect(tight).toMatch(/… ещё \d+ файлов не показаны$/);
    expect(tight.length).toBeLessThan(260);

    expect(summarizeTree(tree([], { truncated: true }))).toContain('список GitHub обрезан');

    // Папка, совпадающая с вопросом, показывается целиком (до 150 имён), переводы — нет.
    const focused = summarizeTree(many, 20_000, questionKeywords('Какие команды есть?'));
    expect(focused).not.toContain('ещё');
    expect(focused.split('\n')).toHaveLength(1 + 80);
    const localized = tree(Array.from({ length: 40 }, (_, i) => blob(`docs/ja-JP/commands/cmd-${i}.md`)));
    expect(summarizeTree(localized, 20_000, ['command'])).toContain('ещё 10 файлов');
  });

  it('короткие ключи — по границам слов, переводы документации распознаются', () => {
    expect(matchesKeyword('skills/clickhouse-io/skill.md', 'cli')).toBe(false);
    expect(matchesKeyword('packages/cli/index.ts', 'cli')).toBe(true);
    expect(matchesKeyword('docs/api.md', 'api')).toBe(true);
    expect(matchesKeyword('rapid.md', 'api')).toBe(false);
    expect(matchesKeyword('commands/skill-create.md', 'command')).toBe(true);
    expect(isLocalized('docs/ja-JP/commands/x.md')).toBe(true);
    expect(isLocalized('docs/zh_CN/x.md')).toBe(true);
    expect(isLocalized('i18n/es/x.md')).toBe(true);
    expect(isLocalized('docs/ru/x.md')).toBe(false);
    expect(isLocalized('src/api/x.ts')).toBe(false);
    expect(isLocalized('docs/commands/x.md')).toBe(false);
  });

  it('ключевые слова вопроса получают англоязычные подсказки, кириллица складывается', () => {
    const kw = questionKeywords('Какие КОМАНДЫ есть у скиллов?');
    expect(kw).toEqual(expect.arrayContaining(['команды', 'command', 'commands', 'скиллов', 'skill']));
    expect(kw).not.toContain('у');
  });

  it('подбор файлов под вопрос: совпадения по пути выше, документация выше кода', () => {
    const picked = rankFiles(readableEntries(ECC), 'Какие команды есть у скиллов?', 5).map((e) => e.path);
    expect(picked[0]).toBe('docs/commands.md');
    expect(picked).toEqual(expect.arrayContaining(['commands/plan.md', 'skills/tdd/SKILL.md', 'skills/docs/SKILL.md']));
    expect(picked).not.toContain('src/index.ts');
    expect(picked).not.toContain('agents/reviewer.md');

    // Переводы и скрытые папки уходят вниз, русская документация — нет.
    const multi = tree([blob('docs/ja-JP/commands/skill-create.md'), blob('docs/es/commands/skill-create.md'), blob('commands/skill-create.md'), blob('.opencode/commands/skill-create.md'), blob('docs/ru/commands.md')]);
    const top = rankFiles(readableEntries(multi), 'Какие команды есть у скиллов?', 2).map((e) => e.path);
    expect(top.sort()).toEqual(['commands/skill-create.md', 'docs/ru/commands.md']);

    const generic = rankFiles(readableEntries(ECC), 'Что это?', 3).map((e) => e.path);
    expect(generic).toContain('package.json');
    expect(generic).toContain('docs/ru/README.md');
    expect(generic).not.toContain('README.md');
  });

  it('контекст для модели: дерево, файлы в пределах бюджета, примечания', () => {
    const long = 'x'.repeat(config.chatFileChars + 100);
    const text = renderContext({ tree: ECC, files: [{ path: 'docs/commands.md', content: '# Commands\n/plan' }, { path: 'src/index.ts', content: long }], notes: ['GitHub недоступен'] });
    expect(text).toContain('===== Структура репозитория');
    expect(text).toContain('===== Файл: docs/commands.md =====\n# Commands\n/plan');
    expect(text).toContain(`…(файл обрезан, всего ${long.length} символов)`);
    expect(text).toContain('===== Примечания =====\nGitHub недоступен');
    expect(renderContext({ tree: null, files: [], notes: [] })).toBe('');
  });

  it('сообщения чата и запрос на выбор файлов содержат структуру и прочитанные файлы', () => {
    const repo = makeRepo('octo/ecc');
    const history: ChatMessage[] = [
      { role: 'user', content: 'Что это?' },
      { role: 'assistant', content: 'Набор скиллов' },
      { role: 'user', content: 'Какие команды есть?' },
    ];
    const msgs = buildChatMessages(repo, history, { tree: ECC, files: [{ path: 'docs/commands.md', content: '/plan — план' }], notes: [] });
    expect(msgs[0]?.content).toMatch(/практическим советом/);
    expect(msgs[1]?.content).toContain('Структура репозитория');
    expect(msgs[1]?.content).toContain('===== Файл: docs/commands.md');
    expect(msgs[2]?.content).toContain('docs/commands.md');
    expect(msgs[msgs.length - 1]?.content).toBe('Какие команды есть?');

    const select = buildSelectMessages(repo, history, ECC, [blob('commands/plan.md')]);
    expect(select[0]?.content).toContain('"files"');
    expect(select[1]?.content).toContain('Вопрос: Какие команды есть?');
    expect(select[1]?.content).toContain('Пользователь: Что это?');
    expect(select[1]?.content).toContain('Кандидаты по ключевым словам: commands/plan.md');
    expect(select[1]?.content).toContain('skills/tdd/SKILL.md');
  });
});

describe('контекст чата: сервис с кэшем', () => {
  interface Options {
    treeFails?: () => boolean;
    blobFails?: (sha: string) => boolean;
    select?: () => Promise<string[]>;
  }

  function makeService(opts: Options = {}) {
    const { store, dataDir } = makeStore();
    const settings = makeSettings(dataDir, { LLM_BASE_URL: 'http://llm.local/v1', LLM_MODEL: 'test' });
    const calls = { tree: 0, blob: 0, select: 0 };
    const received: Array<{ files: string[]; notes: string[]; hasTree: boolean }> = [];
    const service = new LibraryService({
      store,
      settings,
      github: { fetchRepository: async () => ({ github: makeGithub(), canonical: { owner: 'octo', name: 'test' } }), downloadAvatar: async () => null },
      contents: {
        fetchTree: async () => {
          calls.tree += 1;
          if (opts.treeFails?.()) throw new GithubError('Нет связи с GitHub', 'offline', 503);
          return { sha: 't1', truncated: false, entries: ECC.entries };
        },
        fetchBlob: async (_o, _n, sha) => {
          calls.blob += 1;
          if (opts.blobFails?.(sha)) throw new GithubError('Исчерпан лимит запросов GitHub API', 'rate_limit', 429);
          return `содержимое ${sha}`;
        },
      },
      ai: {
        analyzeRepo: async () => {
          throw new Error('не вызывается');
        },
        selectChatFiles: async () => {
          calls.select += 1;
          if (opts.select) return opts.select();
          return ['docs/commands.md', 'commands/plan.md'];
        },
        chatAboutRepo: async (_repo, s, _msgs, ctx) => {
          received.push({ files: ctx?.files.map((f) => f.path) ?? [], notes: ctx?.notes ?? [], hasTree: Boolean(ctx?.tree) });
          return { reply: 'Ответ', model: s.llmModel };
        },
      },
    });
    const repo: Repo = makeRepo('octo/test');
    store.insert(repo);
    return { service, store, repo, calls, received };
  }

  const ask = (service: LibraryService, id: string, q = 'Какие команды есть?') => service.chat(id, [{ role: 'user', content: q }]);

  it('читает выбранные файлы, отдаёт их модели и возвращает источники; повторный вопрос — из кэша', async () => {
    const { service, repo, calls, received } = makeService();
    const reply = await ask(service, repo.id);
    expect(reply).toEqual({ reply: 'Ответ', model: 'test', sources: ['docs/commands.md', 'commands/plan.md'], notice: null });
    expect(received[0]).toEqual({ files: ['docs/commands.md', 'commands/plan.md'], notes: [], hasTree: true });
    expect(calls).toEqual({ tree: 1, blob: 2, select: 1 });

    await ask(service, repo.id, 'А подробнее?');
    expect(calls).toEqual({ tree: 1, blob: 2, select: 2 });
  });

  it('новый push обновляет структуру, изменившийся файл перечитывается, остальные — из кэша', async () => {
    const { service, store, repo, calls } = makeService();
    await ask(service, repo.id);
    const changed = { ...repo, github: { ...repo.github, pushedAt: '2026-02-02T00:00:00.000Z' } };
    store.update(changed);
    store.saveTreeCache(repo.id, { ...ECC, entries: ECC.entries.map((e) => (e.path === 'commands/plan.md' ? { ...e, sha: 'sha-new' } : e)) }, '2026-02-02T00:00:00.000Z');
    // Структура уже свежая (pushedAt совпадает), поэтому дерево не запрашивается, а изменившийся файл — да.
    await ask(service, repo.id);
    expect(calls).toEqual({ tree: 1, blob: 3, select: 2 });

    store.update({ ...changed, github: { ...changed.github, pushedAt: '2026-03-03T00:00:00.000Z' } });
    await ask(service, repo.id);
    expect(calls.tree).toBe(2);
  });

  it('модель не выбрала файлы или упала — берутся кандидаты по ключевым словам', async () => {
    const empty = makeService({ select: async () => [] });
    const r1 = await ask(empty.service, empty.repo.id);
    expect(r1.sources).toHaveLength(3);
    expect(r1.sources).toEqual(expect.arrayContaining(['commands/plan.md', 'commands/review.md']));

    const failing = makeService({
      select: async () => {
        throw new Error('LLM не ответила');
      },
    });
    const r2 = await ask(failing.service, failing.repo.id);
    expect(r2.sources.length).toBeGreaterThan(0);
    expect(r2.sources.length).toBeLessThanOrEqual(config.chatMaxFiles);
  });

  it('без сети: без кэша — ответ по README с примечанием, с кэшем — сохранённая структура', async () => {
    let offline = true;
    const { service, repo, received } = makeService({ treeFails: () => offline });
    const r1 = await ask(service, repo.id);
    expect(r1.sources).toEqual([]);
    expect(r1.notice).toMatch(/только по README/);
    expect(received[0]?.hasTree).toBe(false);

    offline = false;
    await ask(service, repo.id);
    offline = true;
    // Кэш устарел по времени — пробуем GitHub, он недоступен, остаётся сохранённое.
    const saved = service['store'].getTreeCache(repo.id);
    service['store'].saveTreeCache(repo.id, { ...saved!.tree, fetchedAt: new Date(Date.now() - config.chatTreeTtlMs - 1000).toISOString() }, saved!.pushedAt);
    const r3 = await ask(service, repo.id);
    expect(r3.notice).toMatch(/сохранённая структура/);
    expect(r3.sources).toEqual(['docs/commands.md', 'commands/plan.md']);
  });

  it('лимит GitHub на середине чтения: отдаём прочитанное и примечание', async () => {
    const { service, repo } = makeService({ blobFails: (sha) => sha === 'sha-commands/plan.md' });
    const r = await ask(service, repo.id);
    expect(r.sources).toEqual(['docs/commands.md']);
    expect(r.notice).toMatch(/Не удалось прочитать 1 из выбранных файлов/);
  });

  it('удаление репозитория очищает кэш содержимого', async () => {
    const { service, store, repo } = makeService();
    await ask(service, repo.id);
    expect(store.getTreeCache(repo.id)).not.toBeNull();
    expect(store.getFileCache(repo.id, 'docs/commands.md', 'sha-docs/commands.md')).not.toBeNull();
    store.delete(repo.id);
    expect(store.getTreeCache(repo.id)).toBeNull();
    expect(store.getFileCache(repo.id, 'docs/commands.md', 'sha-docs/commands.md')).toBeNull();
  });
});
