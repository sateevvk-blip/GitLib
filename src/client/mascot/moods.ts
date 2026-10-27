/**
 * Настроения маскота и выражения лица, общие для всех персонажей.
 * Персонаж рисует тело и реквизит, а лицо (брови, веки, зрачки, рот) берёт отсюда.
 */
export const MOODS = [
  'idle',
  'thinking',
  'happy',
  'sad',
  'search',
  'sleep',
  'love',
  'surprised',
  'wink',
  'cool',
  'grumpy',
  'shy',
  'laugh',
  'dizzy',
  'wave',
  'party',
] as const;

export type Mood = (typeof MOODS)[number];

export type MouthKind = 'smirk' | 'flat' | 'tiny' | 'smile' | 'grin' | 'frown' | 'o' | 'wavy' | 'laugh';

export interface Expression {
  /** Доля закрытого глаза: 0 — открыт, 1 — закрыт. Левый и правый отдельно (подмигивание). */
  lidL: number;
  lidR: number;
  /** Наклон бровей: положительный — внутренние концы вниз («сердито»), отрицательный — вверх. */
  brow: number;
  /** Подъём бровей (отрицательный — выше). */
  browY: number;
  /** Дополнительный сдвиг левой брови (одна бровь выше другой). */
  browSkew: number;
  mouth: MouthKind;
  /** Смещение зрачков. */
  px: number;
  py: number;
  /** Форма края века: положительный — провисает вниз (сон), отрицательный — дуга вверх (смех). */
  edge: number;
  blush: boolean;
  /** Моргает ли персонаж в этом настроении. */
  blink: boolean;
}

export const EXPR: Record<Mood, Expression> = {
  idle: { lidL: 0.45, lidR: 0.45, brow: 2, browY: 0, browSkew: 0, mouth: 'smirk', px: 2, py: 1, edge: 0, blush: false, blink: true },
  thinking: { lidL: 0.3, lidR: 0.4, brow: -4, browY: -2, browSkew: -4, mouth: 'tiny', px: 3, py: -3, edge: 0, blush: false, blink: true },
  happy: { lidL: 0.18, lidR: 0.18, brow: -8, browY: -3, browSkew: 0, mouth: 'smile', px: 1, py: 0, edge: 0, blush: true, blink: true },
  sad: { lidL: 0.5, lidR: 0.5, brow: 16, browY: -1, browSkew: 0, mouth: 'frown', px: -1, py: 3, edge: 0, blush: false, blink: true },
  search: { lidL: 0.25, lidR: 0.45, brow: 4, browY: -1, browSkew: -5, mouth: 'flat', px: 4, py: -1, edge: 0, blush: false, blink: true },
  sleep: { lidL: 1, lidR: 1, brow: 4, browY: 2, browSkew: 0, mouth: 'tiny', px: 0, py: 0, edge: 3, blush: false, blink: false },
  love: { lidL: 0.2, lidR: 0.2, brow: -6, browY: -2, browSkew: 0, mouth: 'smile', px: 0, py: 0, edge: 0, blush: true, blink: true },
  surprised: { lidL: 0, lidR: 0, brow: -14, browY: -7, browSkew: 0, mouth: 'o', px: 0, py: -1, edge: 0, blush: false, blink: true },
  wink: { lidL: 1, lidR: 0.2, brow: -8, browY: -3, browSkew: 0, mouth: 'smirk', px: 2, py: 0, edge: -6, blush: false, blink: false },
  cool: { lidL: 0.3, lidR: 0.3, brow: 0, browY: -1, browSkew: 0, mouth: 'smirk', px: 2, py: 0, edge: 0, blush: false, blink: false },
  grumpy: { lidL: 0.55, lidR: 0.55, brow: 18, browY: 2, browSkew: 0, mouth: 'wavy', px: 0, py: 1, edge: 0, blush: false, blink: true },
  shy: { lidL: 0.3, lidR: 0.3, brow: -3, browY: -1, browSkew: 0, mouth: 'tiny', px: -3, py: 3, edge: 0, blush: true, blink: true },
  laugh: { lidL: 1, lidR: 1, brow: -10, browY: -4, browSkew: 0, mouth: 'laugh', px: 0, py: 0, edge: -7, blush: true, blink: false },
  dizzy: { lidL: 0.1, lidR: 0.1, brow: -4, browY: -2, browSkew: 6, mouth: 'wavy', px: 0, py: 0, edge: 0, blush: false, blink: false },
  wave: { lidL: 0.2, lidR: 0.2, brow: -8, browY: -3, browSkew: 0, mouth: 'grin', px: 1, py: 0, edge: 0, blush: false, blink: true },
  party: { lidL: 0.1, lidR: 0.1, brow: -10, browY: -4, browSkew: 0, mouth: 'grin', px: 0, py: -1, edge: 0, blush: true, blink: true },
};

export const MOOD_LABELS: Record<Mood, string> = {
  idle: 'Спокоен',
  thinking: 'Думает',
  happy: 'Радуется',
  sad: 'Грустит',
  search: 'Ищет',
  sleep: 'Спит',
  love: 'Влюблён',
  surprised: 'Удивлён',
  wink: 'Подмигивает',
  cool: 'Крутой',
  grumpy: 'Ворчит',
  shy: 'Смущён',
  laugh: 'Смеётся',
  dizzy: 'Голова кружится',
  wave: 'Машет',
  party: 'Празднует',
};
