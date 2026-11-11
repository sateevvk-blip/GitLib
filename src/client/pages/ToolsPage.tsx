import { useEffect, useState } from 'react';
import { Plus, Sparkles, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import type { ToolSortKey, ToolSummary } from '../../shared/types.js';
import { useToolFacets, usePatchTool, useTools } from '../api/hooks';
import { useToolsQuery } from '../lib/toolsQuery';
import { plural } from '../lib/format';
import { toast, errorMessage } from '../lib/toast';
import { phrases, react, setAmbient } from '../mascot/store';
import { AddToolDialog, AddToolForm } from '../components/AddToolDialog';
import { ToolFilterRail } from '../components/ToolFilterRail';
import { ToolCard } from '../components/ToolCard';
import { RecommendPanel } from '../components/RecommendPanel';
import { EmptyState } from '../components/EmptyState';

const SORT_LABELS: Record<ToolSortKey, string> = {
  added: 'Сначала новые',
  name: 'По названию',
  updated: 'Недавно изменённые',
};

const FORMS: [string, string, string] = ['инструмент', 'инструмента', 'инструментов'];

export function ToolsPage() {
  const { query, update, toggleIn, removeIn, clear, filtered } = useToolsQuery();
  const tools = useTools(query);
  const facets = useToolFacets();
  const patch = usePatchTool();
  const [adding, setAdding] = useState(false);
  // Задача подбора живёт в адресе (?task=); результат — нет: он запрашивается только кнопкой.
  const [params, setParams] = useSearchParams();
  const rawTask = params.get('task') ?? '';
  const task = rawTask.slice(0, 1000);
  const [recommending, setRecommending] = useState(false);
  // Слишком длинную задачу из адреса обрезаем и переписываем параметр.
  useEffect(() => {
    if (rawTask.length > 1000) setTask(rawTask.slice(0, 1000));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawTask]);
  const setTask = (value: string | null) => {
    const next = new URLSearchParams(window.location.search);
    if (value) next.set('task', value);
    else next.delete('task');
    setParams(next, { replace: true });
  };

  const total = facets.data?.total ?? 0;
  const items = tools.data?.items ?? [];
  const catalogEmpty = facets.isSuccess && total === 0;
  const nothingFound = tools.isSuccess && facets.isSuccess && items.length === 0 && !catalogEmpty;

  useEffect(() => {
    if (catalogEmpty) setAmbient('sleep', null); // подсказка уже на экране — реплика закрыла бы форму
    else if (nothingFound) react('sad', phrases.nothingFound, 3000);
    else setAmbient('idle', null);
  }, [catalogEmpty, nothingFound]);

  const toggleFavorite = (tool: ToolSummary) => {
    const next = !tool.user.favorite;
    patch.mutate(
      { id: tool.id, patch: { favorite: next } },
      {
        onSuccess: () => react(next ? 'love' : 'shy', next ? phrases.favoriteOn : phrases.favoriteOff, 2500),
        onError: (e) => toast('error', errorMessage(e)),
      },
    );
  };

  const sheetDate = new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

  if (catalogEmpty) {
    return (
      <main className="page">
        <EmptyState
          hero
          mood="sleep"
          title="Каталог инструментов пуст"
          text="Вставьте адрес сайта, сервиса или библиотеки. GitLib прочитает страницу, опишет её по-русски и положит карточку на полку."
        >
          <AddToolForm autoFocus={window.matchMedia?.('(hover: hover) and (pointer: fine)').matches} />
        </EmptyState>
      </main>
    );
  }

  return (
    <div className="shell">
      <ToolFilterRail facets={facets.data} />
      <main>
        <div className="lib-head">
          <div>
            <div className="sheet-label">
              <b>Лист 02</b>
              <span>·</span>
              <span>{filtered ? 'выборка' : 'инструменты'}</span>
              <span>·</span>
              <span>{sheetDate}</span>
            </div>
            <h1 className="display lib-title">{filtered ? 'Подборка' : 'Инструменты'}</h1>
            <div className="lib-sub">
              {tools.isSuccess && facets.isSuccess && <span>{filtered ? `${plural(items.length, FORMS)} из ${total}` : plural(total, FORMS)}</span>}
              {facets.data && facets.data.drafts > 0 && !filtered && <span>· {plural(facets.data.drafts, ['черновик', 'черновика', 'черновиков'])}</span>}
            </div>
          </div>
          <div className="lib-tools">
            <label className="visually-hidden" htmlFor="tool-sort">
              Сортировка
            </label>
            <select id="tool-sort" className="select" style={{ width: 'auto', minHeight: 36 }} value={query.sort ?? 'added'} onChange={(e) => update({ sort: e.target.value as ToolSortKey })}>
              {(Object.keys(SORT_LABELS) as ToolSortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABELS[k]}
                </option>
              ))}
            </select>
            <button type="button" className="btn" onClick={() => setRecommending(true)}>
              <Sparkles size={16} />
              Подобрать под задачу
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
              <Plus size={16} />
              Добавить инструмент
            </button>
          </div>
        </div>

        {(recommending || task) && (
          <RecommendPanel
            initialTask={task}
            onTaskChange={setTask}
            onClose={() => {
              setRecommending(false);
              setTask(null);
            }}
            activeTags={query.tags ?? []}
            onTagClick={(tag) => toggleIn('tags', tag)}
          />
        )}

        {filtered && (
          <div className="active-filters">
            {query.q && (
              <button type="button" className="chip is-active" onClick={() => update({ q: '' })}>
                <span>«{query.q}»</span>
                <X size={12} className="chip-x" />
              </button>
            )}
            {query.categories?.map((c) => (
              <button key={c} type="button" className="chip is-active" onClick={() => removeIn('categories', c)}>
                <span>{c}</span>
                <X size={12} className="chip-x" />
              </button>
            ))}
            {query.tags?.map((t) => (
              <button key={t} type="button" className="chip is-active" onClick={() => removeIn('tags', t)}>
                <span>#{t}</span>
                <X size={12} className="chip-x" />
              </button>
            ))}
            {query.favorite && (
              <button type="button" className="chip is-active" onClick={() => update({ favorite: false })}>
                <span>избранное</span>
                <X size={12} className="chip-x" />
              </button>
            )}
            {query.drafts && (
              <button type="button" className="chip is-active" onClick={() => update({ drafts: false })}>
                <span>черновики</span>
                <X size={12} className="chip-x" />
              </button>
            )}
            {query.noAnalysis && (
              <button type="button" className="chip is-active" onClick={() => update({ noAnalysis: false })}>
                <span>без AI-анализа</span>
                <X size={12} className="chip-x" />
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={clear}>
              Сбросить всё
            </button>
          </div>
        )}

        {tools.isError && (
          <div className="error-box" role="alert">
            <span>Не удалось загрузить каталог: {errorMessage(tools.error)}</span>
            <button type="button" className="btn btn-sm" onClick={() => void tools.refetch()}>
              Повторить
            </button>
          </div>
        )}

        {tools.isPending && (
          <div className="grid tool-grid" aria-busy="true" aria-label="Загрузка каталога">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton" />
            ))}
          </div>
        )}

        {nothingFound && (
          <EmptyState mood="sad" title="Ничего не нашлось" text="Попробуйте другое слово или снимите часть фильтров.">
            <button type="button" className="btn" onClick={clear}>
              Сбросить фильтры
            </button>
          </EmptyState>
        )}

        {items.length > 0 && (
          <div className="grid tool-grid">
            {items.map((t, i) => (
              <ToolCard key={t.id} tool={t} index={i} activeTags={query.tags ?? []} onToggleFavorite={toggleFavorite} onTagClick={(tag) => toggleIn('tags', tag)} />
            ))}
          </div>
        )}
      </main>
      {adding && <AddToolDialog onClose={() => setAdding(false)} />}
    </div>
  );
}
