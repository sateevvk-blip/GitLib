import type { Expression, Mood, MouthKind } from './moods';
import { EXPR } from './moods';

const INK = 'var(--mascot-ink)';

export interface FaceProps {
  mood: Mood;
  blink: boolean;
  /** Префикс для id clipPath/pattern — уникален на каждый экземпляр SVG. */
  ids: string;
  /** Центр между глазами. */
  cx: number;
  cy: number;
  /** Расстояние между центрами глаз и радиус глаза. */
  gap?: number;
  r?: number;
  /** Цвет «кожи» — им закрашены веки и брови. */
  skin: 'cream' | 'blue';
  mouthDx?: number;
  mouthDy?: number;
  browDy?: number;
}

function Mouth({ kind, x, y }: { kind: MouthKind; x: number; y: number }) {
  const t = `translate(${x} ${y})`;
  switch (kind) {
    case 'smirk':
      return <path transform={t} d="M-7 0 q7 4 14 -2" stroke={INK} strokeWidth="3.2" fill="none" strokeLinecap="round" />;
    case 'flat':
      return <path transform={t} d="M-6 0 h12" stroke={INK} strokeWidth="3.2" fill="none" strokeLinecap="round" />;
    case 'tiny':
      return <path transform={t} d="M-3 0 q3 2.5 6 0" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />;
    case 'smile':
      return <path transform={t} d="M-9 -2 q9 11 18 0" stroke={INK} strokeWidth="3.2" fill="none" strokeLinecap="round" />;
    case 'frown':
      return <path transform={t} d="M-8 3 q8 -9 16 0" stroke={INK} strokeWidth="3.2" fill="none" strokeLinecap="round" />;
    case 'o':
      return <ellipse transform={t} cx="0" cy="1" rx="4.2" ry="5.5" fill={INK} />;
    case 'wavy':
      return <path transform={t} d="M-9 0 q4.5 -4 9 0 t9 0" stroke={INK} strokeWidth="3.2" fill="none" strokeLinecap="round" />;
    case 'grin':
      return (
        <g transform={t}>
          <path d="M-10 -3 q10 15 20 0 z" fill={INK} />
          <path d="M-5 0 q5 6 10 0 z" fill="var(--mascot-coral)" />
        </g>
      );
    case 'laugh':
      return (
        <g transform={t}>
          <path d="M-11 -3 q11 19 22 0 z" fill={INK} />
          <path d="M-6 2 q6 7 12 0 z" fill="var(--mascot-coral)" />
          <path d="M-9 -2 h18" stroke="#fff" strokeWidth="2.2" />
        </g>
      );
  }
}

function Eye({ ex, ey, r, lid, side, ids, e, mood, skinFill }: { ex: number; ey: number; r: number; lid: number; side: 'l' | 'r'; ids: string; e: Expression; mood: Mood; skinFill: string }) {
  const clip = `${ids}-e${side}`;
  const box = r * 2 + 4;
  const lidH = box * lid;
  const edgeY = ey - r - 2 + lidH;
  return (
    <g className={`m-eye m-eye-${side}`}>
      <clipPath id={clip}>
        <circle cx={ex} cy={ey} r={r} />
      </clipPath>
      <circle cx={ex} cy={ey} r={r} fill="#fff" stroke={INK} strokeWidth="3.2" />
      {mood === 'love' ? (
        <path
          d={`M${ex} ${ey + 6} l-6.5 -6.5 a3.8 3.8 0 0 1 6.5 -4.5 a3.8 3.8 0 0 1 6.5 4.5 z`}
          fill="var(--mascot-coral)"
          stroke={INK}
          strokeWidth="1.4"
          clipPath={`url(#${clip})`}
        />
      ) : mood === 'dizzy' ? (
        <path
          className="m-spiral"
          style={{ transformOrigin: `${ex}px ${ey}px` }}
          d={`M${ex} ${ey} m0 -1 a1 1 0 0 1 1 1 a2 2 0 0 1 -2 2 a3 3 0 0 1 -3 -3 a4 4 0 0 1 4 -4 a5 5 0 0 1 5 5 a6 6 0 0 1 -6 6`}
          stroke={INK}
          strokeWidth="1.8"
          fill="none"
          strokeLinecap="round"
        />
      ) : mood === 'surprised' ? (
        <g clipPath={`url(#${clip})`}>
          <circle cx={ex + e.px} cy={ey + 1 + e.py} r="6" fill={INK} />
          <circle cx={ex + e.px - 2} cy={ey - 1 + e.py} r="1.6" fill="#fff" />
        </g>
      ) : (
        <g clipPath={`url(#${clip})`} className="m-pupil">
          <ellipse cx={ex + e.px} cy={ey + 2 + e.py} rx="4.3" ry="5.6" fill={INK} />
          <circle cx={ex + e.px - 1.6} cy={ey + e.py} r="1.3" fill="#fff" />
        </g>
      )}
      <g clipPath={`url(#${clip})`}>
        <rect x={ex - r - 2} y={ey - r - 2} width={box} height={Math.max(0, lidH)} fill={skinFill} style={{ transition: 'height 110ms ease' }} />
        {lid > 0.04 && <path d={`M${ex - r - 2} ${edgeY} q${r + 2} ${e.edge} ${box} 0`} stroke={INK} strokeWidth="3.4" fill="none" />}
      </g>
    </g>
  );
}

export function Face({ mood, blink, ids, cx, cy, gap = 21, r = 10.5, skin, mouthDx = 2, mouthDy = 0, browDy = 0 }: FaceProps) {
  const e = EXPR[mood];
  const closing = blink && e.blink;
  const lidL = closing ? 1 : e.lidL;
  const lidR = closing ? 1 : e.lidR;
  const skinFill = skin === 'cream' ? 'var(--mascot-cream)' : `url(#${ids}-ht)`;
  const lx = cx - gap / 2;
  const rx = cx + gap / 2;
  const ly = cy + 0.5;
  const ry = cy - 0.5;
  const mx = cx + mouthDx;
  const my = cy + r + 9 + mouthDy;
  const browBase = cy - r - 9 + e.browY + browDy;
  const browStyle = { transition: 'transform 200ms ease' };

  return (
    <g className="m-face">
      <g className="m-brows">
        <rect
          x={lx - 6}
          y={browBase - 2 + e.browSkew}
          width="12"
          height="4.4"
          rx="2.2"
          fill={skinFill}
          stroke={INK}
          strokeWidth="2.6"
          transform={`rotate(${e.brow} ${lx} ${browBase + e.browSkew})`}
          style={browStyle}
        />
        <rect
          x={rx - 6}
          y={browBase - 2}
          width="12"
          height="4.4"
          rx="2.2"
          fill={skinFill}
          stroke={INK}
          strokeWidth="2.6"
          transform={`rotate(${-e.brow} ${rx} ${browBase})`}
          style={browStyle}
        />
      </g>
      <Eye ex={lx} ey={ly} r={r} lid={lidL} side="l" ids={ids} e={e} mood={mood} skinFill={skinFill} />
      <Eye ex={rx} ey={ry} r={r} lid={lidR} side="r" ids={ids} e={e} mood={mood} skinFill={skinFill} />
      {mood === 'cool' && (
        <g className="m-shades">
          <rect x={lx - r - 1} y={cy - 6} width={r * 2 + 2} height="13" rx="5" fill={INK} />
          <rect x={rx - r - 1} y={cy - 6} width={r * 2 + 2} height="13" rx="5" fill={INK} />
          <path d={`M${lx + r} ${cy} h${gap - r * 2}`} stroke={INK} strokeWidth="2.5" />
          <path d={`M${lx - r - 1} ${cy - 1} l-9 -4`} stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
          <path d={`M${lx - r + 3} ${cy - 2} h6`} stroke="#fff" strokeWidth="2" opacity="0.6" />
          <path d={`M${rx - r + 3} ${cy - 2} h6`} stroke="#fff" strokeWidth="2" opacity="0.6" />
        </g>
      )}
      {e.blush && (
        <g className="m-blush" fill="var(--mascot-coral)" opacity="0.72">
          <ellipse cx={lx - 10} cy={cy + r + 2} rx="5" ry="3" />
          <ellipse cx={rx + 10} cy={cy + r + 1} rx="5" ry="3" />
        </g>
      )}
      <Mouth kind={e.mouth} x={mx} y={my} />
    </g>
  );
}
