import { useEffect, useRef, useState } from 'react';

interface Props {
  value: string;
  onSave: (notes: string) => Promise<unknown>;
  disabled?: boolean;
}

/** Заметки с автосохранением через 800 мс после последней правки. */
export function NotesEditor({ value, onSave, disabled }: Props) {
  const [draft, setDraft] = useState(value);
  const [state, setState] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef(value);

  useEffect(() => {
    if (value !== lastSaved.current && state !== 'dirty' && state !== 'saving') {
      setDraft(value);
      lastSaved.current = value;
    }
  }, [value, state]);

  const flush = async (text: string) => {
    if (text === lastSaved.current) {
      setState('idle');
      return;
    }
    setState('saving');
    try {
      await onSave(text);
      lastSaved.current = text;
      setState('saved');
      setTimeout(() => setState((s) => (s === 'saved' ? 'idle' : s)), 2000);
    } catch {
      setState('error');
    }
  };

  const change = (text: string) => {
    setDraft(text);
    setState('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(text), 800);
  };

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const label = {
    idle: '',
    dirty: 'есть несохранённые изменения…',
    saving: 'сохраняю…',
    saved: 'сохранено',
    error: 'не удалось сохранить — проверьте сервер',
  }[state];

  return (
    <div className="notes">
      <textarea
        className="textarea"
        placeholder="Зачем мне этот проект, что проверить, куда применить, подводные камни…"
        value={draft}
        onChange={(e) => change(e.target.value)}
        onBlur={() => {
          if (timer.current) clearTimeout(timer.current);
          void flush(draft);
        }}
        disabled={disabled}
      />
      <div className="notes-status" aria-live="polite">
        {label || ' '}
      </div>
    </div>
  );
}
