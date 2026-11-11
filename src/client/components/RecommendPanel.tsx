import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, Sparkles, X } from 'lucide-react';
import type { ToolSummary } from '../../shared/types.js';
import { usePatchTool, useRecommendTools, useSettings } from '../api/hooks';
import { errorMessage, toast } from '../lib/toast';
import { hold, phrases, react, release } from '../mascot/store';
import { ToolCard } from './ToolCard';

const HOLD_KEY = 'recommend';
const TASK_MIN = 3;
const TASK_MAX = 1000;

/** Причина — до трёх строк, остальное по «Ещё». */
function Reason({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <p className={open ? '' : 'recommend-reason'}>{text}</p>
      {text.length > 150 && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? 'Свернуть' : 'Ещё'}
        </button>
      )}
    </>
  );
}

const FIT_LABEL = { high: 'подходит хорошо', medium: 'подходит частично' } as const;

interface Props {
  /** Текст задачи из адреса (?task=). Результат не хранится и сам не запрашивается — только по кнопке. */
  initialTask: string;
  onTaskChange: (task: string) => void;
  onClose: () => void;
  activeTags: string[];
  onTagClick: (tag: string) => void;
}

/** Подбор инструментов под задачу: панель над сеткой каталога, фильтры сетки не меняет. */
export function RecommendPanel({ initialTask, onTaskChange, onClose, activeTags, onTagClick }: Props) {
  const [draft, setDraft] = useState(initialTask);
  // Карточки в ответе — снимок; звезда на них обновляется отдельно, пока ответ не перезапросят.
  const [favs, setFavs] = useState<Record<string, boolean>>({});
  const patch = usePatchTool();
  const llmConfigured = useSettings().data?.llmConfigured ?? false;

  // Реплики — в колбэках mutate: после закрытия панели маскот молчит.
  const rec = useRecommendTools({
    onMutate: () => hold('thinking', phrases.recommendThinking, HOLD_KEY),
    onSettled: () => release(HOLD_KEY),
  });
  // Уход со страницы посреди запроса не оставляет маскота «думающим».
  useEffect(() => () => release(HOLD_KEY), []);

  const task = draft.trim();
  const canSubmit = task.length >= TASK_MIN && !rec.isPending;

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSubmit) return;
    onTaskChange(task);
    rec.mutate(task, {
      onSuccess: (r) => {
        if (r.mode === 'search' && llmConfigured && r.items.length) react('sad', phrases.recommendFallback, 3500);
        else if (r.items.length) react('happy', phrases.recommendDone, 3000);
        else react('sad', phrases.recommendEmpty, 3500);
      },
      onError: () => react('dizzy', phrases.chatFailed, 3500),
    });
  };

  const toggleFavorite = (tool: ToolSummary) => {
    const next = !(favs[tool.id] ?? tool.user.favorite);
    patch.mutate(
      { id: tool.id, patch: { favorite: next } },
      {
        onSuccess: () => {
          setFavs((f) => ({ ...f, [tool.id]: next }));
          react(next ? 'love' : 'shy', next ? phrases.favoriteOn : phrases.favoriteOff, 2500);
        },
        onError: (e) => toast('error', errorMessage(e)),
      },
    );
  };

  const result = rec.data;

  return (
    <section className="panel recommend" aria-label="Подбор под задачу">
      <div className="panel-head">
        <h2>
          <Sparkles /> Подобрать под задачу
        </h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          <X size={14} />
          Закрыть подбор
        </button>
      </div>

      <form className="recommend-form" onSubmit={submit}>
        <label className="visually-hidden" htmlFor="recommend-task">
          Задача
        </label>
        <input
          id="recommend-task"
          className="input"
          value={draft}
          maxLength={TASK_MAX}
          autoFocus={!initialTask}
          placeholder="Например: нужно быстро собрать макет лендинга"
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
          Подобрать
        </button>
      </form>

      {draft.trim().length > 0 && task.length < TASK_MIN && <p className="recommend-hint">Опишите задачу хотя бы в трёх символах</p>}

      <div className="recommend-body" aria-live="polite" aria-busy={rec.isPending}>
        {rec.isPending && (
          <div className="recommend-skeleton" aria-label="Подбираю инструменты">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton" />
            ))}
          </div>
        )}

        {rec.isError && !rec.isPending && (
          <div className="error-box" role="alert">
            <AlertTriangle size={16} />
            <span>Не удалось подобрать: {errorMessage(rec.error)}</span>
            <button type="button" className="btn btn-sm" onClick={() => submit()} disabled={!canSubmit}>
              Повторить
            </button>
          </div>
        )}

        {result && !rec.isPending && (
          <>
            {(result.notice || result.mode === 'search') && (
              <div className="recommend-meta">
                {/* Подпись режима и notice не дублируют друг друга: у поиска notice уже говорит то же */}
                {result.mode === 'search' && !result.notice && <span className="label">Поиск по словам, без AI</span>}
                {result.notice && <span className="recommend-notice">{result.notice}</span>}
              </div>
            )}
            {result.items.length === 0 ? (
              <p className="recommend-empty">Подходящих инструментов не нашлось.</p>
            ) : (
              <ol className="grid tool-grid recommend-list">
                {result.items.map(({ tool, reason, fit }, i) => (
                  <li key={tool.id} className="recommend-item">
                    <ToolCard
                      tool={{ ...tool, user: { ...tool.user, favorite: favs[tool.id] ?? tool.user.favorite } }}
                      index={i}
                      activeTags={activeTags}
                      onToggleFavorite={toggleFavorite}
                      onTagClick={onTagClick}
                      compact
                    />
                    {(fit || reason) && (
                      <div className="recommend-why">
                        {fit && <span className={`recommend-fit is-${fit}`}>{FIT_LABEL[fit]}</span>}
                        {/* Текст модели — только как текст, не как разметка. */}
                        {reason && <Reason text={reason} />}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {result.comment && <p className="recommend-comment">{result.comment}</p>}
          </>
        )}
      </div>
    </section>
  );
}
