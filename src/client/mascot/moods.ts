/**
 * Настроения маскота. Персонаж показывает позу из листа стикеров (`characters.ts`, `POSE_FOR_MOOD`),
 * а реквизит вокруг головы и движения тела общие (`Mascot.tsx`, CSS `.mascot[data-mood]`).
 */
export const MOODS = [
  'idle',
  'thinking',
  'happy',
  'sad',
  'search',
  'sleep',
  'love',
  'surprised',
  'wink',
  'cool',
  'grumpy',
  'shy',
  'laugh',
  'dizzy',
  'wave',
  'party',
] as const;

export type Mood = (typeof MOODS)[number];

export const MOOD_LABELS: Record<Mood, string> = {
  idle: 'Спокоен',
  thinking: 'Думает',
  happy: 'Радуется',
  sad: 'Грустит',
  search: 'Ищет',
  sleep: 'Спит',
  love: 'Влюблён',
  surprised: 'Удивлён',
  wink: 'Подмигивает',
  cool: 'Крутой',
  grumpy: 'Ворчит',
  shy: 'Смущён',
  laugh: 'Смеётся',
  dizzy: 'Голова кружится',
  wave: 'Машет',
  party: 'Празднует',
};
