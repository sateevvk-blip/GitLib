import type { ToolFacets, ToolQuery, ToolSortKey, ToolSummary } from './types.js';
import { fold, tokenize } from './search.js';
import { toolCategory, toolDescription, toolField, toolTags, toolTitle } from './tools.js';

const collator = new Intl.Collator(['ru', 'en'], { sensitivity: 'base', numeric: true });

function haystack(t: ToolSummary): string {
  return fold(
    [
      toolTitle(t),
      t.domain,
      toolDescription(t),
      toolCategory(t),
      toolTags(t).join(' '),
      toolField(t, 'summary'),
      toolField(t, 'purpose'),
      toolField(t, 'audience'),
      toolField(t, 'features').join(' '),
      toolField(t, 'useCases').join(' '),
      t.user.notes,
    ]
      .filter(Boolean)
      .join('\n'),
  );
}

export function matchesToolQuery(t: ToolSummary, q: string | undefined): boolean {
  const tokens = tokenize(q ?? '');
  if (tokens.length === 0) return true;
  const text = haystack(t);
  return tokens.every((x) => text.includes(x));
}

export function matchesToolFilters(t: ToolSummary, query: ToolQuery): boolean {
  if (!matchesToolQuery(t, query.q)) return false;
  const categories = (query.categories ?? []).map(fold).filter(Boolean);
  if (categories.length > 0 && !categories.includes(fold(toolCategory(t)))) return false;
  const tags = (query.tags ?? []).map(fold).filter(Boolean);
  if (tags.length > 0) {
    const own = new Set(toolTags(t).map(fold));
    if (!tags.every((x) => own.has(x))) return false;
  }
  if (query.favorite && !t.user.favorite) return false;
  if (query.drafts && t.user.confirmed) return false;
  if (query.noAnalysis && t.analysis.status === 'done') return false;
  return true;
}

export function sortTools<T extends ToolSummary>(tools: T[], sort: ToolSortKey = 'added'): T[] {
  const arr = [...tools];
  switch (sort) {
    case 'name':
      arr.sort((a, b) => collator.compare(toolTitle(a), toolTitle(b)));
      break;
    case 'updated':
      arr.sort((a, b) => b.user.updatedAt.localeCompare(a.user.updatedAt));
      break;
    case 'added':
    default:
      arr.sort((a, b) => b.user.addedAt.localeCompare(a.user.addedAt));
  }
  return arr;
}

export function searchTools<T extends ToolSummary>(tools: T[], query: ToolQuery): T[] {
  return sortTools(
    tools.filter((t) => matchesToolFilters(t, query)),
    query.sort,
  );
}

function countValues(values: Iterable<string>): Array<{ value: string; count: number }> {
  const m = new Map<string, { value: string; count: number }>();
  for (const v of values) {
    const k = fold(v);
    if (!k) continue;
    const e = m.get(k);
    if (e) e.count += 1;
    else m.set(k, { value: v, count: 1 });
  }
  return [...m.values()].sort((a, b) => b.count - a.count || collator.compare(a.value, b.value));
}

export function computeToolFacets(tools: ToolSummary[]): ToolFacets {
  return {
    categories: countValues(tools.map(toolCategory).filter((c): c is string => c !== null)),
    tags: countValues(tools.flatMap(toolTags)),
    favorites: tools.filter((t) => t.user.favorite).length,
    drafts: tools.filter((t) => !t.user.confirmed).length,
    noAnalysis: tools.filter((t) => t.analysis.status !== 'done').length,
    total: tools.length,
  };
}

const STOP_WORDS = new Set([
  'нужен', 'нужна', 'нужно', 'нужны', 'надо', 'хочу', 'можно', 'чтобы', 'для', 'что', 'как', 'это', 'мне',
  'под', 'при', 'без', 'или', 'the', 'for', 'and', 'with', 'need', 'want', 'tool', 'how', 'app',
  'на', 'по', 'не', 'из', 'до', 'от', 'за', 'же', 'ли', 'бы', 'то', 'со', 'во', 'об',
  'to', 'of', 'in', 'on', 'an', 'is', 'it',
]);

/**
 * Скоринг для подбора под задачу. Токены задачи без однобуквенных и стоп-слов (AI, 3D, Go остаются); на токен вес группы
 * полей, где он встретился: название/домен/теги 3, категория/summary 2, остальное 1.
 * Токены ≤ 3 символов совпадают только с целым словом, длинные — подстрокой.
 * Возвращает все карточки по убыванию скора (при равенстве — исходный порядок).
 */
export function scoreTools<T extends ToolSummary>(tools: T[], task: string): Array<{ tool: T; score: number }> {
  // shortcut: c++ и c# после разбиения по не-буквам становятся однобуквенными и отсеиваются, вернуться при запросе
  const tokens = fold(task)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((x) => x.length >= 2 && !STOP_WORDS.has(x));
  const scored = tools.map((tool) => {
    const groups: Array<[number, string]> = [
      [3, fold([toolTitle(tool), tool.domain, toolTags(tool).join(' ')].join('\n'))],
      [2, fold([toolCategory(tool), toolField(tool, 'summary')].join('\n'))],
      [
        1,
        fold(
          [
            toolField(tool, 'features').join(' '),
            toolField(tool, 'useCases').join(' '),
            toolDescription(tool),
            tool.user.notes,
          ].join('\n'),
        ),
      ],
    ];
    const words = groups.map(([, text]) => new Set(text.split(/[^\p{L}\p{N}]+/u)));
    let score = 0;
    for (const token of tokens) {
      groups.forEach(([weight, text], i) => {
        // Короткие токены (ai, go, ui) — только целым словом, иначе «go» найдётся в «google».
        if (token.length <= 3 ? words[i]!.has(token) : text.includes(token)) score += weight;
      });
    }
    return { tool, score };
  });
  return scored.sort((a, b) => b.score - a.score);
}
