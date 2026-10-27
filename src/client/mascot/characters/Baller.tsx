import { Face } from '../Face';
import { CREAM, Fist, Hand, INK, Limb, Shadow, Sneaker, halftone, type CharacterProps } from '../parts';

/** Баскет: высокое тело-колышек с крылом сзади и клювом, круглые глаза, мяч под мышкой, кроссовки. */
export function Baller({ mood, blink, ids }: CharacterProps) {
  const ht = halftone(ids);
  const ballDown = mood === 'sleep' || mood === 'sad';
  return (
    <>
      <Shadow cx={88} rx={46} />
      <g className="m-legs" stroke={INK} strokeWidth="4.5" fill="none" strokeLinecap="round">
        <path d="M72 144 v20" />
        <path d="M104 144 v20" />
      </g>
      <Sneaker x={54} y={162} ids={ids} />
      <Sneaker x={92} y={162} ids={ids} />

      <g className="m-body">
        {/* левая рука — машет */}
        <g className="m-arm m-arm-l m-wave" style={{ transformOrigin: '64px 64px' }}>
          <Limb d="M64 64 q-24 -6 -20 -34" w={5} />
          <Hand x={42} y={26} rot={-25} />
        </g>

        {/* тело */}
        <path
          d="M62 44 C62 18 76 8 90 8 C108 8 118 20 118 46 L114 130 C114 140 106 144 96 144 L76 144 C66 144 62 138 62 128 Z"
          fill={CREAM}
          stroke={INK}
          strokeWidth="4"
          strokeLinejoin="round"
        />
        {/* крыло сзади (незамкнутый контур: заливка прячет обводку тела) */}
        <path d="M66 90 L18 84 L30 102 L22 120 L66 114" fill={CREAM} stroke={INK} strokeWidth="4" strokeLinejoin="round" />
        {/* клюв */}
        <path d="M114 70 l28 -5 l-28 -7" fill={CREAM} stroke={INK} strokeWidth="3.4" strokeLinejoin="round" />

        <Face mood={mood} blink={blink} ids={ids} cx={92} cy={44} gap={22} r={11.5} skin="cream" lidScale={0.45} mouthDx={-4} mouthDy={16} browDy={-16} />
      </g>

      {/* мяч под мышкой */}
      <g className={`m-ball ${ballDown ? 'is-down' : ''}`} style={{ transformOrigin: '130px 114px' }}>
        <circle cx="130" cy="114" r="17" fill={ht} stroke={INK} strokeWidth="3.6" />
        <path d="M113 114 h34 M130 97 v34 M118 102 q12 12 0 24 M142 102 q-12 12 0 24" stroke={INK} strokeWidth="2.4" fill="none" />
      </g>
      {/* правая рука лежит на мяче */}
      <g className="m-arm m-arm-r">
        <Limb d="M112 82 q22 2 20 16" w={5} />
        <Fist x={132} y={100} />
      </g>
    </>
  );
}
