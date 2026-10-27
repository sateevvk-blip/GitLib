import { Face } from '../Face';
import { CREAM, INK, Limb, Shadow, Shoe, halftone, type CharacterProps } from '../parts';

/** Мишка: круглая голова, кепка набекрень и хитрая улыбка; сидит на корточках. */
export function Bear({ mood, blink, ids }: CharacterProps) {
  const ht = halftone(ids);
  return (
    <>
      <Shadow cx={82} rx={48} />
      {/* ноги: согнуты в коленях, ботинки в стороны */}
      <g className="m-legs">
        <Limb d="M70 142 q-26 0 -30 22" w={7} />
        <Limb d="M100 142 q24 0 28 22" w={7} />
      </g>
      <Shoe x={26} y={162} w={36} flip />
      <Shoe x={102} y={162} w={34} />

      <g className="m-body">
        {/* туловище */}
        <path d="M58 150 q-2 -30 24 -30 h22 q24 0 22 30 z" fill={CREAM} stroke={INK} strokeWidth="4" strokeLinejoin="round" />
        {/* руки лежат на коленях */}
        <g className="m-arm m-arm-l">
          <Limb d="M64 128 q-22 8 -20 30" w={5} />
          <circle cx="44" cy="158" r="6.5" fill={CREAM} stroke={INK} strokeWidth="3.5" />
        </g>
        <g className="m-arm m-arm-r">
          <Limb d="M104 128 q22 8 20 30" w={5} />
          <circle cx="124" cy="158" r="6.5" fill={CREAM} stroke={INK} strokeWidth="3.5" />
        </g>

        {/* ухо слева и синее ухо справа */}
        <circle cx="46" cy="62" r="10" fill={CREAM} stroke={INK} strokeWidth="4" />
        <path className="m-ear-blue" d="M120 92 q14 -4 16 10 q2 14 -14 14 q-6 0 -8 -4 z" fill={ht} stroke={INK} strokeWidth="4" strokeLinejoin="round" />
        {/* голова */}
        <circle cx="82" cy="88" r="42" fill={CREAM} stroke={INK} strokeWidth="4" />
        <Face mood={mood} blink={blink} ids={ids} cx={78} cy={86} gap={20} r={10} skin="cream" mouthDx={2} mouthDy={4} browDy={-2} />

        {/* кепка */}
        <g className="m-cap" style={{ transformOrigin: '84px 52px' }}>
          <path d="M50 52 q6 -22 34 -22 q30 0 36 22 z" fill="#fff" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
          <path d="M104 40 q10 2 14 12 l-12 2 q0 -8 -2 -14 z" fill={ht} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
          <path d="M34 56 q22 -10 52 -6 q-4 6 -8 8 q-24 2 -44 -2 z" fill="#fff" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
          <circle cx="84" cy="31" r="3" fill={INK} />
        </g>
      </g>
    </>
  );
}
