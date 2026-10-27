import { X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { dismissToast, useToasts } from '../lib/toast';

export function Toasts() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <span>{t.text}</span>
          {t.action && (
            <Link to={t.action.href} onClick={() => dismissToast(t.id)}>
              {t.action.label}
            </Link>
          )}
          <button type="button" aria-label="Закрыть" onClick={() => dismissToast(t.id)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
