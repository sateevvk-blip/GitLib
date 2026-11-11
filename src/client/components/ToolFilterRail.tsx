import { useState } from 'react';
import { ChevronDown, FilePen, Heart, Library, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import type { ToolFacets } from '../../shared/types.js';
import { fold } from '../../shared/search.js';
import { useToolsQuery } from '../lib/toolsQuery';

interface Props {
  facets: ToolFacets | undefined;
}

const TAG_LIMIT = 18;
const CATEGORY_LIMIT = 10;

export function ToolFilterRail({ facets }: Props) {
  const { query, update, toggleIn, clear, filtered } = useToolsQuery();
  const [moreTags, setMoreTags] = useState(false);
  const [moreCategories, setMoreCategories] = useState(false);
  const [tagFilter, setTagFilter] = useState('');
  const [open, setOpen] = useState(false);

  const activeCategories = new Set((query.categories ?? []).map(fold));
  const activeTags = new Set((query.tags ?? []).map(fold));

  const categoriesAll = facets?.categories ?? [];
  const categoriesVisible = moreCategories ? categoriesAll : categoriesAll.slice(0, CATEGORY_LIMIT);
  const tagsAll = facets?.tags ?? [];
  const tagsVisible = tagFilter ? tagsAll.filter((t) => fold(t.value).includes(fold(tagFilter))) : moreTags ? tagsAll : tagsAll.slice(0, TAG_LIMIT);

  return (
    <aside className={`rail ${open ? 'is-open' : ''}`} aria-label="Фильтры инструментов">
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
              <span className="name">Все инструменты</span>
              <span className="count">{facets?.total ?? ''}</span>
            </button>
            <button type="button" className={`rail-item ${query.favorite ? 'is-active' : ''}`} aria-pressed={query.favorite} onClick={() => update({ favorite: !query.favorite })}>
              <Heart />
              <span className="name">Избранное</span>
              <span className="count">{facets?.favorites ?? ''}</span>
            </button>
            <button type="button" className={`rail-item ${query.drafts ? 'is-active' : ''}`} aria-pressed={query.drafts} onClick={() => update({ drafts: !query.drafts })} title="Карточки, которые вы ещё не подтвердили">
              <FilePen />
              <span className="name">Черновики</span>
              <span className="count">{facets?.drafts ?? ''}</span>
            </button>
            <button type="button" className={`rail-item ${query.noAnalysis ? 'is-active' : ''}`} aria-pressed={query.noAnalysis} onClick={() => update({ noAnalysis: !query.noAnalysis })} title="Инструменты без готовой AI-сводки">
              <Sparkles />
              <span className="name">Без AI-анализа</span>
              <span className="count">{facets?.noAnalysis ?? ''}</span>
            </button>
          </div>
        </div>

        {categoriesAll.length > 0 && (
          <div className="rail-section">
            <div className="label">Категории</div>
            <div className="rail-list">
              {categoriesVisible.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className={`rail-item ${activeCategories.has(fold(c.value)) ? 'is-active' : ''}`}
                  aria-pressed={activeCategories.has(fold(c.value))}
                  onClick={() => toggleIn('categories', c.value)}
                  title={c.value}
                >
                  <span className="name">{c.value}</span>
                  <span className="count">{c.count}</span>
                </button>
              ))}
            </div>
            {categoriesAll.length > CATEGORY_LIMIT && (
              <button type="button" className="rail-more" onClick={() => setMoreCategories((v) => !v)}>
                {moreCategories ? 'Свернуть' : `Ещё ${categoriesAll.length - CATEGORY_LIMIT}`}
              </button>
            )}
          </div>
        )}

        {tagsAll.length > 0 && (
          <div className="rail-section">
            <div className="label">Теги</div>
            {tagsAll.length > TAG_LIMIT && (
              <div className="rail-chips" style={{ marginBottom: 8 }}>
                <input
                  className="input"
                  style={{ minHeight: 30, padding: '2px 10px', fontSize: 13 }}
                  placeholder="Найти тег…"
                  aria-label="Найти тег"
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                />
              </div>
            )}
            <div className="chips rail-chips">
              {tagsVisible.map((t) => {
                const on = activeTags.has(fold(t.value));
                return (
                  <button key={t.value} type="button" className={`chip ${on ? 'is-active' : ''}`} aria-pressed={on} onClick={() => toggleIn('tags', t.value)} title={t.value}>
                    <span>{t.value}</span>
                    <span className="chip-count">{t.count}</span>
                    {on && <X size={12} className="chip-x" />}
                  </button>
                );
              })}
              {tagsVisible.length === 0 && (
                <span className="muted" style={{ fontSize: 13 }}>
                  Нет таких тегов
                </span>
              )}
            </div>
            {!tagFilter && tagsAll.length > TAG_LIMIT && (
              <button type="button" className="rail-more" onClick={() => setMoreTags((v) => !v)}>
                {moreTags ? 'Свернуть' : `Ещё ${tagsAll.length - TAG_LIMIT}`}
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
