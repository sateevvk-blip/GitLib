import type { CharacterProps } from './parts';
import { Banana } from './characters/Banana';
import { Baller } from './characters/Baller';
import { Globe } from './characters/Globe';
import { Rabbit } from './characters/Rabbit';
import { Fish } from './characters/Fish';
import { Bear } from './characters/Bear';

export const CHARACTER_IDS = ['banana', 'baller', 'globe', 'rabbit', 'fish', 'bear'] as const;
export type CharacterId = (typeof CHARACTER_IDS)[number];

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
  rabbit: {
    id: 'rabbit',
    name: 'Кролик',
    tagline: 'Peace. Быстрый, ушастый, в курсе всего.',
    Component: Rabbit,
    voice: {
      greeting: ['Кролик здесь. Peace!', 'Йо. Ушастый на посту.'],
      tap: ['Peace!', 'Уши не трогать.', 'Быстрее меня только поиск по «/».', 'Чего?', 'Всё слышу. Уши же.'],
      tickled: ['Уши! Я сказал — не трогать!', 'Ладно, ладно, сдаюсь.'],
      wake: ['Одним ухом слушал, честно.', 'Проснулся. Где морковка?'],
      cheer: ['Прыг — и в библиотеке.', 'Поймал. Peace.'],
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
  bear: {
    id: 'bear',
    name: 'Мишка',
    tagline: 'В кепке и с хитрой улыбкой. Уютный библиотекарь.',
    Component: Bear,
    voice: {
      greeting: ['Мишка на месте. Устраивайся.', 'Привет! Кепку поправил — можно работать.'],
      tap: ['Хе-хе.', 'Кепку не трогай.', 'Мёд не здесь, здесь код.', 'Ну чего, добавим что-нибудь?', 'Сижу, слушаю.'],
      tickled: ['Р-р-р. Ну всё.', 'Кепка слетела!'],
      wake: ['Это не спячка, это пауза.', 'М-м? Да, здесь.'],
      cheer: ['Положил в берлогу.', 'Хорошая находка.'],
    },
  },
};

export const DEFAULT_CHARACTER: CharacterId = 'bear';

export function isCharacterId(v: unknown): v is CharacterId {
  return typeof v === 'string' && (CHARACTER_IDS as readonly string[]).includes(v);
}
