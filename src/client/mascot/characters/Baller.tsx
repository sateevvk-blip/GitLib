import { Face } from '../Face';
import { CREAM, INK, Shadow, Sneaker, halftone, type CharacterProps } from '../parts';

/** Баскет: клиновидная голова, кроссовки и мяч, который он крутит на пальце. */
export function Baller({ mood, blink, ids }: CharacterProps) {
  const ht = halftone(ids);
  const ballDown = mood === 'sleep' || mood === 'sad';
  return (
    <>
      <Shadow cx={84} rx={44} />
      <g className="m-legs" stroke={INK} strokeWidth="4.5" fill="none" strokeLinecap="round">
        <path d="M80 136 v26" />
        <path d="M104 136 v26" />
      </g>
      <Sneaker x={58} y={160} ids={ids} />
      <Sneaker x={94} y={160} ids={ids} />

      {/* правая рука — кулак */}
      <g className="m-arm m-arm-r" stroke={INK} strokeWidth="4" strokeLinecap="round" fill="none">
        <path d="M122 104 q20 -2 16 22" />
        <path d="M130 122 q6 -4 12 0 q4 4 0 8 q-6 4 -12 0 q-4 -4 0 -8 z" fill={CREAM} strokeLinejoin="round" />
      </g>

      <g className="m-body">
        <path
          d="M64 48 C68 26 118 22 126 48 C132 66 130 98 122 122 C120 132 108 136 98 134 L30 114 C22 112 22 104 30 100 Z"
          fill={CREAM}
          stroke={INK}
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <path d="M44 104 l40 -6" stroke={INK} strokeWidth="2" opacity="0.3" strokeLinecap="round" />
        {/* клюв-нос */}
        <path d="M124 86 l18 -5 l-18 -5 z" fill={CREAM} stroke={INK} strokeWidth="3.4" strokeLinejoin="round" />

        {/* левая рука, палец вверх */}
        <g className="m-arm m-arm-l" stroke={INK} strokeWidth="4" strokeLinecap="round" fill="none">
          <path d="M70 70 q-18 -10 -14 -30" />
          <path d="M50 44 q-6 -4 -2 -10 l4 -14 q1 -4 4 -3 q3 1 2 5 l-2 10 q6 -2 8 4 q2 6 -4 10 z" fill={CREAM} strokeLinejoin="round" />
        </g>

        <Face mood={mood} blink={blink} ids={ids} cx={104} cy={62} gap={22} r={11.5} skin="cream" mouthDx={-2} mouthDy={10} browDy={-4} />
      </g>

      {/* мяч */}
      <g className={`m-ball ${ballDown ? 'is-down' : ''}`} style={{ transformOrigin: '52px 20px' }}>
        <circle cx="52" cy="20" r="15" fill={ht} stroke={INK} strokeWidth="3.6" />
        <path d="M37 20 h30 M52 5 v30 M41 9 q11 11 0 22 M63 9 q-11 11 0 22" stroke={INK} strokeWidth="2.4" fill="none" />
      </g>
    </>
  );
}
