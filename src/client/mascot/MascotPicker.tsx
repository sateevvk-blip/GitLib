import { useState } from 'react';
import { Mascot } from './Mascot';
import { CHARACTERS, CHARACTER_IDS, type CharacterId } from './characters';
import { setCharacter, useCharacter } from './choice';
import { MOOD_LABELS, type Mood } from './moods';
import { pick, react } from './store';

/** Настроения для кнопок «посмотреть реакцию» и реплики к ним. */
const DEMO: Partial<Record<Mood, string>> = {
  happy: 'Вот так я радуюсь.',
  wave: 'Привет-привет!',
  thinking: 'Так я думаю над сводкой…',
  search: 'А так — ищу по полкам.',
  love: 'Это когда ты ставишь звёздочку.',
  party: 'Круглое число репозиториев — праздник!',
  laugh: 'Ха. Смешно.',
  wink: 'Настройки сохранены. Подмигиваю.',
  cool: 'Экспорт сделан. Я крутой.',
  surprised: 'Ого! Такого я не ожидал.',
  shy: 'Заметку записал. Никому не скажу.',
  sad: 'Так я грущу, если что-то не вышло.',
  grumpy: 'Так я ворчу, когда меня слишком много тыкают.',
  dizzy: 'А так — когда совсем закружился.',
  sleep: 'Так сплю, пока библиотека пуста или ты ушёл.',
};

export function MascotPicker() {
  const current = useCharacter();
  const [hover, setHover] = useState<CharacterId | null>(null);

  const choose = (id: CharacterId) => {
    const wasCurrent = id === current;
    setCharacter(id);
    const ch = CHARACTERS[id];
    react('wave', wasCurrent ? pick(ch.voice.tap) : pick(ch.voice.greeting), 4500);
  };

  return (
    <div className="mascot-picker-wrap">
      <div className="mascot-picker" role="radiogroup" aria-label="Выбор маскота">
        {CHARACTER_IDS.map((id) => {
          const ch = CHARACTERS[id];
          const active = id === current;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`mascot-card ${active ? 'is-active' : ''}`}
              onClick={() => choose(id)}
              onMouseEnter={() => setHover(id)}
              onMouseLeave={() => setHover((h) => (h === id ? null : h))}
              onFocus={() => setHover(id)}
              onBlur={() => setHover((h) => (h === id ? null : h))}
            >
              <Mascot character={id} mood={active ? 'happy' : hover === id ? 'wave' : 'idle'} size={92} />
              <span className="mascot-card-name">{ch.name}</span>
              <span className="mascot-card-tagline">{ch.tagline}</span>
            </button>
          );
        })}
      </div>
      <div className="mascot-demo">
        <span className="label">Посмотреть реакции</span>
        <div className="mascot-demo-chips">
          {(Object.keys(DEMO) as Mood[]).map((m) => (
            <button key={m} type="button" className="chip" onClick={() => react(m, DEMO[m], 3500)}>
              {MOOD_LABELS[m]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
