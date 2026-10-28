import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Archive, GitFork, Heart, Star } from 'lucide-react';
import type { RepoSummary } from '../../shared/types.js';
import { allTopics } from '../../shared/search.js';
import { Avatar } from './Avatar';
import { StatusBadge } from './StatusBadge';
import { compactNumber, languageColor, relativeDate } from '../lib/format';

interface Props {
  repo: RepoSummary;
  /** Порядковый номер в списке — для нумерации карточек и задержки появления. */
  index?: number;
  activeTopics: string[];
  onToggleFavorite: (repo: RepoSummary) => void;
  onTopicClick: (topic: string) => void;
}

export function RepoCard({ repo, index = 0, activeTopics, onToggleFavorite, onTopicClick }: Props) {
  const summary = repo.analysis.status === 'done' ? repo.analysis.summary : null;
  const text = summary ?? repo.github.description;
  const topics = allTopics(repo).slice(0, 5);
  const active = new Set(activeTopics.map((t) => t.toLocaleLowerCase()));

  return (
    <Link to={`/repo/${repo.id}`} className="card" style={{ '--i': Math.min(index, 10) } as CSSProperties}>
      <span className="card-index" aria-hidden="true">
        № {String(index + 1).padStart(3, '0')}
      </span>
      <div className="card-head">
        <Avatar avatarPath={repo.avatarPath} name={repo.owner} />
        <div className="card-title">
          <div className="card-owner">{repo.owner} /</div>
          <div className="card-name" title={repo.fullName}>
            {repo.name}
          </div>
        </div>
        <button
          type="button"
          className={`card-fav ${repo.user.favorite ? 'is-on' : ''}`}
          title={repo.user.favorite ? 'Убрать из избранного' : 'В избранное'}
          aria-pressed={repo.user.favorite}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleFavorite(repo);
          }}
        >
          <Heart size={17} />
        </button>
      </div>

      <p className={`card-desc ${summary ? 'is-ai' : ''} ${!text ? 'is-none' : ''}`}>{text ?? 'Описание отсутствует'}</p>

      {topics.length > 0 && (
        <div className="chips">
          {topics.map((t) => (
            <button
              key={t}
              type="button"
              className={`chip ${active.has(t.toLocaleLowerCase()) ? 'is-active' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onTopicClick(t);
              }}
            >
              <span>{t}</span>
            </button>
          ))}
        </div>
      )}

      <div className="card-meta">
        {repo.github.language && (
          <span>
            <i className="lang-dot" style={{ background: languageColor(repo.github.language) }} />
            {repo.github.language}
          </span>
        )}
        <span title="Звёзды">
          <Star size={13} />
          {compactNumber(repo.github.stars)}
        </span>
        <span title="Форки">
          <GitFork size={13} />
          {compactNumber(repo.github.forks)}
        </span>
        <span title="Последний push" className="muted">
          {relativeDate(repo.github.pushedAt)}
        </span>
      </div>

      <div className="card-foot">
        <StatusBadge status={repo.user.status} />
        <span className="card-badges">
          {repo.github.archived && (
            <span className="tag tag-warn" title="Репозиторий в архиве">
              <Archive size={10} style={{ verticalAlign: '-1px' }} /> архив
            </span>
          )}
          {repo.analysis.status === 'pending' && <span className="tag tag-ai-pending">AI…</span>}
          {repo.analysis.status === 'failed' && (
            <span className="tag tag-warn" title={repo.analysis.error ?? ''}>
              AI ✕
            </span>
          )}
          {repo.analysis.status === 'none' && <span className="tag">без AI</span>}
        </span>
      </div>
    </Link>
  );
}
