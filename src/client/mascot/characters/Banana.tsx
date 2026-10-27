import { Face } from '../Face';
import { CREAM, Hand, INK, Limb, Shadow, Shoe, halftone, type CharacterProps } from '../parts';

/** Банан: невозмутимый; две синие ленты кожуры свисают спереди крест-накрест, как сложенные руки. */
export function Banana({ mood, blink, ids }: CharacterProps) {
  const ht = halftone(ids);
  return (
    <>
      <Shadow cx={82} rx={42} />
      <g className="m-legs">
        <Limb d="M74 150 v14" />
        <Limb d="M92 150 v14" />
      </g>
      <Shoe className="m-shoe m-shoe-l" x={46} y={164} w={32} flip />
      <Shoe className="m-shoe m-shoe-r" x={88} y={164} w={32} />

      <g className="m-body">
        {/* левая рука — машет из-за кожуры */}
        <g className="m-arm m-arm-l m-wave" style={{ transformOrigin: '64px 82px' }}>
          <Limb d="M64 82 q-26 0 -30 -28" w={5} />
          <Hand x={32} y={50} rot={-25} />
        </g>

        {/* тело банана */}
        <path
          d="M62 60 C62 26 70 10 83 10 C98 10 108 28 108 62 L108 124 C108 146 98 156 84 156 C70 156 62 146 62 124 Z"
          fill={CREAM}
          stroke={INK}
          strokeWidth="4"
        />
        <path d="M88 12 l4 -9" stroke={INK} strokeWidth="4" strokeLinecap="round" />
        <path d="M70 30 q4 -10 10 -12" stroke={INK} strokeWidth="2" strokeLinecap="round" opacity="0.35" />

        {/* кожура: левая лента выходит слева и ложится направо */}
        <g className="m-peel m-peel-l" style={{ transformOrigin: '66px 74px' }}>
          <path
            d="M66 72 C40 70 22 84 24 104 C26 118 44 128 66 128 L92 130 C100 130 102 118 94 116 L68 114 C50 112 42 104 46 96 C50 88 60 88 70 92 Z"
            fill={ht}
            stroke={INK}
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <path d="M44 100 C54 108 70 114 90 120" stroke={INK} strokeWidth="2.4" fill="none" opacity="0.5" />
        </g>
        {/* кожура: правая лента выходит справа и ложится налево, поверх левой */}
        <g className="m-peel m-peel-r" style={{ transformOrigin: '100px 80px' }}>
          <path
            d="M100 80 C128 78 142 96 138 116 C134 132 114 140 94 138 L72 140 C64 140 62 128 70 126 L96 124 C114 122 122 112 118 104 C114 96 104 96 96 100 Z"
            fill={ht}
            stroke={INK}
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <path d="M122 108 C112 118 96 126 74 132" stroke={INK} strokeWidth="2.4" fill="none" opacity="0.5" />
        </g>

        <Face mood={mood} blink={blink} ids={ids} cx={84} cy={48} gap={21} r={10.5} skin="cream" mouthDx={4} mouthDy={-2} />
      </g>
    </>
  );
}
