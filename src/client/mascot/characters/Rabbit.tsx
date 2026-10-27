import { Face } from '../Face';
import { CREAM, INK, Shadow, halftone, type CharacterProps } from '../parts';

/** Кролик: синий, ушастый, со знаком «peace». */
export function Rabbit({ mood, blink, ids }: CharacterProps) {
  const ht = halftone(ids);
  return (
    <>
      <Shadow cx={84} rx={46} />

      {/* правая рука — peace */}
      <g className="m-arm m-arm-r" stroke={INK} strokeWidth="4" strokeLinecap="round" fill="none">
        <path d="M112 128 q26 -10 24 -40" />
        <g className="m-peace" style={{ transformOrigin: '136px 86px' }}>
          <path d="M128 92 q-4 -8 4 -10 l2 -16 q1 -4 4 -3 q3 1 2 5 l-1 10 l6 -14 q2 -4 5 -2 q3 2 1 6 l-6 14 q6 2 4 8 q-2 6 -10 6 q-8 0 -11 -4 z" fill={ht} strokeLinejoin="round" />
        </g>
      </g>

      <g className="m-body">
        {/* ноги, сидя */}
        <path d="M52 170 h26 l4 -22 h-18 q-14 0 -12 22 z" fill={ht} stroke={INK} strokeWidth="4" strokeLinejoin="round" />
        <path d="M98 148 q20 2 26 14 q4 8 -4 10 h-28 z" fill={ht} stroke={INK} strokeWidth="4" strokeLinejoin="round" />
        {/* туловище */}
        <path d="M62 150 q-2 -30 22 -34 h14 q20 2 22 32 z" fill={ht} stroke={INK} strokeWidth="4" strokeLinejoin="round" />

        {/* левая рука — кулак вперёд */}
        <g className="m-arm m-arm-l" stroke={INK} strokeWidth="4" strokeLinecap="round" fill="none">
          <path d="M66 126 q-20 6 -30 6" />
          <path d="M28 126 q-8 0 -8 7 q0 7 8 7 q8 0 10 -4 q2 -6 -4 -9 q-3 -1 -6 -1 z" fill={ht} strokeLinejoin="round" />
        </g>

        {/* уши */}
        <g className="m-ears" style={{ transformOrigin: '82px 76px' }}>
          <path className="m-ear m-ear-l" d="M64 76 q-10 -40 2 -66 q6 -8 12 2 q8 30 2 62 z" fill={ht} stroke={INK} strokeWidth="4" strokeLinejoin="round" />
          <path d="M70 60 q-2 -22 4 -40" stroke={CREAM} strokeWidth="5" strokeLinecap="round" fill="none" />
          <path className="m-ear m-ear-r" d="M88 76 q0 -40 14 -66 q6 -8 12 2 q4 30 -8 64 z" fill={ht} stroke={INK} strokeWidth="4" strokeLinejoin="round" />
        </g>

        {/* голова */}
        <path d="M54 94 q0 -24 28 -24 q30 0 30 26 q0 24 -30 24 q-28 0 -28 -26 z" fill={ht} stroke={INK} strokeWidth="4" />
        <g className="m-whiskers" stroke={INK} strokeWidth="2.6" strokeLinecap="round" style={{ transformOrigin: '52px 100px' }}>
          <path d="M50 94 l-22 -4" />
          <path d="M50 100 l-24 0" />
          <path d="M50 106 l-22 4" />
        </g>
        <Face mood={mood} blink={blink} ids={ids} cx={84} cy={94} gap={20} r={10} skin="blue" mouthDx={-6} mouthDy={-1} />
      </g>
    </>
  );
}
