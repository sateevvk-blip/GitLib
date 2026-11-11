/** Чистая логика правки полей сводки (EditableField): разбор списка и решение, что делать при «Сохранить». */

export type FieldValue = string | string[];

/** Список из textarea: по пункту на строку, маркеры «- », «• », «* » срезаются, пустые строки выбрасываются. */
export function parseListInput(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-•*]\s+/, '').trim())
    .filter(Boolean);
}

export function sameValue(a: FieldValue | null | undefined, b: FieldValue | null | undefined): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    const x = Array.isArray(a) ? a : [];
    const y = Array.isArray(b) ? b : [];
    return x.length === y.length && x.every((v, i) => v === y[i]);
  }
  return (a ?? '').trim() === (b ?? '').trim();
}

/** Лимиты сервера (routes/tools.ts): превышение дало бы 400 и потерю набранного. */
export const FIELD_LIMITS = { text: 2000, items: 50, item: 500 } as const;

export type SaveDecision = { type: 'save'; value: FieldValue } | { type: 'reset' } | { type: 'blocked'; reason: 'empty' | 'long' };

/**
 * Что делать с черновиком. Совпало с версией AI — это не правка, а сброс. Пустой текст при наличии версии AI
 * не сохраняется: сервер считает пустую строку снятием правки, а молча вернуть версию AI нельзя — для этого есть кнопка.
 * Пустой список — осознанная правка «пунктов нет».
 */
export function decideSave(kind: 'text' | 'list', draft: string, aiValue: FieldValue | null): SaveDecision {
  if (kind === 'list') {
    const items = parseListInput(draft);
    if (items.length > FIELD_LIMITS.items || items.some((i) => i.length > FIELD_LIMITS.item)) return { type: 'blocked', reason: 'long' };
    return sameValue(items, Array.isArray(aiValue) ? aiValue : []) ? { type: 'reset' } : { type: 'save', value: items };
  }
  const text = draft.trim();
  const ai = typeof aiValue === 'string' ? aiValue.trim() : '';
  if (text === ai) return { type: 'reset' };
  if (text.length > FIELD_LIMITS.text) return { type: 'blocked', reason: 'long' };
  return text === '' ? { type: 'blocked', reason: 'empty' } : { type: 'save', value: text };
}

/** Значение в начальное содержимое textarea при входе в правку. */
export function toDraft(value: FieldValue | null): string {
  return Array.isArray(value) ? value.join('\n') : (value ?? '');
}
