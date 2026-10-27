import { Face } from '../Face';
import { INK, Limb, Shadow, Shoe, halftone, type CharacterProps } from '../parts';

/** Карась: серьёзная синяя рыба на двух ногах. */
export function Fish({ mood, blink, ids }: CharacterProps) {
  const ht = halftone(ids);
  const bubbles = mood === 'thinking' || mood === 'search';
  return (
    <>
      <Shadow cx={84} rx={46} />
      <g className="m-legs">
        <Limb d="M76 116 q-8 24 -12 46" />
        <Limb d="M96 116 q6 24 10 46" />
      </g>
      <Shoe x={42} y={162} w={32} flip />
      <Shoe x={96} y={162} w={32} />

      <g className="m-body">
        {/* хвост */}
        <g className="m-tail" style={{ transformOrigin: '52px 86px' }}>
          <path d="M52 86 l-26 -22 q-6 -4 -4 2 l8 18 l-8 20 q-2 6 4 2 z" fill={ht} stroke={INK} strokeWidth="4" strokeLinejoin="round" />
        </g>
        {/* спинной плавник */}
        <path className="m-fin" d="M64 56 l6 -16 l6 10 l6 -12 l6 12 l6 -8 l2 14 z" fill={ht} stroke={INK} strokeWidth="3.6" strokeLinejoin="round" />
        {/* тело */}
        <path d="M44 88 q0 -36 40 -36 q44 0 44 36 q0 34 -44 34 q-40 0 -40 -34 z" fill={ht} stroke={INK} strokeWidth="4" />
        {/* жабры и грудной плавник */}
        <path d="M66 74 q-8 14 0 28" stroke={INK} strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <path d="M60 104 l-12 8 l14 2 z" fill={ht} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        <Face mood={mood} blink={blink} ids={ids} cx={102} cy={82} gap={20} r={10} skin="blue" mouthDx={10} mouthDy={2} browDy={-2} />
      </g>

      {bubbles && (
        <g className="m-bubbles" stroke={INK} strokeWidth="2" fill="none">
          <circle cx="134" cy="70" r="3" />
          <circle cx="142" cy="58" r="4.5" />
          <circle cx="138" cy="42" r="6" />
        </g>
      )}
    </>
  );
}
