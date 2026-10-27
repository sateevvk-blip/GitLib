import { useEffect, useState } from 'react';
import type { Mood } from './store';

interface Props {
  mood: Mood;
  size?: number;
  className?: string;
}

/** Веко: доля закрытого глаза (0 — открыт, 1 — закрыт). */
const LID: Record<Mood, number> = {
  idle: 0.42,
  thinking: 0.3,
  happy: 0.15,
  sad: 0.5,
  search: 0.25,
  sleep: 1,
  love: 0.2,
  surprised: 0,
};

/** Угол бровей: положительный — «сердитый/скучающий» наклон к центру. */
const BROW: Record<Mood, number> = {
  idle: 6,
  thinking: -10,
  happy: -8,
  sad: 14,
  search: 2,
  sleep: 4,
  love: -6,
  surprised: -14,
};

const MOUTH: Record<Mood, string> = {
  idle: 'M70 102 q10 3 20 0',
  thinking: 'M74 103 q4 -4 10 0',
  happy: 'M66 99 q14 14 28 0',
  sad: 'M68 106 q12 -9 24 0',
  search: 'M72 102 q8 3 16 0',
  sleep: 'M74 103 q6 3 12 0',
  love: 'M68 99 q12 12 24 0',
  surprised: 'M80 104 m-6 0 a6 7 0 1 0 12 0 a6 7 0 1 0 -12 0',
};

const PUPIL_DX: Record<Mood, number> = { idle: 0, thinking: 4, happy: 0, sad: -2, search: 3, sleep: 0, love: 0, surprised: 0 };
const PUPIL_DY: Record<Mood, number> = { idle: 1, thinking: -4, happy: 0, sad: 2, search: -1, sleep: 0, love: 0, surprised: -1 };

export function Mascot({ mood, size = 120, className }: Props) {
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    if (mood === 'sleep') return;
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

  const lid = blink ? 1 : LID[mood];
  const eyeH = 26;
  const lidH = Math.round(eyeH * lid);
  const brow = BROW[mood];
  const dx = PUPIL_DX[mood];
  const dy = PUPIL_DY[mood];

  return (
    <svg
      className={`mascot ${className ?? ''}`}
      data-mood={mood}
      viewBox="0 0 160 190"
      width={size}
      height={(size * 190) / 160}
      role="img"
      aria-label={`Маскот Том: ${mood}`}
    >
      <defs>
        <pattern id="m-halftone" width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="1.5" fill="var(--mascot-blue-deep)" />
        </pattern>
        <clipPath id="m-eye-l">
          <ellipse cx="68" cy="78" rx="12" ry="13" />
        </clipPath>
        <clipPath id="m-eye-r">
          <ellipse cx="94" cy="78" rx="12" ry="13" />
        </clipPath>
      </defs>

      {/* тень */}
      <ellipse className="m-shadow" cx="80" cy="180" rx="38" ry="5" fill="var(--mascot-ink)" opacity="0.12" />

      {/* ноги */}
      <g className="m-legs" stroke="var(--mascot-ink)" strokeWidth="4" strokeLinecap="round" fill="none">
        <path d="M64 146 v18" />
        <path d="M96 146 v18" />
      </g>
      <g className="m-shoes">
        <path d="M48 166 q0 -8 10 -8 h10 q6 0 6 8 v6 h-26 z" fill="var(--mascot-blue)" stroke="var(--mascot-ink)" strokeWidth="4" strokeLinejoin="round" />
        <path d="M86 166 q0 -8 10 -8 h10 q6 0 6 8 v6 h-26 z" fill="var(--mascot-blue)" stroke="var(--mascot-ink)" strokeWidth="4" strokeLinejoin="round" />
        <path d="M48 172 h26 M86 172 h26" stroke="var(--mascot-cream)" strokeWidth="3" />
      </g>

      {/* руки за телом */}
      <g className="m-arm m-arm-l" stroke="var(--mascot-ink)" strokeWidth="4" strokeLinecap="round" fill="none">
        <path className="m-arm-path" d="M40 110 q-16 10 -10 34" />
        <circle className="m-hand" cx="30" cy="146" r="7" fill="var(--mascot-cream)" />
      </g>
      <g className="m-arm m-arm-r" stroke="var(--mascot-ink)" strokeWidth="4" strokeLinecap="round" fill="none">
        <path className="m-arm-path" d="M120 110 q16 10 10 34" />
        <circle className="m-hand" cx="130" cy="146" r="7" fill="var(--mascot-cream)" />
      </g>

      {/* тело — том книги */}
      <g className="m-body">
        <rect x="34" y="34" width="92" height="114" rx="12" fill="var(--mascot-cream)" stroke="var(--mascot-ink)" strokeWidth="4" />
        {/* корешок с растром */}
        <path d="M34 46 q0 -12 12 -12 h8 v114 h-8 q-12 0 -12 -12 z" fill="var(--mascot-blue)" stroke="var(--mascot-ink)" strokeWidth="4" strokeLinejoin="round" />
        <path d="M38 48 q0 -8 8 -8 h4 v104 h-4 q-8 0 -8 -8 z" fill="url(#m-halftone)" opacity="0.55" />
        {/* страницы снизу */}
        <path d="M58 142 h62 M58 146 h62" stroke="var(--mascot-ink)" strokeWidth="2" opacity="0.35" />
        {/* закладка */}
        <path className="m-bookmark" d="M104 34 v20 l5 -4 l5 4 v-20 z" fill="var(--mascot-blue)" stroke="var(--mascot-ink)" strokeWidth="3" strokeLinejoin="round" />

        {/* брови */}
        <g stroke="var(--mascot-ink)" strokeWidth="4" strokeLinecap="round">
          <line x1="57" y1="58" x2="79" y2="58" transform={`rotate(${brow} 68 58)`} />
          <line x1="83" y1="58" x2="105" y2="58" transform={`rotate(${-brow} 94 58)`} />
        </g>

        {/* глаза */}
        <ellipse cx="68" cy="78" rx="12" ry="13" fill="#fff" stroke="var(--mascot-ink)" strokeWidth="3.5" />
        <ellipse cx="94" cy="78" rx="12" ry="13" fill="#fff" stroke="var(--mascot-ink)" strokeWidth="3.5" />
        {mood === 'love' ? (
          <g fill="var(--mascot-coral)" stroke="var(--mascot-ink)" strokeWidth="1.5">
            <path d="M68 85 l-7 -7 a4 4 0 0 1 7 -5 a4 4 0 0 1 7 5 z" />
            <path d="M94 85 l-7 -7 a4 4 0 0 1 7 -5 a4 4 0 0 1 7 5 z" />
          </g>
        ) : (
          <g className="m-pupils" fill="var(--mascot-ink)">
            <circle cx={68 + dx} cy={80 + dy} r={mood === 'surprised' ? 5.5 : 4.2} />
            <circle cx={94 + dx} cy={80 + dy} r={mood === 'surprised' ? 5.5 : 4.2} />
            <circle cx={66 + dx} cy={78 + dy} r="1.3" fill="#fff" />
            <circle cx={92 + dx} cy={78 + dy} r="1.3" fill="#fff" />
          </g>
        )}
        {/* веки */}
        <g className="m-lids" fill="var(--mascot-cream)">
          <rect x="54" y={65 - 2} width="28" height={lidH + 2} clipPath="url(#m-eye-l)" style={{ transition: 'height 120ms ease' }} />
          <rect x="80" y={65 - 2} width="28" height={lidH + 2} clipPath="url(#m-eye-r)" style={{ transition: 'height 120ms ease' }} />
        </g>
        {lid > 0.05 && (
          <g stroke="var(--mascot-ink)" strokeWidth="3" fill="none" strokeLinecap="round">
            <path d={`M56 ${65 + lidH} q12 ${lid > 0.9 ? 3 : 0} 24 0`} />
            <path d={`M82 ${65 + lidH} q12 ${lid > 0.9 ? 3 : 0} 24 0`} />
          </g>
        )}

        {/* рот */}
        <path d={MOUTH[mood]} stroke="var(--mascot-ink)" strokeWidth="3.5" fill={mood === 'surprised' ? 'var(--mascot-ink)' : 'none'} strokeLinecap="round" />
        {(mood === 'happy' || mood === 'love') && <path d="M70 101 q10 9 20 0 z" fill="var(--mascot-coral)" opacity="0.9" />}

        {/* румянец */}
        {(mood === 'happy' || mood === 'love') && (
          <g fill="var(--mascot-coral)" opacity="0.7">
            <ellipse cx="56" cy="96" rx="5" ry="3" />
            <ellipse cx="106" cy="96" rx="5" ry="3" />
          </g>
        )}
      </g>

      {/* реквизит */}
      {mood === 'sleep' && (
        <g className="m-zzz" fill="var(--mascot-ink)" fontFamily="'Fraunces Variable', serif" fontWeight="700">
          <text x="122" y="40" fontSize="16">z</text>
          <text x="132" y="26" fontSize="12">z</text>
          <text x="140" y="16" fontSize="9">z</text>
        </g>
      )}
      {mood === 'thinking' && (
        <g className="m-dots" fill="var(--mascot-ink)">
          <circle cx="126" cy="30" r="3" />
          <circle cx="136" cy="22" r="4" />
          <circle cx="148" cy="12" r="5" />
        </g>
      )}
      {mood === 'sad' && <path className="m-drop" d="M112 60 q-5 8 0 12 q5 -4 0 -12 z" fill="var(--mascot-blue)" stroke="var(--mascot-ink)" strokeWidth="2" />}
      {(mood === 'happy' || mood === 'surprised') && (
        <g className="m-sparks" stroke="var(--mascot-ink)" strokeWidth="2.5" strokeLinecap="round">
          <path d="M20 40 v10 M15 45 h10" />
          <path d="M142 56 v8 M138 60 h8" />
          <path d="M24 90 v6 M21 93 h6" />
        </g>
      )}
      {mood === 'love' && (
        <g className="m-hearts" fill="var(--mascot-coral)" stroke="var(--mascot-ink)" strokeWidth="1.5">
          <path d="M28 40 l-6 -6 a3.5 3.5 0 0 1 6 -4 a3.5 3.5 0 0 1 6 4 z" />
          <path d="M138 30 l-5 -5 a3 3 0 0 1 5 -3.5 a3 3 0 0 1 5 3.5 z" />
        </g>
      )}
      {mood === 'search' && (
        <g className="m-lens" stroke="var(--mascot-ink)" strokeWidth="3.5" fill="none">
          <circle cx="126" cy="54" r="12" fill="#fff" fillOpacity="0.35" />
          <path d="M135 63 l12 12" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}
