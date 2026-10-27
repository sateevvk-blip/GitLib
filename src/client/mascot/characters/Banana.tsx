import { Face } from '../Face';
import { CREAM, INK, Limb, Shadow, Shoe, halftone, type CharacterProps } from '../parts';

/** Банан: невозмутимый, с «расстёгнутой» синей кожурой вместо рук. */
export function Banana({ mood, blink, ids }: CharacterProps) {
  const ht = halftone(ids);
  return (
    <>
      <Shadow cx={82} rx={42} />
      <g className="m-legs">
        <Limb d="M74 148 q-14 6 -14 18" />
        <Limb d="M92 148 q10 6 12 16" />
      </g>
      <Shoe className="m-shoe m-shoe-l" x={42} y={162} w={30} flip />
      <Shoe className="m-shoe m-shoe-r" x={92} y={162} w={30} />

      <g className="m-body">
        <path
          d="M60 62 C60 28 70 12 83 12 C98 12 108 30 108 64 L108 122 C108 144 98 154 84 154 C70 154 60 144 60 122 Z"
          fill={CREAM}
          stroke={INK}
          strokeWidth="4"
        />
        <path d="M92 14 l5 -9" stroke={INK} strokeWidth="4" strokeLinecap="round" />
        <path d="M70 30 q4 -10 10 -12" stroke={INK} strokeWidth="2" strokeLinecap="round" opacity="0.35" />

        <g className="m-peel m-peel-l" style={{ transformOrigin: '66px 74px' }}>
          <path
            d="M66 74 C48 66 20 76 20 102 C20 124 40 136 48 130 C54 126 42 118 44 102 C46 88 58 82 68 92 Z"
            fill={ht}
            stroke={INK}
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <path d="M66 74 C56 84 56 104 64 112" stroke={INK} strokeWidth="2.5" fill="none" opacity="0.55" />
        </g>
        <g className="m-peel m-peel-r" style={{ transformOrigin: '102px 78px' }}>
          <path
            d="M100 78 C118 72 140 90 134 114 C130 134 114 150 108 152 C102 150 98 140 102 130 C110 112 100 100 98 92 Z"
            fill={ht}
            stroke={INK}
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <path d="M104 86 C114 94 118 112 112 128" stroke={INK} strokeWidth="2.5" fill="none" opacity="0.55" />
        </g>

        <Face mood={mood} blink={blink} ids={ids} cx={84} cy={50} gap={21} r={10.5} skin="cream" mouthDx={4} mouthDy={-2} />
      </g>
    </>
  );
}
