import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { cssDuration } from '../lib/motion';

export const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

interface Props {
  title: string;
  text: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function Confirm({ title, text, confirmLabel = 'Подтвердить', danger, busy, onConfirm, onCancel }: Props) {
  // Отмена сначала доигрывает уход, потом закрывает. Подтверждение не ждёт анимации:
  // действие (удаление) важнее, диалог закроет вызывающий.
  const [leaving, setLeaving] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const opener = useRef(document.activeElement as HTMLElement | null);

  const close = useCallback(() => {
    if (closeTimer.current) return;
    setLeaving(true);
    closeTimer.current = setTimeout(onCancel, cssDuration('--dur-base'));
  }, [onCancel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  // Тот же приём, что в AddToolDialog: после закрытия фокус возвращается на кнопку-открыватель.
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      queueMicrotask(() => {
        if (!boxRef.current?.isConnected && opener.current?.isConnected) opener.current.focus();
      });
    },
    [],
  );

  // Отключённая кнопка теряет фокус (он уходит на body) — возвращаем его на диалог.
  useEffect(() => {
    if (busy) boxRef.current?.focus();
  }, [busy]);

  // Фокус остаётся внутри диалога.
  const trap = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const items = [...(boxRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) {
      // Обе кнопки отключены (busy): фокус остаётся на самом диалоге, Tab не уходит под него.
      e.preventDefault();
      boxRef.current?.focus();
      return;
    }
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className={`confirm${leaving ? ' is-leaving' : ''}`} role="dialog" aria-modal="true" aria-labelledby="confirm-title" onClick={close} onKeyDown={trap}>
      <div ref={boxRef} tabIndex={-1} className="confirm-box" onClick={(e) => e.stopPropagation()}>
        <h3 id="confirm-title">{title}</h3>
        <p>{text}</p>
        <div className="confirm-actions">
          <button type="button" className="btn" onClick={close} disabled={busy || leaving} autoFocus={danger}>
            Отмена
          </button>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy || leaving} autoFocus={!danger}>
            {busy && <span className="spinner" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
