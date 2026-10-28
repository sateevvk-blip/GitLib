import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Mascot } from './Mascot';
import { peek, phrases, pick, react, setAmbient, timeGreeting, useMascot } from './store';
import { CHARACTERS } from './characters';
import { hasChosenCharacter, useCharacter } from './choice';
import { useOnline } from '../lib/online';
import { usePresence } from '../lib/motion';
import { afterIntro } from '../intro/gate';

const GREETED_KEY = 'gitlib.greeted';
/** Через сколько бездействия маскот задремлет. */
const DOZE_MS = 4 * 60 * 1000;

export function MascotDock() {
  const mascot = useMascot();
  const { mood } = mascot;
  // Реплика доигрывает уход после того, как стор вернулся в покой.
  const { shown: bubble, leaving } = usePresence(mascot.message ? mascot : null, '--dur-quick');
  const online = useOnline();
  const characterId = useCharacter();
  const character = CHARACTERS[characterId];
  const taps = useRef<number[]>([]);
  const dozing = useRef(false);
  const prevOnline = useRef(online);

  // Приветствие один раз за сессию; при первом запуске — подсказка, что напарника можно выбрать.
  useEffect(() => {
    let greeted = false;
    try {
      greeted = sessionStorage.getItem(GREETED_KEY) === '1';
      sessionStorage.setItem(GREETED_KEY, '1');
    } catch {
      /* sessionStorage может быть недоступен */
    }
    if (greeted) return;
    // Если идёт заставка, здороваемся после неё — иначе реплика уйдёт под оверлей.
    let t: ReturnType<typeof setTimeout> | null = null;
    const off = afterIntro(() => {
      t = setTimeout(() => {
        if (hasChosenCharacter()) react('wave', `${timeGreeting()} ${pick(character.voice.greeting)}`, 5000);
        else react('wave', `Привет, я ${character.name}. ${phrases.chooseMe}`, 8000, { label: 'Выбрать напарника', to: '/settings#mascot' });
      }, 600);
    });
    return () => {
      off();
      if (t) clearTimeout(t);
    };
    // Только при монтировании: персонаж на момент загрузки.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (prevOnline.current === online) return;
    prevOnline.current = online;
    if (!online) react('sad', phrases.offline, 6000);
    else react('wave', phrases.online, 3000);
  }, [online]);

  // Долгое бездействие → дремлет; любое движение → просыпается с репликой.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const arm = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        const s = peek();
        if (s.sticky || s.mood === 'sleep') return;
        dozing.current = true;
        setAmbient('sleep', null);
      }, DOZE_MS);
    };
    const onActivity = () => {
      if (dozing.current) {
        dozing.current = false;
        react('surprised', [...character.voice.wake, ...phrases.wake], 2500);
      }
      arm();
    };
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'];
    for (const ev of events) window.addEventListener(ev, onActivity, { passive: true });
    arm();
    return () => {
      if (t) clearTimeout(t);
      for (const ev of events) window.removeEventListener(ev, onActivity);
    };
  }, [character]);

  const onTap = () => {
    const now = Date.now();
    taps.current = taps.current.filter((ts) => now - ts < 1600);
    taps.current.push(now);
    const n = taps.current.length;
    if (n >= 6) {
      taps.current = [];
      react('grumpy', 'Ну всё, хватит!', 3000);
    } else if (n >= 4) {
      react('dizzy', character.voice.tickled, 3000);
    } else if (n === 1) {
      react(Math.random() < 0.5 ? 'happy' : 'wink', Math.random() < 0.6 ? character.voice.tap : phrases.idleTips, 4500);
    } else {
      react('laugh', character.voice.tap, 3000);
    }
  };

  return (
    <div className="mascot-dock" aria-live="polite">
      {bubble?.message && (
        <div className={`mascot-bubble${leaving ? ' is-leaving' : ''}`} key={bubble.message}>
          <span>{bubble.message}</span>
          {bubble.link && (
            <Link className="mascot-bubble-link" to={bubble.link.to}>
              {bubble.link.label}
            </Link>
          )}
        </div>
      )}
      <button type="button" className="mascot-button" title={`${character.name} — твой напарник`} onClick={onTap}>
        <Mascot mood={mood} size={104} />
      </button>
    </div>
  );
}
