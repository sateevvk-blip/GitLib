import { useEffect, useId, useState } from 'react';
import type { Mood } from './moods';
import { EXPR, MOOD_LABELS } from './moods';
import { CHARACTERS, type CharacterId } from './characters';
import { useCharacter } from './choice';

interface Props {
  mood: Mood;
  size?: number;
  className?: string;
  /** Конкретный персонаж; без него — выбранный пользователем. */
  character?: CharacterId;
}

const INK = 'var(--mascot-ink)';

function useBlink(mood: Mood): boolean {
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    if (!EXPR[mood].blink) return;
    let alive = true;
    let t: ReturnType<typeof setTimeout>;
    const schedule = () => {
      t = setTimeout(
        () => {
          if (!alive) return;
          setBlink(true);
          setTimeout(() => {
            if (!alive) return;
            setBlink(false);
            schedule();
          }, 130);
        },
        2800 + Math.random() * 3500,
      );
    };
    schedule();
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [mood]);
  return blink;
}

/** Общий для всех персонажей реквизит вокруг головы: zzz, мысли, слёзы, искры, сердца, лупа, конфетти, звёздочки. */
function Props_({ mood }: { mood: Mood }) {
  switch (mood) {
    case 'sleep':
      return (
        <g className="m-zzz" fill={INK} fontFamily="'Fraunces Variable', serif" fontWeight="700">
          <text x="124" y="40" fontSize="16">z</text>
          <text x="134" y="26" fontSize="12">z</text>
          <text x="142" y="16" fontSize="9">z</text>
        </g>
      );
    case 'thinking':
      return (
        <g className="m-dots" fill={INK}>
          <circle cx="128" cy="30" r="3" />
          <circle cx="138" cy="22" r="4" />
          <circle cx="150" cy="12" r="5" />
        </g>
      );
    case 'sad':
      return <path className="m-drop" d="M124 56 q-5 8 0 12 q5 -4 0 -12 z" fill="var(--mascot-blue)" stroke={INK} strokeWidth="2" />;
    case 'happy':
    case 'surprised':
    case 'wave':
      return (
        <g className="m-sparks" stroke={INK} strokeWidth="2.5" strokeLinecap="round">
          <path d="M18 36 v10 M13 41 h10" />
          <path d="M146 50 v8 M142 54 h8" />
          <path d="M22 90 v6 M19 93 h6" />
        </g>
      );
    case 'love':
      return (
        <g className="m-hearts" fill="var(--mascot-coral)" stroke={INK} strokeWidth="1.5">
          <path d="M26 40 l-6 -6 a3.5 3.5 0 0 1 6 -4 a3.5 3.5 0 0 1 6 4 z" />
          <path d="M140 30 l-5 -5 a3 3 0 0 1 5 -3.5 a3 3 0 0 1 5 3.5 z" />
          <path d="M136 72 l-4 -4 a2.5 2.5 0 0 1 4 -3 a2.5 2.5 0 0 1 4 3 z" />
        </g>
      );
    case 'search':
      return (
        <g className="m-lens" stroke={INK} strokeWidth="3.5" fill="none">
          <circle cx="134" cy="40" r="12" fill="#fff" fillOpacity="0.35" />
          <path d="M143 49 l12 12" strokeLinecap="round" />
        </g>
      );
    case 'party':
      return (
        <g className="m-confetti" strokeWidth="2.5" strokeLinecap="round">
          <path d="M14 30 l6 -6" stroke="var(--mascot-blue)" />
          <path d="M30 14 l2 8" stroke="var(--mascot-coral)" />
          <path d="M140 18 l-6 6" stroke="var(--mascot-blue)" />
          <path d="M152 46 l-8 2" stroke="var(--mascot-coral)" />
          <circle cx="22" cy="60" r="3" fill="var(--mascot-coral)" />
          <circle cx="150" cy="80" r="3" fill="var(--mascot-blue)" />
          <rect x="128" y="34" width="6" height="6" fill="var(--mascot-blue)" transform="rotate(20 131 37)" />
          <rect x="40" y="12" width="5" height="5" fill="var(--mascot-coral)" transform="rotate(-15 42 14)" />
        </g>
      );
    case 'dizzy':
      return (
        <g className="m-stars" fill="var(--mascot-coral)" stroke={INK} strokeWidth="1.5" strokeLinejoin="round">
          <path d="M80 10 l3 6 l6 1 l-4.5 4 l1 6.5 l-5.5 -3 l-5.5 3 l1 -6.5 l-4.5 -4 l6 -1 z" />
          <path d="M34 34 l2 4 l4.5 0.5 l-3.5 3 l1 4.5 l-4 -2.2 l-4 2.2 l1 -4.5 l-3.5 -3 l4.5 -0.5 z" />
          <path d="M130 30 l2 4 l4.5 0.5 l-3.5 3 l1 4.5 l-4 -2.2 l-4 2.2 l1 -4.5 l-3.5 -3 l4.5 -0.5 z" />
        </g>
      );
    case 'laugh':
      return (
        <g className="m-ha" fill={INK} fontFamily="'Fraunces Variable', serif" fontWeight="700" fontStyle="italic">
          <text x="128" y="44" fontSize="13">ха</text>
          <text x="138" y="28" fontSize="11">ха</text>
        </g>
      );
    case 'grumpy':
      return (
        <g className="m-steam" stroke={INK} strokeWidth="2.5" fill="none" strokeLinecap="round">
          <path d="M134 44 q4 -6 0 -12 q-4 -6 0 -12" />
          <path d="M144 48 q4 -6 0 -12 q-4 -6 0 -12" />
        </g>
      );
    case 'shy':
      return <path className="m-sweat" d="M130 50 q-4 7 0 10 q4 -3 0 -10 z" fill="#fff" stroke={INK} strokeWidth="2" />;
    default:
      return null;
  }
}

export function Mascot({ mood, size = 120, className, character }: Props) {
  const chosen = useCharacter();
  const id = character ?? chosen;
  const ch = CHARACTERS[id];
  const ids = `m${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const blink = useBlink(mood);

  return (
    <svg
      className={`mascot ${className ?? ''}`}
      data-mood={mood}
      data-character={id}
      viewBox="0 0 160 190"
      width={size}
      height={(size * 190) / 160}
      role="img"
      aria-label={`${ch.name}: ${MOOD_LABELS[mood].toLowerCase()}`}
    >
      <defs>
        <pattern id={`${ids}-ht`} width="5" height="5" patternUnits="userSpaceOnUse">
          <rect width="5" height="5" fill="var(--mascot-blue)" />
          <circle cx="2.5" cy="2.5" r="1.15" fill="var(--mascot-blue-deep)" />
        </pattern>
      </defs>
      <ch.Component mood={mood} blink={blink} ids={ids} />
      <Props_ mood={mood} />
    </svg>
  );
}
