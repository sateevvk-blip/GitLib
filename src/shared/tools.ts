/**
 * Отображение инструмента: «правка пользователя поверх AI» и запасные значения.
 * Единственное место с этой логикой — сервер, клиент и промпты берут значения только отсюда.
 */
import type { ToolOverrides, ToolSummary } from './types.js';
import { fold } from './search.js';

export function toolTitle(t: ToolSummary): string {
  return t.user.title?.trim() || t.source.title?.trim() || t.domain;
}

export function toolDescription(t: ToolSummary): string | null {
  return t.user.description?.trim() || t.source.description?.trim() || null;
}

export function toolCategory(t: ToolSummary): string | null {
  return t.user.category?.trim() || t.analysis.suggestedCategory || null;
}

/** Личные теги + предложенные AI, без дублей по fold. */
export function toolTags(t: ToolSummary): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of [...t.user.tags, ...t.analysis.suggestedTags]) {
    const k = fold(tag);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(tag);
  }
  return out;
}

export interface ToolFieldValues {
  summary: string | null;
  purpose: string | null;
  audience: string | null;
  features: string[];
  useCases: string[];
  /** Тексты ограничений; цитаты-подтверждения лежат только в analysis.limitations. */
  limitations: string[];
}

/** Значение поля сводки: правка пользователя, иначе версия AI. */
export function toolField<K extends keyof ToolFieldValues>(t: ToolSummary, field: K): ToolFieldValues[K] {
  const own = t.user.overrides[field];
  if (own !== undefined) return own as ToolFieldValues[K];
  if (field === 'limitations') return t.analysis.limitations.map((l) => l.text) as ToolFieldValues[K];
  return t.analysis[field] as ToolFieldValues[K];
}

export function isOverridden(t: ToolSummary, field: keyof ToolOverrides): boolean {
  return t.user.overrides[field] !== undefined;
}

/** Источник новее анализа: страницу обновили после того, как модель её прочитала. */
export function isAnalysisStale(t: ToolSummary): boolean {
  const { analysis, source } = t;
  if (analysis.status !== 'done' || !analysis.basedOn || !source.fetchedAt) return false;
  const based = analysis.basedOn.sourceFetchedAt;
  return based === null || based < source.fetchedAt;
}

/** Версия AI поля сводки; null — анализа ещё не было. Прошлая сводка остаётся и при новом анализе или его сбое. */
export function toolAiField(t: ToolSummary, field: keyof ToolOverrides): string | string[] | null {
  const a = t.analysis;
  if (a.generatedAt === null) return null;
  if (field === 'limitations') return a.limitations.map((l) => l.text);
  if (field === 'features' || field === 'useCases') return a[field];
  return a[field] ?? '';
}

/** Описание со страницы; null — страница его не дала (или карточка ручная). */
export function toolSourceDescription(t: ToolSummary): string | null {
  return t.source.description?.trim() || null;
}

/** Описание «изменено пользователем» относительно страницы. У ручной карточки описание и есть основа — правкой оно не считается. */
export function isDescriptionOverridden(t: ToolSummary): boolean {
  return t.user.description !== null && t.source.status !== 'manual';
}
