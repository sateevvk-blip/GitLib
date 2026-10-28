import { useEffect, useRef, useState } from 'react';
import { IntroScene, type SceneRefs } from './IntroScene';
import { project } from './iso';
import { type Actor, type Frame, sceneAt } from './timeline';
import { beginIntro, finishIntro, frozenIntroTime, markIntroSeen, shouldPlayIntro } from './gate';
import { cssDuration } from '../lib/motion';

type Phase = 'playing' | 'leaving' | 'done';

function place(el: SVGGElement | null, a: Actor): void {
  if (!el) return;
  el.style.display = a.visible ? '' : 'none';
  if (!a.visible) return;
  const [x, y] = project(a.x, a.y, a.z);
  el.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
}

/**
 * Заставка при открытии приложения: общий вид квартала по референсу, к библиотеке подъезжает машина,
 * пассажир выходит и заходит в здание, камера плавно наезжает. Один раз за сессию, пропуск — Esc или кнопка.
 */
export function Intro() {
  const [phase, setPhase] = useState<Phase>(() => {
    if (!shouldPlayIntro()) return 'done';
    beginIntro();
    return 'playing';
  });
  const root = useRef<HTMLDivElement>(null);
  const frozen = frozenIntroTime();
  const refs = useRef<SceneRefs>({
    svg: { current: null },
    car: { current: null },
    walkerOut: { current: null },
    walkerIn: { current: null },
    doorLight: { current: null },
  }).current;
  const active = phase !== 'done';

  // Пока оверлей на экране, остальное приложение недоступно для Tab и скринридера (inert),
  // фокус — на кнопке пропуска; после заставки фокус возвращается туда, где был.
  useEffect(() => {
    const el = root.current;
    if (!active || !el) return;
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const others = Array.from(el.parentElement?.children ?? []).filter((c): c is HTMLElement => c !== el && c instanceof HTMLElement);
    for (const o of others) o.setAttribute('inert', '');
    el.querySelector<HTMLButtonElement>('.intro-skip')?.focus();
    return () => {
      for (const o of others) o.removeAttribute('inert');
      if (prev && prev.isConnected && prev !== document.body) prev.focus();
    };
  }, [active]);

  useEffect(() => {
    if (phase !== 'playing') return;
    markIntroSeen();
    const apply = (f: Frame) => {
      if (refs.svg.current) refs.svg.current.style.transform = `scale(${f.zoom.toFixed(4)})`;
      // Прозрачность — через переменную, чтобы уход при пропуске начинался с текущего значения, без вспышки.
      root.current?.style.setProperty('--intro-opacity', f.opacity.toFixed(3));
      place(refs.car.current, f.car);
      place(refs.walkerOut.current, f.walkerOut);
      refs.walkerOut.current?.classList.toggle('is-walking', f.walkerOut.walking);
      place(refs.walkerIn.current, f.walkerIn);
      if (refs.walkerIn.current) {
        refs.walkerIn.current.classList.toggle('is-walking', f.walkerIn.walking);
        refs.walkerIn.current.style.opacity = f.walkerIn.opacity.toFixed(3);
      }
      if (refs.doorLight.current) refs.doorLight.current.style.opacity = (f.doorLight * 0.45).toFixed(3);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      setPhase('leaving');
    };
    window.addEventListener('keydown', onKey);
    if (frozen !== null) {
      apply(sceneAt(frozen));
      return () => window.removeEventListener('keydown', onKey);
    }
    // Время идёт только между кадрами: в фоновой вкладке rAF не тикает, и после возвращения
    // сцена продолжается с того же места, а не перескакивает в конец.
    let elapsed = 0;
    let last: number | null = null;
    let raf = 0;
    const tick = (now: number) => {
      if (last !== null) elapsed += Math.min(now - last, 100);
      last = now;
      const f = sceneAt(elapsed);
      apply(f);
      if (f.done) {
        setPhase('done');
        finishIntro();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
    };
  }, [phase, refs, frozen]);

  // Пропуск: оверлей гаснет за --dur-base (CSS), потом снимается; таймер — та же длительность, что у анимации.
  useEffect(() => {
    if (phase !== 'leaving') return;
    const t = setTimeout(() => {
      setPhase('done');
      finishIntro();
    }, cssDuration('--dur-base') + 30);
    return () => clearTimeout(t);
  }, [phase]);

  if (!active) return null;

  const className = ['intro', phase === 'leaving' && 'intro--leaving', frozen !== null && 'intro--frozen'].filter(Boolean).join(' ');

  return (
    <div ref={root} className={className} role="dialog" aria-modal="true" aria-label="Заставка: вход в библиотеку">
      <IntroScene refs={refs} />
      <div className="intro-title">
        <b>GITLIB</b>
        <span>личная библиотека репозиториев</span>
      </div>
      <button type="button" className="intro-skip" autoFocus onClick={() => setPhase('leaving')}>
        Пропустить <kbd>Esc</kbd>
      </button>
    </div>
  );
}
