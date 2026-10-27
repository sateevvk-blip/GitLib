import { useState, type FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Repo } from '../../shared/types.js';

interface Props {
  repo: Repo;
  onChange: (topics: string[]) => void;
  disabled?: boolean;
}

export function TopicsEditor({ repo, onChange, disabled }: Props) {
  const [draft, setDraft] = useState('');
  const own = repo.user.topics;
  const ownLower = new Set(own.map((t) => t.toLocaleLowerCase()));
  const github = repo.github.topics.filter((t) => !ownLower.has(t.toLocaleLowerCase()));
  const ai = repo.analysis.suggestedTopics.filter((t) => !ownLower.has(t.toLocaleLowerCase()) && !repo.github.topics.includes(t));

  const add = (t: string) => {
    const clean = t.trim();
    if (!clean || ownLower.has(clean.toLocaleLowerCase())) return;
    onChange([...own, clean]);
  };
  const remove = (t: string) => onChange(own.filter((x) => x !== t));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    for (const part of draft.split(',')) add(part);
    setDraft('');
  };

  return (
    <div className="topics-editor">
      <div className="topics-group">
        <span className="label">Мои темы</span>
        <div className="chips">
          {own.length === 0 && <span className="muted" style={{ fontSize: 13 }}>Пока нет. Добавьте свои или возьмите из предложенных ниже.</span>}
          {own.map((t) => (
            <span key={t} className="chip is-user is-static">
              <Link to={`/?topics=${encodeURIComponent(t)}`} title="Показать все с этой темой">
                {t}
              </Link>
              <button type="button" className="chip-x" aria-label={`Убрать тему ${t}`} onClick={() => remove(t)} disabled={disabled}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <form className="topics-add" onSubmit={submit}>
          <input
            className="input"
            placeholder="Новая тема (можно несколько через запятую)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={disabled}
          />
          <button type="submit" className="btn btn-sm" disabled={disabled || !draft.trim()}>
            <Plus size={14} /> Добавить
          </button>
        </form>
      </div>

      {github.length > 0 && (
        <div className="topics-group">
          <span className="label">GitHub topics · нажмите, чтобы взять в свои</span>
          <div className="chips">
            {github.map((t) => (
              <button key={t} type="button" className="chip" onClick={() => add(t)} disabled={disabled} title="Добавить в мои темы">
                <span>{t}</span>
                <Plus size={11} />
              </button>
            ))}
          </div>
        </div>
      )}

      {ai.length > 0 && (
        <div className="topics-group">
          <span className="label">Предложено AI · нажмите, чтобы взять в свои</span>
          <div className="chips">
            {ai.map((t) => (
              <button key={t} type="button" className="chip is-ai" onClick={() => add(t)} disabled={disabled} title="Добавить в мои темы">
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
