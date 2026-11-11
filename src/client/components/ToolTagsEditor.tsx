import { useState, type FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Tool } from '../../shared/types.js';
import { fold } from '../../shared/search.js';

interface Props {
  tool: Tool;
  onChange: (tags: string[]) => void;
  disabled?: boolean;
}

/** Теги инструмента: свои и предложенные AI. Вёрстка и классы — как у TopicsEditor репозитория. */
export function ToolTagsEditor({ tool, onChange, disabled }: Props) {
  const [draft, setDraft] = useState('');
  const own = tool.user.tags;
  const ownFolded = new Set(own.map(fold));
  const ai = tool.analysis.suggestedTags.filter((t) => !ownFolded.has(fold(t)));

  const add = (t: string) => {
    const clean = t.trim();
    if (!clean || ownFolded.has(fold(clean))) return;
    onChange([...own, clean]);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    // Одним действием: несколько тегов через запятую не должны затирать друг друга.
    const fresh: string[] = [];
    const seen = new Set(ownFolded);
    for (const part of draft.split(',')) {
      const clean = part.trim();
      if (clean && !seen.has(fold(clean))) {
        seen.add(fold(clean));
        fresh.push(clean);
      }
    }
    if (fresh.length) onChange([...own, ...fresh]);
    setDraft('');
  };

  return (
    <div className="topics-editor">
      <div className="topics-group">
        <span className="label">Мои теги</span>
        <div className="chips">
          {own.length === 0 && (
            <span className="muted" style={{ fontSize: 13 }}>
              Пока нет. Добавьте свои{ai.length > 0 ? ' или возьмите из предложенных ниже' : ''}.
            </span>
          )}
          {own.map((t) => (
            <span key={t} className="chip is-user is-static">
              <Link to={`/tools?tags=${encodeURIComponent(t)}`} title="Показать все инструменты с этим тегом">
                {t}
              </Link>
              <button type="button" className="chip-x" aria-label={`Убрать тег ${t}`} onClick={() => onChange(own.filter((x) => x !== t))} disabled={disabled}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <form className="topics-add" onSubmit={submit}>
          <input className="input" placeholder="Новый тег (можно несколько через запятую)" aria-label="Новый тег" maxLength={100} value={draft} onChange={(e) => setDraft(e.target.value)} disabled={disabled} />
          <button type="submit" className="btn btn-sm" disabled={disabled || !draft.trim()}>
            <Plus size={14} /> Добавить
          </button>
        </form>
      </div>

      {ai.length > 0 && (
        <div className="topics-group">
          <span className="label">Предложено AI · нажмите, чтобы взять в свои</span>
          <div className="chips">
            {ai.map((t) => (
              <button key={t} type="button" className="chip is-ai" onClick={() => add(t)} disabled={disabled} title="Добавить в мои теги" aria-label={`Добавить в мои теги: ${t}`}>
                <span>{t}</span>
                <Plus size={11} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
