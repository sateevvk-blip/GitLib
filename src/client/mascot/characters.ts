import type { CharacterProps } from './parts';
import { Banana } from './characters/Banana';
import { Baller } from './characters/Baller';
import { Globe } from './characters/Globe';
import { Cat } from './characters/Cat';
import { Fish } from './characters/Fish';
import { Lemon } from './characters/Lemon';

export const CHARACTER_IDS = ['banana', 'baller', 'globe', 'cat', 'fish', 'lemon'] as const;
export type CharacterId = (typeof CHARACTER_IDS)[number];

/** Старые идентификаторы (до уточнения референса): «Мишка» оказался Лимоном, «Кролик» — Котом. */
export const LEGACY_CHARACTER_IDS: Record<string, CharacterId> = { bear: 'lemon', rabbit: 'cat' };

export interface Character {
  id: CharacterId;
  name: string;
  /** Короткая характеристика для карточки выбора. */
  tagline: string;
  Component: (props: CharacterProps) => React.JSX.Element;
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

export const CHARACTERS: Record<CharacterId, Character> = {
  banana: {
    id: 'banana',
    name: 'Банан',
    tagline: 'Невозмутимый. Никуда не спешит, но всё успевает.',
    Component: Banana,
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
    tagline: 'Крутит мяч на пальце, пока ты читаешь README.',
    Component: Baller,
    voice: {
      greeting: ['Баскет в игре! Кидай ссылки — ловлю.', 'Привет! Мяч крутится, библиотека растёт.'],
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
    Component: Globe,
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
    Component: Cat,
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
    Component: Fish,
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
    Component: Lemon,
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
