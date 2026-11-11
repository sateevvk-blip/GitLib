import { describe, expect, it } from 'vitest';
import { makeSource, makeTool } from './helpers.js';
import {
  IMPORT_NOTES_SEPARATOR,
  applyToolAnalysis,
  applyToolImage,
  applyToolPatch,
  applyToolSource,
  emptyToolAnalysis,
  mergeImportedTool,
} from '../src/shared/merge.js';
import { isAnalysisStale, isDescriptionOverridden, toolAiField, toolSourceDescription, toolField } from '../src/shared/tools.js';
import type { Tool, ToolAnalysis } from '../src/shared/types.js';

const done = (generatedAt: string, summary: string): ToolAnalysis => ({ ...emptyToolAnalysis(), status: 'done', summary, generatedAt });
const withUser = (t: Tool, u: Partial<Tool['user']>): Tool => ({ ...t, user: { ...t.user, ...u } });

describe('applyToolPatch', () => {
  it('меняет только user, source и analysis не трогает', () => {
    const t = { ...makeTool(), analysis: done('2026-01-01', 'AI') };
    const p = applyToolPatch(t, { title: ' Имя ', tags: ['a', 'A', 'b'], favorite: true, confirmed: true, notes: 'n', category: '  ' });
    expect(p.source).toBe(t.source);
    expect(p.analysis).toBe(t.analysis);
    expect(p.user).toMatchObject({ title: 'Имя', tags: ['a', 'b'], favorite: true, confirmed: true, notes: 'n', category: null });
  });

  it('overrides: частично, null и пустая строка снимают правку, пустой список — правка', () => {
    let t = applyToolPatch(makeTool(), { overrides: { summary: 'S', features: ['x', ' ', 'y'], purpose: 'P' } });
    expect(t.user.overrides).toEqual({ summary: 'S', features: ['x', 'y'], purpose: 'P' });
    t = applyToolPatch(t, { overrides: { summary: null, purpose: '  ', useCases: [] } });
    expect(t.user.overrides).toEqual({ features: ['x', 'y'], useCases: [] });
  });
});

describe('applyToolImage', () => {
  it('меняет только user.imagePath и updatedAt', () => {
    const t = { ...makeTool(), analysis: done('2026-01-01', 'AI') };
    const r = applyToolImage(t, 'tool-images/a.png', '2030-01-01T00:00:00.000Z');
    expect(r.user).toEqual({ ...t.user, imagePath: 'tool-images/a.png', updatedAt: '2030-01-01T00:00:00.000Z' });
    expect(r.source).toBe(t.source);
    expect(r.analysis).toBe(t.analysis);
    expect(applyToolImage(r, null).user.imagePath).toBeNull();
  });
});

describe('applyToolPatch: белый список overrides', () => {
  it('лишние ключи и __proto__ не попадают в результат', () => {
    const patch = JSON.parse('{"overrides":{"summary":"S","imagePath":"x.png","__proto__":{"polluted":"y"}}}');
    const t = applyToolPatch(makeTool(), patch);
    expect(t.user.overrides).toEqual({ summary: 'S' });
    expect(Object.getPrototypeOf(t.user.overrides)).toBe(Object.prototype);
    expect('polluted' in t.user.overrides).toBe(false);
  });
});

describe('правка пользователя переживает обновления', () => {
  it('повторный анализ и обновление страницы не меняют user, включая overrides', () => {
    const t = applyToolPatch({ ...makeTool(), analysis: done('2026-01-01', 'AI v1') }, { overrides: { summary: 'Моя' }, notes: 'заметка', confirmed: true });
    const reanalyzed = applyToolAnalysis(t, done('2026-02-01', 'AI v2'));
    const refreshed = applyToolSource(reanalyzed, makeSource({ title: 'Новое', fetchedAt: '2026-03-01' }));
    expect(refreshed.user).toBe(t.user);
    expect(toolField(refreshed, 'summary')).toBe('Моя');
    expect(refreshed.analysis.summary).toBe('AI v2');
    expect(refreshed.source.title).toBe('Новое');
  });
});

describe('mergeImportedTool', () => {
  const local = withUser({ ...makeTool('https://x.io'), analysis: done('2026-01-01', 'local AI') }, {
    notes: 'локальная',
    tags: ['a'],
    favorite: false,
    confirmed: false,
    title: 'Локальное',
    overrides: { summary: 'правка локальная' },
  });
  const imported = withUser(
    { ...makeTool('https://x.io'), analysis: done('2026-02-01', 'imported AI'), source: makeSource({ fetchedAt: '2026-05-01', title: 'Из файла' }) },
    { notes: 'из файла', tags: ['A', 'b'], favorite: true, confirmed: true, title: 'Из файла', imagePath: 'tool-images/z.png', overrides: { summary: 'правка файла', purpose: 'цель файла' } },
  );

  it('skip оставляет локальную запись', () => {
    expect(mergeImportedTool(local, imported, 'skip')).toBe(local);
  });

  it('replace берёт данные файла, но сохраняет локальный id', () => {
    const r = mergeImportedTool(local, imported, 'replace');
    expect(r.id).toBe(local.id);
    expect(r.user.notes).toBe('из файла');
    expect(r.analysis.summary).toBe('imported AI');
  });

  it('merge ничего не теряет молча', () => {
    const r = mergeImportedTool(local, imported, 'merge');
    expect(r.id).toBe(local.id);
    expect(r.key).toBe(local.key);
    expect(r.user.notes).toBe(`локальная${IMPORT_NOTES_SEPARATOR}из файла`);
    expect(r.user.tags).toEqual(['a', 'b']);
    expect(r.user.favorite).toBe(true);
    expect(r.user.confirmed).toBe(true);
    expect(r.user.title).toBe('Локальное');
    expect(r.user.imagePath).toBe('tool-images/z.png');
    expect(r.user.overrides).toEqual({ summary: 'правка локальная', purpose: 'цель файла' });
    expect(r.source.title).toBe('Из файла');
    expect(r.analysis.summary).toBe('imported AI');
  });

  it('merge: готовый локальный анализ не заменяется неготовым, повторяющиеся заметки не дублируются', () => {
    const r = mergeImportedTool(local, withUser({ ...imported, analysis: emptyToolAnalysis() }, { notes: 'локальная' }), 'merge');
    expect(r.analysis.summary).toBe('local AI');
    expect(r.user.notes).toBe('локальная');
  });
});

describe('isAnalysisStale', () => {
  const analysed = (basedOn: string | null, source = '2026-01-02T00:00:00.000Z'): Tool => ({
    ...makeTool(),
    source: makeSource({ fetchedAt: source }),
    analysis: { ...done('2026-01-03', 'AI'), basedOn: { sourceFetchedAt: basedOn, sourceStatus: 'ok', chars: 10 } },
  });

  it('свежий анализ — false; после refresh — true', () => {
    const t = analysed('2026-01-02T00:00:00.000Z');
    expect(isAnalysisStale(t)).toBe(false);
    expect(isAnalysisStale(applyToolSource(t, makeSource({ fetchedAt: '2026-01-05T00:00:00.000Z' })))).toBe(true);
  });

  it('ручная карточка с анализом после первого refresh — true', () => {
    const manual = analysed(null, '2026-01-02T00:00:00.000Z');
    expect(isAnalysisStale({ ...manual, source: makeSource({ status: 'manual', fetchedAt: null }) })).toBe(false);
    expect(isAnalysisStale(manual)).toBe(true);
  });

  it('статусы none и failed — false', () => {
    const t = analysed('2025-01-01T00:00:00.000Z');
    expect(isAnalysisStale({ ...t, analysis: { ...t.analysis, status: 'none' } })).toBe(false);
    expect(isAnalysisStale({ ...t, analysis: { ...t.analysis, status: 'failed' } })).toBe(false);
  });
});

describe('toolAiField и описание', () => {
  it('без анализа версии AI нет; с анализом — поля AI, ограничения — их тексты', () => {
    const t = makeTool();
    expect(toolAiField(t, 'summary')).toBeNull();
    expect(toolAiField(t, 'features')).toBeNull();
    const a: Tool = { ...t, analysis: { ...t.analysis, status: 'done', generatedAt: '2026-01-03T00:00:00.000Z', summary: 'AI', features: ['а'], limitations: [{ text: 'огр', evidence: 'цитата' }] } };
    expect(toolAiField(a, 'summary')).toBe('AI');
    expect(toolAiField(a, 'purpose')).toBe('');
    expect(toolAiField(a, 'features')).toEqual(['а']);
    expect(toolAiField(a, 'limitations')).toEqual(['огр']);
    // правка пользователя версию AI не меняет
    expect(toolAiField(applyToolPatch(a, { overrides: { summary: 'своё' } }), 'summary')).toBe('AI');
  });

  it('описание: правка поверх страницы — да, у ручной карточки — нет', () => {
    const page = { ...makeTool(), source: makeSource({ status: 'ok', description: 'со страницы' }) };
    expect(isDescriptionOverridden(page)).toBe(false);
    expect(isDescriptionOverridden(applyToolPatch(page, { description: 'своё' }))).toBe(true);
    expect(toolSourceDescription(page)).toBe('со страницы');
    const manual = applyToolPatch({ ...makeTool(), source: makeSource({ status: 'manual', description: null }) }, { description: 'своё' });
    expect(isDescriptionOverridden(manual)).toBe(false);
    expect(toolSourceDescription(manual)).toBeNull();
  });
});
