import type { Mood } from './moods';
import { SPRITES, type Pose, type Sprite } from './sprites/manifest';

export const CHARACTER_IDS = ['banana', 'baller', 'globe', 'cat', 'fish', 'lemon'] as const;
export type CharacterId = (typeof CHARACTER_IDS)[number];

/** Старые идентификаторы (до уточнения референса): «Мишка» оказался Лимоном, «Кролик» — Котом. */
export const LEGACY_CHARACTER_IDS: Record<string, CharacterId> = { bear: 'lemon', rabbit: 'cat' };

export interface Character {
  id: CharacterId;
  name: string;
  /** Короткая характеристика для карточки выбора. */
  tagline: string;
  voice: {
    /** Приветствие при выборе и при первом открытии за сессию. */
    greeting: readonly string[];
    /** Ответ на клик по маскоту. */
    tap: readonly string[];
    /** Когда кликают слишком часто. */
    tickled: readonly string[];
    /** Проснулся после долгого бездействия. */
    wake: readonly string[];
    /** Фирменная реплика при удачном добавлении. */
    cheer: readonly string[];
  };
}

/** Поза или раскадровка — несколько поз по кругу (шаги, танец). */
export type PoseCue = Pose | readonly Pose[];

/** Какая поза из листа стикеров соответствует настроению (общий лист: машет, палец, бежит, сидит, думает, ликует). */
export const POSE_FOR_MOOD: Record<Mood, Pose> = {
  idle: 'thumbs',
  thinking: 'think',
  happy: 'cheer',
  sad: 'sit',
  search: 'run',
  sleep: 'sit',
  love: 'cheer',
  surprised: 'wave',
  wink: 'thumbs',
  cool: 'thumbs',
  grumpy: 'sit',
  shy: 'think',
  laugh: 'cheer',
  dizzy: 'sit',
  wave: 'wave',
  party: 'cheer',
};

/** У Глобуса и Карася свои листы поз — у них своя раскладка по настроениям. */
export const CHARACTER_POSES: Partial<Record<CharacterId, Record<Mood, PoseCue>>> = {
  globe: {
    idle: 'coffee',
    thinking: 'laptop',
    happy: 'thumbs',
    sad: 'facepalm',
    search: 'run',
    sleep: 'yawn',
    love: 'coffee',
    surprised: 'shrug',
    wink: 'thumbs',
    cool: 'crossed',
    grumpy: 'crossed',
    shy: 'facepalm',
    laugh: 'shrug',
    dizzy: 'facepalm',
    wave: 'shrug',
    party: ['thumbs', 'shrug'],
  },
  fish: {
    idle: 'stand',
    thinking: 'walk',
    happy: 'hop',
    sad: 'sit',
    search: ['walk', 'run'],
    sleep: 'sit',
    love: 'hop',
    surprised: 'hop',
    wink: 'stand',
    cool: 'stand',
    grumpy: 'kick',
    shy: 'walk',
    laugh: 'hop',
    dizzy: 'sit',
    wave: 'kick',
    party: ['hop', 'kick'],
  },
};

/** Позы персонажа для настроения; поза, которой у персонажа нет, заменяется первой из его листа. */
export function spriteFor(id: CharacterId, mood: Mood): { pose: Pose; sprite: Sprite; frames: { pose: Pose; sprite: Sprite }[]; scale: number } {
  const set = SPRITES[id];
  const cue = CHARACTER_POSES[id]?.[mood] ?? POSE_FOR_MOOD[mood];
  const frames = (typeof cue === 'string' ? [cue] : cue).flatMap((pose) => {
    const sprite = set.poses[pose];
    return sprite ? [{ pose, sprite }] : [];
  });
  if (!frames.length) {
    const [pose, sprite] = Object.entries(set.poses)[0] ?? [];
    if (!pose || !sprite) throw new Error(`Нет спрайтов для персонажа ${id}`);
    frames.push({ pose: pose as Pose, sprite });
  }
  const [first] = frames as [{ pose: Pose; sprite: Sprite }];
  return { pose: first.pose, sprite: first.sprite, frames, scale: set.scale };
}

export const CHARACTERS: Record<CharacterId, Character> = {
  banana: {
    id: 'banana',
    name: 'Банан',
    tagline: 'Невозмутимый. Никуда не спешит, но всё успевает.',
    voice: {
      greeting: ['Банан на связи. Спокойно, всё разложим по полкам.', 'Привет. Я Банан — не спешу, но всё успеваю.'],
      tap: ['Да-да, я здесь.', 'Не чисти меня, я ещё нужен.', 'Спокойно. Всё под контролем.', 'Можно без рук?', 'Я в кожуре, но в курсе.'],
      tickled: ['Так, хватит. Кожура отвалится.', 'Ой… всё, укачало.'],
      wake: ['Я не спал. Я думал с закрытыми глазами.', 'А? Ты вернулся. Продолжаем.'],
      cheer: ['Положил. Без суеты.', 'Готово. Можно не торопиться.'],
    },
  },
  baller: {
    id: 'baller',
    name: 'Баскет',
    tagline: 'С мячом под мышкой, пока ты читаешь README.',
    voice: {
      greeting: ['Баскет в игре! Кидай ссылки — ловлю.', 'Привет! Мяч при мне, библиотека растёт.'],
      tap: ['Пас принят!', 'Не сбивай мяч!', 'Три очка за новый репозиторий.', 'Тайм-аут? Не, работаем.', 'Дриблинг по полкам.'],
      tickled: ['Фол! Мяч уронил.', 'Стоп-стоп, свисток!'],
      wake: ['Я на скамейке запасных сидел. Выхожу!', 'Мяч не упал — значит, не спал.'],
      cheer: ['Бросок — и в корзину!', 'Чистый трёхочковый.'],
    },
  },
  globe: {
    id: 'globe',
    name: 'Глобус',
    tagline: 'Знает все репозитории мира. Ну почти.',
    voice: {
      greeting: ['Глобус. Покажу, где что лежит.', 'Привет. Все репозитории мира — на одной полке.'],
      tap: ['Не крути меня так.', 'Осторожно, это Северный полюс.', 'Ищешь что-то? Спроси.', 'На моей карте всё помечено.', 'Экватор щекотно.'],
      tickled: ['Всё, ось сбилась!', 'Голова кругом. В прямом смысле.'],
      wake: ['Я вращался. Медленно.', 'Проснулся. Где мы?'],
      cheer: ['Отметил на карте.', 'Ещё одна точка на глобусе.'],
    },
  },
  cat: {
    id: 'cat',
    name: 'Кот',
    tagline: 'Синий, ушастый, усатый. Всё слышит и всё видит.',
    voice: {
      greeting: ['Кот на месте. Мяу.', 'Йо. Усатый на посту.'],
      tap: ['Мяу.', 'Уши не трогать.', 'Быстрее меня только поиск по «/».', 'Чего?', 'Всё слышу. Уши же.'],
      tickled: ['Уши! Я сказал — не трогать!', 'Ладно, ладно, сдаюсь. Мур.'],
      wake: ['Одним ухом слушал, честно.', 'Проснулся. Где миска?'],
      cheer: ['Цап — и в библиотеке.', 'Поймал. Мур.'],
    },
  },
  fish: {
    id: 'fish',
    name: 'Карась',
    tagline: 'Серьёзный. Плавает по базе как по пруду.',
    voice: {
      greeting: ['Карась. Плаваю здесь. Вопросы?', 'Здесь я главный по базе. Поплыли.'],
      tap: ['Буль.', 'Не щекочи жабры.', 'Я не золотая рыбка, желания не исполняю.', 'Серьёзное лицо — серьёзная библиотека.', 'Плыву по делам.'],
      tickled: ['Буль-буль-буль! Хватит!', 'Воздух! Мне нужен воздух!'],
      wake: ['Рыбы не спят. Я проверял.', 'Всплыл. Что пропустил?'],
      cheer: ['Клюнуло! В садок.', 'Улов хороший.'],
    },
  },
  lemon: {
    id: 'lemon',
    name: 'Лимон',
    tagline: 'В кепке и с хитрой улыбкой. Кислый только с виду.',
    voice: {
      greeting: ['Лимон на месте. Устраивайся.', 'Привет! Кепку поправил — можно работать.'],
      tap: ['Хе-хе.', 'Кепку не трогай.', 'Кислый? Это характер.', 'Ну чего, добавим что-нибудь?', 'Стою, слушаю.'],
      tickled: ['Так, сок потечёт. Ну всё.', 'Кепка слетела!'],
      wake: ['Это не сон, это пауза.', 'М-м? Да, здесь.'],
      cheer: ['Положил на полку. Свежее.', 'Хорошая находка.'],
    },
  },
};

export const DEFAULT_CHARACTER: CharacterId = 'lemon';

export function isCharacterId(v: unknown): v is CharacterId {
  return typeof v === 'string' && (CHARACTER_IDS as readonly string[]).includes(v);
}
