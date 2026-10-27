import { Face } from '../Face';
import { CREAM, Fist, Hand, INK, Limb, Paw, Shadow, halftone, type CharacterProps } from '../parts';

/** Кот: синий, с высокими ушами, усами и светлой грудкой; стоит, одна лапа в бок, другой машет. */
export function Cat({ mood, blink, ids }: CharacterProps) {
  const ht = halftone(ids);
  return (
    <>
      <Shadow cx={82} rx={42} />
      <g className="m-legs">
        <Limb d="M70 146 v20" w={8} color={ht} />
        <Limb d="M94 146 v20" w={8} color={ht} />
      </g>
      <Paw x={44} y={166} ids={ids} flip />
      <Paw x={86} y={166} ids={ids} />

      <g className="m-body">
        {/* туловище */}
        <path d="M58 150 q-4 -32 24 -34 h6 q28 2 24 34 z" fill={ht} stroke={INK} strokeWidth="4" strokeLinejoin="round" />
        {/* светлая грудка */}
        <path d="M74 121 l8 14 l8 -14 z" fill={CREAM} />

        {/* левая лапа — в бок */}
        <g className="m-arm m-arm-l">
          <Limb d="M60 128 q-20 8 -14 24" w={5} color={ht} />
          <Fist x={46} y={152} fill={ht} />
        </g>
        {/* правая лапа — машет */}
        <g className="m-arm m-arm-r m-wave" style={{ transformOrigin: '108px 128px' }}>
          <Limb d="M108 128 q28 -4 26 -34" w={5} color={ht} />
          <Hand x={136} y={90} rot={20} fill={ht} />
        </g>

        {/* уши */}
        <g className="m-ears" style={{ transformOrigin: '82px 76px' }}>
          <path className="m-ear m-ear-l" d="M58 80 q-8 -44 6 -70 q4 -8 10 0 q10 30 6 70 z" fill={ht} stroke={INK} strokeWidth="4" strokeLinejoin="round" />
          <path d="M65 64 q-1 -24 5 -42 l3 7" stroke={CREAM} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path className="m-ear m-ear-r" d="M90 80 q-2 -44 12 -70 q6 -8 10 0 q6 30 -2 70 z" fill={ht} stroke={INK} strokeWidth="4" strokeLinejoin="round" />
          <path d="M99 64 q-1 -24 7 -42 l3 7" stroke={CREAM} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>

        {/* голова */}
        <path d="M48 102 q0 -34 34 -34 q34 0 34 34 q0 24 -34 24 q-34 0 -34 -24 z" fill={ht} stroke={INK} strokeWidth="4" />
        <g className="m-whiskers" stroke={INK} strokeWidth="2.6" strokeLinecap="round" style={{ transformOrigin: '82px 104px' }}>
          <path d="M46 98 l-22 -5" />
          <path d="M46 104 l-24 0" />
          <path d="M46 110 l-22 5" />
          <path d="M118 98 l22 -5" />
          <path d="M118 104 l24 0" />
          <path d="M118 110 l22 5" />
        </g>
        {/* нос */}
        <path d="M78 108 h8 l-4 4 z" fill={INK} />
        <Face mood={mood} blink={blink} ids={ids} cx={82} cy={94} gap={20} r={10} skin="blue" mouthDx={0} mouthDy={4} />
      </g>
    </>
  );
}
