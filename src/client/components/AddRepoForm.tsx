import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useAddRepo } from '../api/hooks';
import { ApiError } from '../api/client';
import { useOnline } from '../lib/online';
import { toast } from '../lib/toast';
import { hold, phrases, react, release } from '../mascot/store';

interface Props {
  autoFocus?: boolean;
  compact?: boolean;
}

export function AddRepoForm({ autoFocus, compact }: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<{ text: string; repoId?: string } | null>(null);
  const add = useAddRepo();
  const navigate = useNavigate();
  const online = useOnline();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const input = value.trim();
    if (!input || add.isPending) return;
    setError(null);
    hold('thinking', phrases.reading[Math.floor(Math.random() * phrases.reading.length)]);
    try {
      const repo = await add.mutateAsync(input);
      release();
      react('happy', phrases.added(repo.name), 4500);
      toast('success', `Добавлен ${repo.fullName}`);
      setValue('');
      navigate(`/repo/${repo.id}`);
    } catch (err) {
      release();
      if (err instanceof ApiError && err.code === 'duplicate') {
        const repoId = typeof err.extra.repoId === 'string' ? err.extra.repoId : undefined;
        setError({ text: err.message, repoId });
        react('surprised', phrases.duplicate, 3500);
        return;
      }
      const text = err instanceof Error ? err.message : 'Не удалось добавить репозиторий';
      setError({ text });
      react('sad', phrases.addFailed, 4000);
    }
  };

  return (
    <div className="add-form-wrap">
      <form className="add-form" onSubmit={submit}>
        <input
          className="input"
          type="text"
          autoFocus={autoFocus}
          placeholder={compact ? 'owner/repo или ссылка' : 'https://github.com/owner/repo  или  owner/repo'}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          disabled={add.isPending}
          spellCheck={false}
          autoComplete="off"
          aria-label="Ссылка на GitHub-репозиторий"
        />
        <button type="submit" className="btn btn-primary" disabled={add.isPending || !value.trim() || !online} title={online ? undefined : 'Нет сети'}>
          {add.isPending ? <span className="spinner" /> : <Plus size={16} />}
          {add.isPending ? 'Читаю…' : 'Добавить'}
        </button>
      </form>
      {error && (
        <div className="add-form-error" role="alert">
          <span>{error.text}</span>
          {error.repoId && (
            <button type="button" className="btn btn-sm" onClick={() => navigate(`/repo/${error.repoId}`)}>
              Открыть
            </button>
          )}
        </div>
      )}
      {!online && !error && <div className="add-form-error muted">Нет сети — добавление новых репозиториев недоступно, библиотека работает.</div>}
    </div>
  );
}
