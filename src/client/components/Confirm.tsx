import { useCallback, useEffect, useRef, useState } from 'react';
import { cssDuration } from '../lib/motion';

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

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  return (
    <div className={`confirm${leaving ? ' is-leaving' : ''}`} role="dialog" aria-modal="true" aria-labelledby="confirm-title" onClick={close}>
      <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
        <h3 id="confirm-title">{title}</h3>
        <p>{text}</p>
        <div className="confirm-actions">
          <button type="button" className="btn" onClick={close} disabled={busy || leaving}>
            Отмена
          </button>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy || leaving} autoFocus>
            {busy && <span className="spinner" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
