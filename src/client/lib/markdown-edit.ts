/**
 * Чистые операции над текстом заметки в Markdown: обёртки (жирный, курсив…),
 * префиксы строк (заголовок, списки, цитата), ссылка, продолжение списка по Enter
 * и переключение чек-боксов из режима просмотра. Без DOM — покрыто тестами.
 */

export interface TextSelection {
  text: string;
  start: number;
  end: number;
}

export type WrapAction = 'bold' | 'italic' | 'strike' | 'code';
export type LineAction = 'heading' | 'quote' | 'ul' | 'ol' | 'task';
export type MarkdownAction = WrapAction | LineAction | 'link' | 'codeblock';

const WRAPS: Record<WrapAction, string> = { bold: '**', italic: '_', strike: '~~', code: '`' };

const LINE_PREFIX: Record<LineAction, { has: RegExp; add: (i: number) => string }> = {
  heading: { has: /^#{1,6}\s/, add: () => '## ' },
  quote: { has: /^>\s?/, add: () => '> ' },
  ul: { has: /^[-*+]\s(?!\[[ xX]\]\s)/, add: () => '- ' },
  ol: { has: /^\d+[.)]\s/, add: (i) => `${i + 1}. ` },
  task: { has: /^[-*+]\s\[[ xX]\]\s/, add: () => '- [ ] ' },
};

/** Любой маркер списка в начале строки (с отступом). */
const LIST_MARKER = /^(\s*)(?:([-*+])\s(\[[ xX]\]\s)?|(\d+)([.)])\s)/;

function wrap(sel: TextSelection, marker: string): TextSelection {
  const { text, start, end } = sel;
  const inner = text.slice(start, end);
  const m = marker.length;

  // Выделены сами маркеры вместе с текстом — снимаем.
  if (inner.length >= 2 * m && inner.startsWith(marker) && inner.endsWith(marker)) {
    const core = inner.slice(m, inner.length - m);
    return { text: text.slice(0, start) + core + text.slice(end), start, end: start + core.length };
  }
  // Маркеры стоят вокруг выделения — снимаем.
  if (text.slice(start - m, start) === marker && text.slice(end, end + m) === marker) {
    return { text: text.slice(0, start - m) + inner + text.slice(end + m), start: start - m, end: end - m };
  }
  return { text: text.slice(0, start) + marker + inner + marker + text.slice(end), start: start + m, end: end + m };
}

function lineBounds(text: string, start: number, end: number): [number, number] {
  const from = text.lastIndexOf('\n', start - 1) + 1;
  const nl = text.indexOf('\n', end);
  return [from, nl === -1 ? text.length : nl];
}

function prefixLines(sel: TextSelection, action: LineAction): TextSelection {
  const { text, start, end } = sel;
  const [from, to] = lineBounds(text, start, end);
  const lines = text.slice(from, to).split('\n');
  const rule = LINE_PREFIX[action];
  const allHave = lines.every((l) => rule.has.test(l));

  const next = lines.map((line, i) => {
    if (allHave) return line.replace(rule.has, '');
    // Снимаем чужой маркер, чтобы не получить «- 1. текст».
    const bare = action === 'heading' ? line : line.replace(LIST_MARKER, '$1').replace(/^>\s?/, '');
    return rule.add(i) + bare;
  });
  const block = next.join('\n');
  return { text: text.slice(0, from) + block + text.slice(to), start: from, end: from + block.length };
}

function link(sel: TextSelection): TextSelection {
  const { text, start, end } = sel;
  const inner = text.slice(start, end);
  const before = text.slice(0, start);
  const after = text.slice(end);
  if (/^https?:\/\/\S+$/i.test(inner)) {
    const out = `[](${inner})`;
    return { text: before + out + after, start: start + 1, end: start + 1 };
  }
  const label = inner || 'текст';
  const out = `[${label}](url)`;
  if (inner) {
    const urlAt = start + label.length + 3;
    return { text: before + out + after, start: urlAt, end: urlAt + 3 };
  }
  return { text: before + out + after, start: start + 1, end: start + 1 + label.length };
}

function codeblock(sel: TextSelection): TextSelection {
  const { text, start, end } = sel;
  const inner = text.slice(start, end);
  const before = text.slice(0, start);
  const after = text.slice(end);
  const open = before && !before.endsWith('\n') ? '\n```\n' : '```\n';
  const close = after && !after.startsWith('\n') ? '\n```\n' : '\n```';
  const s = start + open.length;
  return { text: before + open + inner + close + after, start: s, end: s + inner.length };
}

/** Применяет действие панели к выделению и возвращает новый текст с новым выделением. */
export function applyMarkdown(sel: TextSelection, action: MarkdownAction): TextSelection {
  switch (action) {
    case 'bold':
    case 'italic':
    case 'strike':
    case 'code':
      return wrap(sel, WRAPS[action]);
    case 'heading':
    case 'quote':
    case 'ul':
    case 'ol':
    case 'task':
      return prefixLines(sel, action);
    case 'link':
      return link(sel);
    case 'codeblock':
      return codeblock(sel);
  }
}

/**
 * Enter внутри списка: продолжает маркер («- », «3. », «- [ ] »).
 * Enter на пустом пункте завершает список (убирает маркер). Вне списка — null.
 */
export function continueList(text: string, caret: number): TextSelection | null {
  const from = text.lastIndexOf('\n', caret - 1) + 1;
  const line = text.slice(from, caret);
  const m = LIST_MARKER.exec(line);
  if (!m) return null;
  const [marker, indent, bullet, task, num, numSep] = m;

  if (line.length === marker.length) {
    // Пустой пункт — выходим из списка.
    const out = text.slice(0, from) + text.slice(caret);
    return { text: out, start: from, end: from };
  }
  const next = bullet ? `${indent}${bullet} ${task ? '[ ] ' : ''}` : `${indent}${Number(num) + 1}${numSep} `;
  const insert = '\n' + next;
  const out = text.slice(0, caret) + insert + text.slice(caret);
  return { text: out, start: caret + insert.length, end: caret + insert.length };
}

/** Чек-боксы заметки в порядке появления, как их рисует Markdown (строки внутри ``` не считаются). */
export function toggleTask(text: string, index: number): string {
  const lines = text.split('\n');
  let fenced = false;
  let seen = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const m = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\]\s)/.exec(line);
    if (!m) continue;
    if (seen === index) {
      const head = m[1] ?? '';
      const flipped = m[2] === ' ' ? 'x' : ' ';
      lines[i] = head + flipped + line.slice(head.length + 1);
      return lines.join('\n');
    }
    seen++;
  }
  return text;
}
