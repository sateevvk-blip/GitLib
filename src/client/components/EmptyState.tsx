import type { ReactNode } from 'react';
import { Mascot } from '../mascot/Mascot';
import type { Mood } from '../mascot/store';

interface Props {
  mood: Mood;
  title: string;
  text?: string;
  children?: ReactNode;
  hero?: boolean;
}

export function EmptyState({ mood, title, text, children, hero }: Props) {
  return (
    <div className={`empty ${hero ? 'empty-hero' : ''}`}>
      <Mascot mood={mood} size={hero ? 190 : 130} />
      <h2 className="display">{title}</h2>
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}
