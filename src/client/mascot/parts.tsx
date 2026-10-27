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

/** Толстая кремовая конечность с чернильной обводкой (как у «резиновых» персонажей 30-х). */
export function Limb({ d, w = 6, className }: { d: string; w?: number; className?: string }) {
  return (
    <g className={className} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} stroke={INK} strokeWidth={w + 6} />
      <path d={d} stroke={CREAM} strokeWidth={w} />
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
