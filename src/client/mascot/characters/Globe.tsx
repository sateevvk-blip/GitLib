import { Face } from '../Face';
import { CREAM, INK, Limb, Shadow, Shoe, halftone, type CharacterProps } from '../parts';

/** Глобус: голова-глобус с меридианами, цветок в руке и палец вверх. */
export function Globe({ mood, blink, ids }: CharacterProps) {
  const ht = halftone(ids);
  const clip = `${ids}-globe`;
  return (
    <>
      <Shadow cx={80} rx={44} />
      <g className="m-legs">
        <Limb d="M70 108 q-4 26 -2 54" />
        <Limb d="M92 108 q4 26 2 54" />
      </g>
      <Shoe x={42} y={162} w={32} flip />
      <Shoe x={90} y={162} w={32} />

      {/* левая рука с цветком */}
      <g className="m-arm m-arm-l" stroke={INK} strokeWidth="4" strokeLinecap="round" fill="none">
        <path d="M44 92 q-24 14 -14 42" />
        <circle cx="30" cy="136" r="7" fill={CREAM} />
        <g className="m-flower" style={{ transformOrigin: '32px 140px' }}>
          <path d="M32 140 q4 10 10 16" strokeWidth="2.6" />
          <g fill={ht} stroke={INK} strokeWidth="1.8">
            <circle cx="44" cy="152" r="3.2" />
            <circle cx="40" cy="158" r="3.2" />
            <circle cx="48" cy="158" r="3.2" />
            <circle cx="44" cy="163" r="3.2" />
          </g>
          <circle cx="44" cy="158" r="2" fill={CREAM} />
        </g>
      </g>

      {/* правая рука, палец вверх */}
      <g className="m-arm m-arm-r" stroke={INK} strokeWidth="4" strokeLinecap="round" fill="none">
        <path d="M116 92 q24 -4 20 -36" />
        <path d="M130 60 q-4 -6 2 -10 l2 -16 q1 -4 4 -3 q3 1 2 5 l-1 12 q6 0 8 6 q2 6 -4 10 q-6 2 -13 -4 z" fill={CREAM} strokeLinejoin="round" />
      </g>

      <g className="m-body">
        <clipPath id={clip}>
          <circle cx="80" cy="68" r="44" />
        </clipPath>
        <circle cx="80" cy="68" r="44" fill={CREAM} stroke={INK} strokeWidth="4" />
        <g className="m-globe-lines" clipPath={`url(#${clip})`} stroke={INK} strokeWidth="2.2" fill="none" opacity="0.85">
          <ellipse cx="80" cy="68" rx="14" ry="44" />
          <ellipse cx="80" cy="68" rx="30" ry="44" />
          <ellipse cx="80" cy="68" rx="46" ry="44" />
          <ellipse cx="80" cy="68" rx="62" ry="44" />
          <path d="M20 46 q60 -12 120 0 M20 90 q60 12 120 0 M30 68 h100" />
        </g>
        <path d="M78 110 q2 6 10 4" stroke={INK} strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.5" />
        <Face mood={mood} blink={blink} ids={ids} cx={96} cy={72} gap={20} r={10} skin="cream" mouthDx={4} mouthDy={2} />
      </g>
    </>
  );
}
