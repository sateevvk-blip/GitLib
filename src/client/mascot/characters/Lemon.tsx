import { Face } from '../Face';
import { CREAM, Fist, Hand, INK, Limb, Shadow, Shoe, halftone, type CharacterProps } from '../parts';

/** Лимон: большая круглая голова-лимон с бугорком слева и синим носиком справа, кепка набекрень; стоит, машет рукой. */
export function Lemon({ mood, blink, ids }: CharacterProps) {
  const ht = halftone(ids);
  return (
    <>
      <Shadow cx={82} rx={44} />
      <g className="m-legs">
        <Limb d="M72 146 v20" w={6} />
        <Limb d="M94 146 v20" w={6} />
      </g>
      <Shoe x={44} y={164} w={32} flip />
      <Shoe x={88} y={164} w={32} />

      <g className="m-body">
        {/* туловище */}
        <path d="M60 150 q-2 -28 22 -30 h20 q24 2 22 30 z" fill={CREAM} stroke={INK} strokeWidth="4" strokeLinejoin="round" />
        {/* правая рука — в бок */}
        <g className="m-arm m-arm-r">
          <Limb d="M104 126 q24 6 18 26" w={5} />
          <Fist x={120} y={150} />
        </g>
        {/* левая рука — машет */}
        <g className="m-arm m-arm-l m-wave" style={{ transformOrigin: '60px 126px' }}>
          <Limb d="M60 126 q-26 -2 -30 -30" w={5} />
          <Hand x={28} y={88} rot={-25} />
        </g>

        {/* голова-лимон */}
        <circle cx="82" cy="86" r="44" fill={CREAM} stroke={INK} strokeWidth="4" />
        {/* бугорок лимона слева (незамкнутый контур: заливка прячет обводку головы) */}
        <path d="M46 74 q-16 -2 -13 -16 q5 -12 21 0" fill={CREAM} stroke={INK} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
        {/* синий носик лимона справа внизу */}
        <path className="m-ear-blue" d="M114 108 q16 -8 22 6 q4 14 -12 16 q-10 1 -12 -6 z" fill={ht} stroke={INK} strokeWidth="4" strokeLinejoin="round" />
        <path d="M122 112 q8 -2 10 6" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.85" />

        <Face mood={mood} blink={blink} ids={ids} cx={80} cy={88} gap={20} r={10} skin="cream" mouthDx={2} mouthDy={4} browDy={-2} />

        {/* кепка */}
        <g className="m-cap" style={{ transformOrigin: '88px 50px' }}>
          <path d="M50 54 q8 -28 40 -28 q34 0 38 26 z" fill="#fff" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
          <path d="M50 54 q38 -6 78 -2" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M116 46 q16 -4 22 10 l-12 6 q-2 -10 -10 -16 z" fill={ht} stroke={INK} strokeWidth="3.2" strokeLinejoin="round" />
          <circle cx="90" cy="26" r="3" fill={INK} />
        </g>
      </g>
    </>
  );
}
