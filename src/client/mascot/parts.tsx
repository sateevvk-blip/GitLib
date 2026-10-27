import type { Mood } from './moods';

export const INK = 'var(--mascot-ink)';
export const CREAM = 'var(--mascot-cream)';

export interface CharacterProps {
  mood: Mood;
  blink: boolean;
  /** Префикс id для pattern/clipPath внутри этого экземпляра SVG. */
  ids: string;
}

export const halftone = (ids: string) => `url(#${ids}-ht)`;

/** Тень под ногами. */
export function Shadow({ cx = 80, rx = 40 }: { cx?: number; rx?: number }) {
  return <ellipse className="m-shadow" cx={cx} cy="181" rx={rx} ry="4.5" fill={INK} opacity="0.12" />;
}

/** Толстая конечность с чернильной обводкой (как у «резиновых» персонажей 30-х). По умолчанию кремовая, можно синюю (halftone). */
export function Limb({ d, w = 6, color = CREAM, className }: { d: string; w?: number; color?: string; className?: string }) {
  return (
    <g className={className} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} stroke={INK} strokeWidth={w + 6} />
      <path d={d} stroke={color} strokeWidth={w} />
    </g>
  );
}

/** Круглый мультяшный ботинок: x — левый край, y — верх. */
export function Shoe({ x, y, w = 30, flip, className }: { x: number; y: number; w?: number; flip?: boolean; className?: string }) {
  const h = 14;
  const d = flip
    ? `M${x + w} ${y + h} h-${w} v-${h - 6} q0 -6 8 -6 h${w - 16} q8 0 8 8 z`
    : `M${x} ${y + h} h${w} v-${h - 6} q0 -6 -8 -6 h-${w - 16} q-8 0 -8 8 z`;
  return <path className={className} d={d} fill={CREAM} stroke={INK} strokeWidth="4" strokeLinejoin="round" />;
}

/** Кроссовок с синим язычком и шнуровкой. */
export function Sneaker({ x, y, ids, w = 34 }: { x: number; y: number; ids: string; w?: number }) {
  return (
    <g className="m-sneaker">
      <path d={`M${x} ${y + 16} h${w} v-7 q0 -4 -4 -4 h-6 l-6 -8 h-10 q-8 0 -8 10 z`} fill={CREAM} stroke={INK} strokeWidth="3.6" strokeLinejoin="round" />
      <path d={`M${x + 8} ${y + 5} l6 -8 h8 l5 7 z`} fill={halftone(ids)} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
      <path d={`M${x + 11} ${y + 2} h7 M${x + 12} ${y + 5} h9`} stroke={INK} strokeWidth="2" strokeLinecap="round" />
      <path d={`M${x + 1} ${y + 11} h${w - 2}`} stroke={INK} strokeWidth="2" />
    </g>
  );
}

/** Синяя кошачья лапа с двумя пальцами спереди: x — левый край, y — верх; flip — носок влево. */
export function Paw({ x, y, ids, w = 32, flip }: { x: number; y: number; ids: string; w?: number; flip?: boolean }) {
  const h = 12;
  const d = flip
    ? `M${x + w} ${y + h} h-${w} v-${h - 7} q0 -7 10 -7 h${w - 18} q8 0 8 8 z`
    : `M${x} ${y + h} h${w} v-${h - 7} q0 -7 -10 -7 h-${w - 18} q-8 0 -8 8 z`;
  const toe1 = flip ? x + 9 : x + w - 9;
  const toe2 = flip ? x + 16 : x + w - 16;
  return (
    <g>
      <path d={d} fill={halftone(ids)} stroke={INK} strokeWidth="4" strokeLinejoin="round" />
      <path d={`M${toe1} ${y + h} v-5 M${toe2} ${y + h} v-5`} stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
    </g>
  );
}

/** Раскрытая ладонь в перчатке: x, y — центр ладони, rot — поворот (0 — пальцы вверх). */
export function Hand({ x, y, rot = 0, fill = CREAM }: { x: number; y: number; rot?: number; fill?: string }) {
  // Пальцы — незамкнутые контуры: заливка прячет обводку ладони под ними, обводится только сам палец.
  const finger = (cx: number, len: number) => `M${cx - 3} -1 l0 -${len} q0 -3 3 -3 q3 0 3 3 l0 ${len}`;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`} stroke={INK} strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round">
      <path d="M-6 0 q-10 -3 -10 -10 q0 -4 4 -3.5 q4 1 8 8" fill={fill} />
      <circle cx="0" cy="0" r="8.5" fill={fill} />
      <path d={finger(-5.5, 10)} fill={fill} />
      <path d={finger(0, 12)} fill={fill} />
      <path d={finger(5.5, 9)} fill={fill} />
    </g>
  );
}

/** Кулак (рука в бок, рука на мяче). */
export function Fist({ x, y, fill = CREAM }: { x: number; y: number; fill?: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r="7" fill={fill} stroke={INK} strokeWidth="3.4" />
      <path d={`M${x - 3} ${y + 1} q3 -3 6 0`} stroke={INK} strokeWidth="2" fill="none" strokeLinecap="round" />
    </g>
  );
}
