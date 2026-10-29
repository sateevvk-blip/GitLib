import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Mascot } from './Mascot';
import { peek, phrases, pick, react, setAmbient, timeGreeting, useMascot } from './store';
import { CHARACTERS } from './characters';
import { hasChosenCharacter, useCharacter } from './choice';
import { toggleChat, useChat } from './chat';
import { RepoChat } from './RepoChat';
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
  const chat = useChat();
  const characterId = useCharacter();
  const character = CHARACTERS[characterId];
  const taps = useRef<number[]>([]);
  const dozing = useRef(false);
  const prevOnline = useRef(online);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const chatOpen = chat.open && chat.target !== null;
  const prevChatOpen = useRef(chatOpen);

  // Чат закрылся (Esc, крестик, уход со страницы) — фокус возвращается на кнопку маскота.
  useEffect(() => {
    if (prevChatOpen.current && !chatOpen) buttonRef.current?.focus();
    prevChatOpen.current = chatOpen;
  }, [chatOpen]);

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
    // На странице репозитория клик открывает чат о нём вместо обычной реплики.
    if (chat.target) {
      if (chat.open) react('wave', phrases.chatClosed, 2000);
      toggleChat();
      return;
    }
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

  const title = chat.target ? (chatOpen ? 'Закрыть чат' : `Спросить ${character.name} про ${chat.target.fullName}`) : `${character.name} — твой напарник`;

  return (
    <div className="mascot-dock">
      {chatOpen && chat.target && <RepoChat key={chat.target.id} target={chat.target} />}
      {bubble?.message && !chatOpen && (
        <div className={`mascot-bubble${leaving ? ' is-leaving' : ''}`} key={bubble.message} aria-live="polite">
          <span>{bubble.message}</span>
          {bubble.link && (
            <Link className="mascot-bubble-link" to={bubble.link.to}>
              {bubble.link.label}
            </Link>
          )}
        </div>
      )}
      <button ref={buttonRef} type="button" className={`mascot-button${chatOpen ? ' is-chatting' : ''}`} title={title} aria-expanded={chat.target ? chatOpen : undefined} onClick={onTap}>
        <Mascot mood={mood} size={104} />
        {chat.target && !chatOpen && (
          <span className="mascot-badge" aria-hidden="true">
            ?
          </span>
        )}
      </button>
    </div>
  );
}
