import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import type { ToolSummary } from '../../shared/types.js';
import { isOverridden, toolCategory, toolDescription, toolField, toolLetter, toolTags, toolTitle } from '../../shared/tools.js';
import { fold } from '../../shared/search.js';
import { Avatar } from './Avatar';

interface Props {
  tool: ToolSummary;
  /** Порядковый номер в списке — для нумерации карточек и задержки появления. */
  index?: number;
  activeTags: string[];
  onToggleFavorite: (tool: ToolSummary) => void;
  onTagClick: (tag: string) => void;
  /** Без превью — для подбора под задачу. */
  compact?: boolean;
}

/** Превью-картинка; если её нет или она не загрузилась — плитка с буквой домена на миллиметровке. */
function Preview({ path, letter }: { path: string | null; letter: string }) {
  const [failed, setFailed] = useState(false);
  if (!path || failed) {
    return (
      <div className="tool-thumb tool-thumb-fallback" aria-hidden="true">
        <span>{letter}</span>
      </div>
    );
  }
  return (
    <div className="tool-thumb" aria-hidden="true">
      <img src={`/${path}`} alt="" loading="lazy" onError={() => setFailed(true)} />
    </div>
  );
}

export function ToolCard({ tool, index = 0, activeTags, onToggleFavorite, onTagClick, compact = false }: Props) {
  const title = toolTitle(tool);
  const text = toolField(tool, 'summary') ?? toolDescription(tool);
  const category = toolCategory(tool);
  const tags = toolTags(tool).slice(0, 4);
  const active = new Set(activeTags.map(fold));
  const { analysis, source } = tool;
  const previewPath = tool.user.imagePath ?? source.imagePath;
  const letter = toolLetter(tool);

  return (
    <Link to={`/tools/${tool.id}`} className={`card tool-card${compact ? ' tool-card-compact' : ''}`} style={{ '--i': Math.min(index, 10) } as CSSProperties}>
      <span className="card-index" aria-hidden="true">
        № {String(index + 1).padStart(3, '0')}
      </span>
      {!compact && <Preview path={previewPath} letter={letter} />}
      <div className="card-head">
        {/* Без иконки и без картинки буква уже стоит в превью — второй раз не повторяем */}
        {(compact || source.iconPath || previewPath) && <Avatar avatarPath={source.iconPath} name={letter} />}
        <div className="card-title">
          <div className="card-name tool-name" title={title}>
            {title}
          </div>
          <div className="card-owner tool-domain" title={tool.domain}>
            {tool.domain}
          </div>
        </div>
        <button
          type="button"
          className={`card-fav ${tool.user.favorite ? 'is-on' : ''}`}
          title={tool.user.favorite ? 'Убрать из избранного' : 'В избранное'}
          aria-label={tool.user.favorite ? `Убрать из избранного: ${title}` : `В избранное: ${title}`}
          aria-pressed={tool.user.favorite}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleFavorite(tool);
          }}
        >
          <Star size={17} />
        </button>
      </div>

      <p className={`card-desc tool-desc ${!isOverridden(tool, 'summary') && analysis.status === 'done' && toolField(tool, 'summary') ? 'is-ai' : ''} ${!text ? 'is-none' : ''}`}>
        {text ?? 'Описание отсутствует'}
      </p>

      {tags.length > 0 && (
        <div className="chips">
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              className={`chip ${active.has(fold(t)) ? 'is-active' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onTagClick(t);
              }}
            >
              <span>{t}</span>
            </button>
          ))}
        </div>
      )}

      <div className="card-foot">
        <span className="tool-category" title={category ?? undefined}>
          {category ?? 'без категории'}
        </span>
        <span className="card-badges">
          {!tool.user.confirmed && (
            <span className="tag tag-draft" title="Проверьте карточку и подтвердите">
              черновик
            </span>
          )}
          {source.status === 'failed' && (
            <span className="tag tag-warn" title={source.error ?? 'Страницу не удалось загрузить'}>
              без страницы
            </span>
          )}
          {analysis.status === 'pending' && <span className="tag tag-ai-pending">анализируется…</span>}
          {analysis.status === 'failed' && (
            <span className="tag tag-warn" title={analysis.error ?? ''}>
              AI ✕
            </span>
          )}
          {analysis.status === 'none' && <span className="tag">без AI</span>}
        </span>
      </div>
    </Link>
  );
}
