import { describe, expect, it } from 'vitest';
import { makeTool } from './helpers.js';
import { emptyToolAnalysis, newToolUser } from '../src/shared/merge.js';
import { isOverridden, toolCategory, toolDescription, toolField, toolTags, toolTitle } from '../src/shared/tools.js';
import { computeToolFacets, scoreTools, searchTools } from '../src/shared/tools-search.js';
import type { Tool, ToolAnalysis } from '../src/shared/types.js';

const done = (a: Partial<ToolAnalysis>): ToolAnalysis => ({ ...emptyToolAnalysis(), status: 'done', ...a });
const withUser = (t: Tool, u: Partial<Tool['user']>): Tool => ({ ...t, user: { ...t.user, ...u } });

describe('отображение: правка пользователя поверх AI', () => {
  it('названия и запасные значения', () => {
    const t = makeTool('https://www.example.com/x');
    expect(toolTitle(t)).toBe('Example Tool');
    expect(toolTitle({ ...t, source: { ...t.source, title: null } })).toBe('example.com');
    expect(toolTitle(withUser(t, { title: 'Моё имя' }))).toBe('Моё имя');
    expect(toolDescription(withUser(t, { description: 'свой текст' }))).toBe('свой текст');
    expect(toolCategory({ ...t, analysis: done({ suggestedCategory: 'Дизайн' }) })).toBe('Дизайн');
    expect(toolCategory({ ...t, analysis: done({ suggestedCategory: 'Дизайн' }), user: { ...t.user, category: '3D и графика' } })).toBe(
      '3D и графика',
    );
  });

  it('toolField берёт правку, иначе версию AI; новый анализ правку не затирает', () => {
    const base = makeTool();
    const edited = withUser(base, { overrides: { summary: 'Моя сводка', limitations: ['Платно'] } });
    const first = { ...edited, analysis: done({ summary: 'AI v1', limitations: [{ text: 'Нет API', evidence: 'no api' }] }) };
    expect(toolField(first, 'summary')).toBe('Моя сводка');
    expect(toolField(first, 'limitations')).toEqual(['Платно']);
    expect(isOverridden(first, 'summary')).toBe(true);
    expect(isOverridden(first, 'purpose')).toBe(false);
    // повторный анализ заменил analysis целиком — правка на месте, неправленое поле обновилось
    const second = { ...first, analysis: done({ summary: 'AI v2', purpose: 'Цель v2' }) };
    expect(toolField(second, 'summary')).toBe('Моя сводка');
    expect(toolField(second, 'purpose')).toBe('Цель v2');
    expect(toolField({ ...base, analysis: done({ limitations: [{ text: 'Нет API', evidence: 'no api' }] }) }, 'limitations')).toEqual(['Нет API']);
  });

  it('toolTags: личные + предложенные без дублей по fold', () => {
    const t = withUser({ ...makeTool(), analysis: done({ suggestedTags: ['Три-Д', 'webgl', 'ЭЛЬ'] }) }, { tags: ['три-д', 'эль'] });
    expect(toolTags(t)).toEqual(['три-д', 'эль', 'webgl']);
  });
});

describe('поиск и фильтры', () => {
  const three = withUser(
    { ...makeTool('https://threejs.org'), analysis: done({ summary: 'Библиотека для трёхмерной графики в браузере', suggestedCategory: '3D и графика', suggestedTags: ['webgl'] }) },
    { confirmed: true },
  );
  const figma = withUser(makeTool('https://figma.com'), { title: 'Figma', notes: 'Макеты и ПРОТОТИПЫ', favorite: true, category: 'Дизайн', confirmed: true });
  const draft = makeTool('https://draft.dev');
  const all = [three, figma, draft];

  it('кириллица без учёта регистра и ё', () => {
    expect(searchTools(all, { q: 'ТРЁХМЕРН' })).toEqual([three]);
    expect(searchTools(all, { q: 'трехмерной графики' })).toEqual([three]);
    expect(searchTools(all, { q: 'прототипы макеты' })).toEqual([figma]);
    expect(searchTools(all, { q: 'threejs' })).toEqual([three]);
  });

  it('фильтры', () => {
    expect(searchTools(all, { categories: ['дизайн'] })).toEqual([figma]);
    expect(searchTools(all, { tags: ['WebGL'] })).toEqual([three]);
    expect(searchTools(all, { favorite: true })).toEqual([figma]);
    expect(searchTools(all, { drafts: true })).toEqual([draft]);
    expect(searchTools(all, { noAnalysis: true }).map((t) => t.id).sort()).toEqual([draft.id, figma.id].sort());
  });

  it('сортировка', () => {
    expect(searchTools(all, { sort: 'name' }).map(toolTitle)).toEqual(['Example Tool', 'Example Tool', 'Figma']);
    const newest = searchTools(all, { sort: 'added' })[0]!;
    expect(newest).toBe(draft);
    const bumped = withUser(three, { updatedAt: '2030-01-01T00:00:00.000Z' });
    expect(searchTools([bumped, figma, draft], { sort: 'updated' })[0]).toBe(bumped);
  });

  it('фасеты', () => {
    const f = computeToolFacets(all);
    expect(f.total).toBe(3);
    expect(f.favorites).toBe(1);
    expect(f.drafts).toBe(1);
    expect(f.noAnalysis).toBe(2);
    expect(f.categories.map((c) => c.value).sort()).toEqual(['3D и графика', 'Дизайн']);
    expect(f.tags).toEqual([{ value: 'webgl', count: 1 }]);
  });
});

describe('scoreTools', () => {
  const a = { ...makeTool('https://threejs.org'), user: { ...newToolUser(), title: 'three.js', tags: ['3d'] } };
  const b = { ...makeTool('https://notion.so'), user: { ...newToolUser(), title: 'Notion', notes: 'удобно для заметок' } };
  const c = { ...makeTool('https://other.dev'), user: { ...newToolUser(), title: 'Other' } };

  it('вес названия и тегов выше заметок, нулевой скор у несвязанных', () => {
    const r = scoreTools([c, b, a], 'нужен three.js для заметок');
    expect(r[0]!.tool).toBe(a);
    expect(r[0]!.score).toBe(6);
    expect(r[1]!.tool).toBe(b);
    expect(r[1]!.score).toBe(1);
    expect(r[2]!.score).toBe(0);
  });

  it('короткие и стоп-слова игнорируются', () => {
    expect(scoreTools([a], 'для на и the for to of').every((x) => x.score === 0)).toBe(true);
  });

  it('«app» — стоп-слово: совпадение только в домене .app не даёт скор', () => {
    const foo = { ...makeTool('https://foo.app'), user: { ...newToolUser(), title: 'Foo' } };
    expect(scoreTools([foo], 'app for notes')[0]!.score).toBe(0);
  });

  it('короткие токены не находятся внутри слов (google, mailchimp, build)', () => {
    const traps = [
      { ...makeTool('https://fonts.google.com'), user: { ...newToolUser(), title: 'Google Fonts' } },
      { ...makeTool('https://mailchimp.com'), user: { ...newToolUser(), title: 'Mailchimp' } },
      { ...makeTool('https://build.example'), user: { ...newToolUser(), title: 'Build guide' } },
    ];
    for (const r of scoreTools(traps, 'нужен AI для 3D UI на Go')) expect(r.score).toBe(0);
  });

  it('знаки препинания в запросе не мешают: «AI, 3D», «(AI)»', () => {
    const ai = { ...makeTool('https://ai.example'), user: { ...newToolUser(), title: 'Модель', tags: ['AI'] } };
    expect(scoreTools([ai], 'AI, 3D')[0]!.score).toBe(3);
    expect(scoreTools([ai], '(AI)')[0]!.score).toBe(3);
  });

  it('двухсимвольные названия (AI, 3D) остаются токенами', () => {
    const ai = { ...makeTool('https://ai.example'), user: { ...newToolUser(), title: 'Модель', tags: ['AI'] } };
    const score = (tool: typeof a, q: string) => scoreTools([tool], q)[0]!.score;
    expect(score(ai, 'нужен AI для 3D UI на Go')).toBe(3);
    expect(score(a, 'нужен AI для 3D UI на Go')).toBe(3);
  });
});
