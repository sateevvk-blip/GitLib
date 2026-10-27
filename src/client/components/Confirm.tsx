import { useEffect } from 'react';

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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="confirm" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onClick={onCancel}>
      <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
        <h3 id="confirm-title">{title}</h3>
        <p>{text}</p>
        <div className="confirm-actions">
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            Отмена
          </button>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy} autoFocus>
            {busy && <span className="spinner" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
