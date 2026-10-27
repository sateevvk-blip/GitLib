import { useState } from 'react';
import { ChevronDown, Heart, Inbox, Sparkles, Library, SlidersHorizontal, X } from 'lucide-react';
import type { Collection, Facets, RepoStatus } from '../../shared/types.js';
import { REPO_STATUSES, STATUS_LABELS } from '../../shared/types.js';
import { useLibraryQuery } from '../lib/libraryQuery';
import { languageColor } from '../lib/format';

interface Props {
  facets: Facets | undefined;
  collections: Collection[] | undefined;
}

const TOPIC_LIMIT = 18;
const LANG_LIMIT = 8;

export function FilterRail({ facets, collections }: Props) {
  const { query, update, toggleIn, clear, filtered } = useLibraryQuery();
  const [moreTopics, setMoreTopics] = useState(false);
  const [moreLangs, setMoreLangs] = useState(false);
  const [topicFilter, setTopicFilter] = useState('');
  const [open, setOpen] = useState(false);

  const activeTopics = new Set((query.topics ?? []).map((t) => t.toLocaleLowerCase()));
  const activeLangs = new Set((query.languages ?? []).map((t) => t.toLocaleLowerCase()));
  const activeStatuses = new Set<RepoStatus>(query.statuses ?? []);

  const topicsAll = facets?.topics ?? [];
  const topicsVisible = topicFilter
    ? topicsAll.filter((t) => t.value.toLocaleLowerCase().includes(topicFilter.toLocaleLowerCase()))
    : moreTopics
      ? topicsAll
      : topicsAll.slice(0, TOPIC_LIMIT);
  const langsAll = facets?.languages ?? [];
  const langsVisible = moreLangs ? langsAll : langsAll.slice(0, LANG_LIMIT);

  return (
    <aside className={`rail ${open ? 'is-open' : ''}`} aria-label="Фильтры">
      <button type="button" className="rail-toggle btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <SlidersHorizontal size={15} />
        Фильтры
        {filtered && <span className="pill-count">вкл.</span>}
        <ChevronDown size={15} style={{ marginLeft: 'auto', transform: open ? 'rotate(180deg)' : undefined }} />
      </button>
      <div className="rail-body">
      <div className="rail-section">
        <div className="label">
          Полки
          {filtered && (
            <button type="button" className="rail-more" onClick={clear}>
              Сбросить
            </button>
          )}
        </div>
        <div className="rail-list">
          <button type="button" className={`rail-item ${!filtered ? 'is-active' : ''}`} onClick={clear}>
            <Library />
            <span className="name">Вся библиотека</span>
            <span className="count">{facets?.total ?? ''}</span>
          </button>
          <button type="button" className={`rail-item ${query.favorite ? 'is-active' : ''}`} onClick={() => update({ favorite: !query.favorite })}>
            <Heart />
            <span className="name">Избранное</span>
            <span className="count">{facets?.favorites ?? ''}</span>
          </button>
          <button
            type="button"
            className={`rail-item ${query.noAnalysis ? 'is-active' : ''}`}
            onClick={() => update({ noAnalysis: !query.noAnalysis })}
            title="Репозитории без готовой AI-сводки"
          >
            <Sparkles />
            <span className="name">Без AI-анализа</span>
            <span className="count">{facets?.noAnalysis ?? ''}</span>
          </button>
        </div>
      </div>

      <div className="rail-section">
        <div className="label">Статус</div>
        <div className="rail-list">
          {REPO_STATUSES.map((s) => (
            <button key={s} type="button" className={`rail-item ${activeStatuses.has(s) ? 'is-active' : ''}`} onClick={() => toggleIn('statuses', s)}>
              <Inbox style={{ opacity: s === 'inbox' ? 0.8 : 0 }} />
              <span className="name">{STATUS_LABELS[s]}</span>
              <span className="count">{facets?.statuses[s] ?? ''}</span>
            </button>
          ))}
        </div>
      </div>

      {collections && collections.length > 0 && (
        <div className="rail-section">
          <div className="label">Коллекции</div>
          <div className="rail-list">
            {collections.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`rail-item ${query.collectionId === c.id ? 'is-active' : ''}`}
                onClick={() => update({ collectionId: query.collectionId === c.id ? '' : c.id })}
              >
                <span className="name">{c.name}</span>
                <span className="count">{c.repoIds.length}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {langsAll.length > 0 && (
        <div className="rail-section">
          <div className="label">Язык</div>
          <div className="rail-list">
            {langsVisible.map((l) => (
              <button
                key={l.value}
                type="button"
                className={`rail-item ${activeLangs.has(l.value.toLocaleLowerCase()) ? 'is-active' : ''}`}
                onClick={() => toggleIn('languages', l.value)}
              >
                <i className="lang-dot" style={{ background: languageColor(l.value) }} />
                <span className="name">{l.value}</span>
                <span className="count">{l.count}</span>
              </button>
            ))}
          </div>
          {langsAll.length > LANG_LIMIT && (
            <button type="button" className="rail-more" onClick={() => setMoreLangs((v) => !v)}>
              {moreLangs ? 'Свернуть' : `Ещё ${langsAll.length - LANG_LIMIT}`}
            </button>
          )}
        </div>
      )}

      {topicsAll.length > 0 && (
        <div className="rail-section">
          <div className="label">Темы</div>
          {topicsAll.length > TOPIC_LIMIT && (
            <div className="rail-chips" style={{ marginBottom: 8 }}>
              <input
                className="input"
                style={{ minHeight: 30, padding: '2px 10px', fontSize: 13 }}
                placeholder="Найти тему…"
                value={topicFilter}
                onChange={(e) => setTopicFilter(e.target.value)}
              />
            </div>
          )}
          <div className="chips rail-chips">
            {topicsVisible.map((t) => {
              const on = activeTopics.has(t.value.toLocaleLowerCase());
              return (
                <button key={t.value} type="button" className={`chip ${on ? 'is-active' : ''}`} onClick={() => toggleIn('topics', t.value)} title={t.value}>
                  <span>{t.value}</span>
                  <span className="chip-count">{t.count}</span>
                  {on && <X size={12} className="chip-x" />}
                </button>
              );
            })}
            {topicsVisible.length === 0 && <span className="muted" style={{ fontSize: 13 }}>Нет таких тем</span>}
          </div>
          {!topicFilter && topicsAll.length > TOPIC_LIMIT && (
            <button type="button" className="rail-more" onClick={() => setMoreTopics((v) => !v)}>
              {moreTopics ? 'Свернуть' : `Ещё ${topicsAll.length - TOPIC_LIMIT}`}
            </button>
          )}
        </div>
      )}
      </div>
    </aside>
  );
}
